// ============================================================================
// BOOKING REQUEST CONSUMER — API 2. Consumes `booking.requests`, does the
// real work (validation chain -> cache-aside against Redis -> Postgres
// transaction), then replies via Redis Pub/Sub and pushes live updates.
// ----------------------------------------------------------------------------
// Run as N replicas in the SAME Kafka consumer group ('booking-workers'):
// Kafka automatically partitions `booking.requests` across replicas, so
// scaling this service horizontally is just `kubectl scale` — no code
// change, no coordination logic to write ourselves. This is the practical
// payoff of "Kafka as the request bus" beyond the CQRS-looking API split.
// Postgres sharding has been removed — see db/pool.ts — so there's no
// shard-routing step here anymore, just a single connection pool.
// ============================================================================

import { Kafka, logLevel } from 'kafkajs';
import { v4 as uuidv4 } from 'uuid';
import { createLogger, KAFKA_TOPICS } from '@urbannest/shared';
import { pool, withTransaction, checkDbHealth } from '../db/pool';
import { getCachedSeatMap, setCachedSeatMap, getCachedEvent, setCachedEvent, invalidateSeatMap, checkCacheHealth } from '../cache/cache';
import { acquireAllOrNothing, releaseSeatLocks } from '../cache/seatLock';
import { sendReply, pushBookingUpdate, pushSeatMapUpdate } from '../ws/replyPublisher';
import { publishDomainEvent } from '../kafka/domainEventProducer';
import { BookingBuilder, SeatSelection } from '../patterns/builder/BookingBuilder';
import { nextBookingStatus, BookingStatus } from '../patterns/state/BookingState';
import { pickStrategy } from '../patterns/strategy/PricingStrategy';
import { buildDefaultValidationChain } from '../patterns/chain/ValidationChain';
import { priceAddOns } from '../patterns/decorator/AddOnDecorator';
import { seatAvailabilitySubject } from '../patterns/observer/SeatAvailabilitySubject';
import { createOrder, verifyPaymentSignature } from '../payments/razorpay';

const logger = createLogger('booking-worker:consumer');

const kafka = new Kafka({
  clientId: 'booking-worker',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: logLevel.WARN,
  retry: { retries: 8, initialRetryTime: 300 },
});

const REQUEST_TOPIC = 'booking.requests';
const CONSUMER_GROUP = 'booking-workers';
const MAX_RETRIES = 3;

interface RequestMessage<T = any> {
  requestId: string;
  kind: string;
  payload: T;
  requestedAt: string;
}

// ---- Individual request-kind handlers --------------------------------------

async function handleListVenues() {
  const { rows } = await pool.query('SELECT * FROM venues');
  return { data: rows };
}

async function handleListEvents() {
  const { rows } = await pool.query('SELECT * FROM events ORDER BY starts_at');
  const data = rows.map((e: any) => ({
    id: e.id,
    title: e.title,
    venueId: e.venue_id,
    startsAt: e.starts_at,
    endsAt: e.ends_at,
    basePrice: Number(e.base_price),
    bookingOpen: e.booking_open,
  }));
  return { data };
}

async function handleGetEvent(payload: { eventId: string }) {
  const cached = await getCachedEvent(payload.eventId);
  if (cached) return { data: cached, servedFromCache: true };

  const result = await withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM events WHERE id = $1', [payload.eventId]);
    return rows[0] ?? null;
  });
  if (result) await setCachedEvent(payload.eventId, result);
  return { data: result, servedFromCache: false };
}

async function handleGetSeatMap(payload: { eventId: string }) {
  const cached = await getCachedSeatMap<any>(payload.eventId);
  if (cached) return { data: cached, servedFromCache: true };

  const result = await withTransaction(async (client) => {
    const eventRes = await client.query('SELECT venue_id FROM events WHERE id = $1', [payload.eventId]);
    if (eventRes.rows.length === 0) throw new Error(`Event ${payload.eventId} not found`);
    const venueId = eventRes.rows[0].venue_id;

    const seatsRes = await client.query('SELECT * FROM seats WHERE venue_id = $1 ORDER BY row_label, seat_number', [venueId]);
    const bookedRes = await client.query(
      `SELECT bs.seat_id FROM booking_seats bs
       JOIN bookings b ON b.id = bs.booking_id
       WHERE b.event_id = $1 AND b.status IN ('SEATS_LOCKED','PAYMENT_PENDING','CONFIRMED')`,
      [payload.eventId],
    );
    const bookedSeatIds = new Set(bookedRes.rows.map((r: any) => r.seat_id));

    const seats = seatsRes.rows.map((s: any) => ({
      id: s.id,
      rowLabel: s.row_label,
      seatNumber: s.seat_number,
      tier: s.tier,
      status: bookedSeatIds.has(s.id) ? 'BOOKED' : 'AVAILABLE',
    }));

    return { eventId: payload.eventId, venueId, seats };
  });

  await setCachedSeatMap(payload.eventId, result);
  return { data: result, servedFromCache: false };
}

async function handleGetBooking(payload: { bookingId: string; eventId: string }) {
  const result = await withTransaction(async (client) => {
    const bRes = await client.query('SELECT * FROM bookings WHERE id = $1 AND event_id = $2', [payload.bookingId, payload.eventId]);
    if (bRes.rows.length === 0) return null;
    const booking = bRes.rows[0];
    const seatsRes = await client.query('SELECT seat_id FROM booking_seats WHERE booking_id = $1', [booking.id]);
    const addonsRes = await client.query('SELECT addon_code FROM booking_addons WHERE booking_id = $1', [booking.id]);
    return {
      id: booking.id,
      userId: booking.user_id,
      eventId: booking.event_id,
      status: booking.status,
      basePrice: Number(booking.base_price),
      finalPrice: Number(booking.final_price),
      seatIds: seatsRes.rows.map((r: any) => r.seat_id),
      addOnCodes: addonsRes.rows.map((r: any) => r.addon_code),
      createdAt: booking.created_at,
      updatedAt: booking.updated_at,
    };
  });
  return { data: result };
}

async function handleListMyBookings(payload: { userId: string }) {
  const { rows } = await pool.query('SELECT * FROM bookings WHERE user_id = $1 ORDER BY created_at DESC', [payload.userId]);
  const data = rows.map((b: any) => ({
    id: b.id,
    userId: b.user_id,
    eventId: b.event_id,
    status: b.status,
    basePrice: Number(b.base_price),
    finalPrice: Number(b.final_price),
    seatIds: [] as string[],
    addOnCodes: [] as string[],
    createdAt: b.created_at,
    updatedAt: b.updated_at,
  }));
  return { data };
}

async function handleCreateBooking(payload: {
  userId: string;
  eventId: string;
  seatIds: string[];
  addOnCodes?: string[];
  discountCode?: string;
  pricingStrategy?: string;
}) {
  const chain = buildDefaultValidationChain();
  const validation = chain.handle({
    userId: payload.userId,
    eventId: payload.eventId,
    seatIds: payload.seatIds,
    eventBookingOpen: true, // re-validated against real event row inside the transaction below
  });
  if (!validation.passed) throw new Error(validation.reason);

  const fencingToken = uuidv4();
  const lockResult = await acquireAllOrNothing(payload.eventId, payload.seatIds, fencingToken);
  if (!lockResult.success) {
    throw new Error(`Could not lock seats: ${lockResult.failedSeats.join(', ')} already held by another user`);
  }

  try {
    const booking = await withTransaction(async (client) => {
      const eventRes = await client.query('SELECT * FROM events WHERE id = $1', [payload.eventId]);
      if (eventRes.rows.length === 0) throw new Error(`Event ${payload.eventId} not found`);
      const event = eventRes.rows[0];
      if (!event.booking_open) throw new Error('Booking window is closed for this event');

      const seatsRes = await client.query('SELECT * FROM seats WHERE id = ANY($1::uuid[])', [payload.seatIds]);
      if (seatsRes.rows.length !== payload.seatIds.length) throw new Error('One or more seat IDs are invalid');

      const builder = new BookingBuilder().setUser(payload.userId).setEvent(payload.eventId);
      const selections: SeatSelection[] = seatsRes.rows.map((s: any) => ({
        seatId: s.id,
        rowLabel: s.row_label,
        seatNumber: s.seat_number,
        tier: s.tier,
      }));
      for (const seat of selections) builder.addSeat(seat, Number(event.base_price));
      for (const code of payload.addOnCodes ?? []) {
        const priced = priceAddOns([code])[0];
        if (priced) builder.addOn(priced);
      }
      if (payload.discountCode) builder.applyDiscountCode(payload.discountCode);

      const draft = builder.build();
      const hoursUntilEvent = (new Date(event.starts_at).getTime() - Date.now()) / 3_600_000;
      const pricingCtx = {
        demandFactor: 0.5,
        isWeekend: [0, 6].includes(new Date(event.starts_at).getDay()),
        hoursUntilEvent,
      };
      const strategy = pickStrategy(payload.pricingStrategy, pricingCtx);
      const seatsPrice = strategy.calculate(selections, Number(event.base_price), pricingCtx);
      const addOnsPrice = draft.addOns.reduce((s, a) => s + a.price, 0);
      const finalPrice = seatsPrice + addOnsPrice;

      const status: BookingStatus = nextBookingStatus('CREATED', 'LOCK_SEATS');
      const now = new Date();
      const nowIso = now.toISOString();
      const bookingRes = await client.query(
        `INSERT INTO bookings (user_id, event_id, status, base_price, final_price, discount_code, pricing_strategy, history, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9) RETURNING *`,
        [
          payload.userId,
          payload.eventId,
          status,
          draft.basePrice,
          finalPrice,
          draft.discountCode ?? null,
          strategy.name,
          JSON.stringify([{ status: 'CREATED', at: nowIso }, { status, at: nowIso }]),
          now,
        ],
      );
      const bookingRow = bookingRes.rows[0];

      for (const seatId of payload.seatIds) {
        await client.query(
          'INSERT INTO booking_seats (booking_id, booking_created_at, seat_id) VALUES ($1, $2, $3)',
          [bookingRow.id, now, seatId],
        );
        await client.query(
          `INSERT INTO seat_locks (seat_id, event_id, booking_id, expires_at)
           VALUES ($1, $2, $3, now() + interval '5 minutes')
           ON CONFLICT (seat_id, event_id) DO UPDATE SET booking_id = $3, locked_at = now(), expires_at = now() + interval '5 minutes'`,
          [seatId, payload.eventId, bookingRow.id],
        );
      }
      for (const addOn of draft.addOns) {
        await client.query(
          'INSERT INTO booking_addons (booking_id, booking_created_at, addon_code, price) VALUES ($1, $2, $3, $4)',
          [bookingRow.id, now, addOn.code, addOn.price],
        );
      }

      for (const seatId of payload.seatIds) {
        seatAvailabilitySubject.notify({ eventId: payload.eventId, seatId, type: 'LOCKED', at: nowIso });
      }

      return {
        id: bookingRow.id,
        userId: bookingRow.user_id,
        eventId: bookingRow.event_id,
        status: bookingRow.status,
        basePrice: Number(bookingRow.base_price),
        finalPrice: Number(bookingRow.final_price),
        seatIds: payload.seatIds,
        addOnCodes: draft.addOns.map((a) => a.code),
        createdAt: bookingRow.created_at,
        updatedAt: bookingRow.updated_at,
      };
    });

    // Cache invalidation: the seat map just changed, so drop the stale cached copy.
    await invalidateSeatMap(payload.eventId);

    await publishDomainEvent(KAFKA_TOPICS.BOOKING_CREATED, booking, booking.id);
    await pushBookingUpdate({ bookingId: booking.id, eventId: booking.eventId, status: booking.status, message: 'Booking created, seats held for 5 minutes' });
    for (const seatId of payload.seatIds) {
      await pushSeatMapUpdate({ eventId: payload.eventId, seatId, status: 'LOCKED' });
    }

    return { data: { requestId: uuidv4(), bookingId: booking.id, message: `Booking ${booking.id} created` } };
  } catch (err) {
    await releaseSeatLocks(payload.eventId, payload.seatIds, fencingToken);
    throw err;
  }
}

async function handleCreatePaymentOrder(payload: { bookingId: string; eventId: string; userId: string }) {
  const booking = await withTransaction(async (client) => {
    const res = await client.query('SELECT * FROM bookings WHERE id = $1 AND event_id = $2', [payload.bookingId, payload.eventId]);
    if (res.rows.length === 0) throw new Error('Booking not found');
    const current = res.rows[0];
    if (current.user_id !== payload.userId) throw new Error('This booking does not belong to you');
    if (current.status !== 'SEATS_LOCKED') throw new Error(`Cannot start payment for a booking in status ${current.status}`);
    return current;
  });

  const order = await createOrder(Number(booking.final_price), booking.id);

  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO payment_orders (booking_id, booking_created_at, user_id, razorpay_order_id, amount, currency)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [booking.id, booking.created_at, payload.userId, order.id, booking.final_price, order.currency],
    );
  });

  return {
    data: {
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID || '',
    },
  };
}

async function handleConfirmPayment(payload: {
  bookingId: string;
  eventId: string;
  userId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  // Trust boundary: nothing below runs unless the signature genuinely
  // proves Razorpay processed this exact order+payment pair (see
  // verifyPaymentSignature's doc comment) — a client claiming success
  // without paying cannot get past this check.
  const signatureValid = verifyPaymentSignature(payload.razorpayOrderId, payload.razorpayPaymentId, payload.razorpaySignature);
  if (!signatureValid) {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE payment_orders SET status = 'VERIFICATION_FAILED', razorpay_payment_id = $1, updated_at = now() WHERE razorpay_order_id = $2`,
        [payload.razorpayPaymentId, payload.razorpayOrderId],
      );
    });
    throw new Error('Payment verification failed — signature mismatch');
  }

  const booking = await withTransaction(async (client) => {
    const orderRes = await client.query('SELECT * FROM payment_orders WHERE razorpay_order_id = $1', [payload.razorpayOrderId]);
    if (orderRes.rows.length === 0) throw new Error('Payment order not found');
    const order = orderRes.rows[0];
    if (order.booking_id !== payload.bookingId) throw new Error('Payment order does not match booking');
    if (order.user_id !== payload.userId) throw new Error('This payment order does not belong to you');

    const res = await client.query('SELECT * FROM bookings WHERE id = $1 AND event_id = $2', [payload.bookingId, payload.eventId]);
    if (res.rows.length === 0) throw new Error('Booking not found');
    const current = res.rows[0];
    // Ownership check: booking-api's resolver already proved the caller is
    // authenticated (see requireAuth() there), but not that this specific
    // booking is theirs. That's a DB-level fact, so it's enforced here
    // against the authoritative row, not in the resolver.
    if (current.user_id !== payload.userId) throw new Error('This booking does not belong to you');
    const paid = nextBookingStatus(current.status as BookingStatus, 'PAY');
    const confirmed = nextBookingStatus(paid, 'CONFIRM');
    const now = new Date().toISOString();
    const history = [...current.history, { status: paid, at: now }, { status: confirmed, at: now }];
    const updated = await client.query('UPDATE bookings SET status = $1, history = $2, updated_at = now() WHERE id = $3 RETURNING *', [
      confirmed,
      JSON.stringify(history),
      current.id,
    ]);

    await client.query(
      `UPDATE payment_orders SET status = 'PAID', razorpay_payment_id = $1, updated_at = now() WHERE razorpay_order_id = $2`,
      [payload.razorpayPaymentId, payload.razorpayOrderId],
    );

    return updated.rows[0];
  });

  await publishDomainEvent(KAFKA_TOPICS.PAYMENT_PROCESSED, { bookingId: booking.id, eventId: booking.event_id }, booking.id);
  await publishDomainEvent(KAFKA_TOPICS.BOOKING_CONFIRMED, booking, booking.id);
  await pushBookingUpdate({ bookingId: booking.id, eventId: booking.event_id, status: booking.status, message: 'Payment confirmed' });
  await invalidateSeatMap(payload.eventId);

  return { data: { requestId: uuidv4(), message: 'Payment confirmed' } };
}

async function handleCancelBooking(payload: { bookingId: string; eventId: string; userId: string }) {
  const result = await withTransaction(async (client) => {
    const res = await client.query('SELECT * FROM bookings WHERE id = $1 AND event_id = $2', [payload.bookingId, payload.eventId]);
    if (res.rows.length === 0) throw new Error('Booking not found');
    const current = res.rows[0];
    // Same ownership check as handleConfirmPayment above — see its comment.
    if (current.user_id !== payload.userId) throw new Error('This booking does not belong to you');
    const cancelled = nextBookingStatus(current.status as BookingStatus, 'CANCEL');
    const now = new Date().toISOString();
    const history = [...current.history, { status: cancelled, at: now }];
    const updated = await client.query('UPDATE bookings SET status = $1, history = $2, updated_at = now() WHERE id = $3 RETURNING *', [
      cancelled,
      JSON.stringify(history),
      current.id,
    ]);
    const seatsRes = await client.query('SELECT seat_id FROM booking_seats WHERE booking_id = $1', [current.id]);
    await client.query('DELETE FROM seat_locks WHERE booking_id = $1', [current.id]);
    return { booking: updated.rows[0], seatIds: seatsRes.rows.map((r: any) => r.seat_id) };
  });

  const booking = result.booking;
  await publishDomainEvent(KAFKA_TOPICS.BOOKING_CANCELLED, booking, booking.id);
  await pushBookingUpdate({ bookingId: booking.id, eventId: booking.event_id, status: booking.status, message: 'Booking cancelled' });
  await invalidateSeatMap(payload.eventId);

  return { data: { requestId: uuidv4(), message: 'Booking cancelled' } };
}

async function handleCreateShortLink(payload: { targetUrl: string }) {
  const code = uuidv4().slice(0, 8);
  await withTransaction(async (client) => {
    await client.query('INSERT INTO short_links (code, target_url) VALUES ($1, $2)', [code, payload.targetUrl]);
  });
  const base = process.env.PUBLIC_SHORT_URL_BASE || 'http://localhost:8080/s';
  return { data: { code, targetUrl: payload.targetUrl, shortUrl: `${base}/${code}` } };
}

async function handleResolveShortLink(payload: { code: string }) {
  const result = await withTransaction(async (client) => {
    const res = await client.query('UPDATE short_links SET hit_count = hit_count + 1 WHERE code = $1 RETURNING target_url', [
      payload.code,
    ]);
    return res.rows[0] ?? null;
  });
  return { data: result ? { targetUrl: result.target_url } : null };
}

// ---- Dispatch table ---------------------------------------------------------

const HANDLERS: Record<string, (payload: any) => Promise<{ data: any; servedFromCache?: boolean }>> = {
  LIST_VENUES: handleListVenues as any,
  LIST_EVENTS: handleListEvents as any,
  GET_EVENT: handleGetEvent,
  GET_SEAT_MAP: handleGetSeatMap,
  GET_BOOKING: handleGetBooking,
  LIST_MY_BOOKINGS: handleListMyBookings,
  CREATE_BOOKING: handleCreateBooking,
  CREATE_PAYMENT_ORDER: handleCreatePaymentOrder,
  CONFIRM_PAYMENT: handleConfirmPayment,
  CANCEL_BOOKING: handleCancelBooking,
  CREATE_SHORT_LINK: handleCreateShortLink,
  RESOLVE_SHORT_LINK: handleResolveShortLink,
};

// ---- Consumer loop with retry + dead-letter --------------------------------

const DLQ_TOPIC = 'booking.requests.dlq';

export async function startConsumer(): Promise<void> {
  const consumer = kafka.consumer({ groupId: CONSUMER_GROUP });
  const dlqProducer = kafka.producer();
  await consumer.connect();
  await dlqProducer.connect();
  await consumer.subscribe({ topic: REQUEST_TOPIC, fromBeginning: false });

  logger.info('booking-worker consumer started', { group: CONSUMER_GROUP });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      let request: RequestMessage;
      try {
        request = JSON.parse(message.value.toString());
      } catch {
        logger.error('Malformed request message, dropping');
        return;
      }

      let attempt = 0;
      let lastError: Error | null = null;
      while (attempt < MAX_RETRIES) {
        attempt++;
        try {
          const handler = HANDLERS[request.kind];
          if (!handler) throw new Error(`No handler registered for request kind '${request.kind}'`);

          const { data, servedFromCache } = await handler(request.payload);
          await sendReply(request.requestId, { requestId: request.requestId, ok: true, data, servedFromCache });
          return;
        } catch (err) {
          lastError = err as Error;
          logger.warn('Handler attempt failed', { kind: request.kind, attempt, error: lastError.message });
          if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 200 * attempt));
        }
      }

      // Exhausted retries — reply with the error so the caller doesn't just
      // time out blindly, AND publish to a dead-letter topic for later
      // inspection/replay (a real at-least-once delivery pattern).
      await sendReply(request.requestId, { requestId: request.requestId, ok: false, error: lastError?.message ?? 'Unknown error' });
      await dlqProducer.send({
        topic: DLQ_TOPIC,
        messages: [{ key: request.requestId, value: JSON.stringify({ request, error: lastError?.message }) }],
      });
      logger.error('Request failed after max retries, sent to DLQ', { kind: request.kind, requestId: request.requestId });
    },
  });
}

export async function healthSnapshot() {
  const [db, cache] = await Promise.all([checkDbHealth(), checkCacheHealth()]);
  return { db, cache };
}
