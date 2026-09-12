// ============================================================================
// PATTERN: FACADE — NotificationDispatcher hides "figure out which channels
// this event type needs, build the message, invoke each adapter, tolerate
// individual channel failures" behind one simple `dispatch(event)` call for
// the Kafka consumer to use.
// ============================================================================

import { EventEnvelope, KAFKA_TOPICS, createLogger } from '@urbannest/shared';
import { EmailChannelAdapter, SmsChannelAdapter, PushChannelAdapter, NotificationChannel, NotificationMessage } from '../adapter/ChannelAdapters';

const logger = createLogger('notification-service:dispatcher');

const CHANNELS: NotificationChannel[] = [new EmailChannelAdapter(), new SmsChannelAdapter(), new PushChannelAdapter()];

function messageForEvent(envelope: EventEnvelope<any>): NotificationMessage | null {
  const p = envelope.payload;
  switch (envelope.eventType) {
    case KAFKA_TOPICS.BOOKING_CREATED:
      return { userId: p.userId, title: 'Seats held!', body: `Your seats for booking ${p.id} are held for 5 minutes — complete payment to confirm.` };
    case KAFKA_TOPICS.BOOKING_CONFIRMED:
      return { userId: p.user_id ?? p.userId, title: 'Booking confirmed', body: `Your booking ${p.id} is confirmed. Enjoy the show!` };
    case KAFKA_TOPICS.BOOKING_CANCELLED:
      return { userId: p.user_id ?? p.userId, title: 'Booking cancelled', body: `Your booking ${p.id} has been cancelled.` };
    case KAFKA_TOPICS.PAYMENT_PROCESSED:
      return { userId: p.userId ?? 'unknown', title: 'Payment received', body: `Payment for booking ${p.bookingId} was processed.` };
    default:
      return null;
  }
}

export async function dispatch(envelope: EventEnvelope<any>): Promise<{ channel: string; ok: boolean; error?: string }[]> {
  const message = messageForEvent(envelope);
  if (!message) {
    logger.debug('No notification mapping for event type, skipping', { eventType: envelope.eventType });
    return [];
  }

  const results = await Promise.all(
    CHANNELS.map(async (channel) => {
      try {
        await channel.send(message);
        return { channel: channel.name, ok: true };
      } catch (err) {
        logger.error('Channel send failed', { channel: channel.name, error: (err as Error).message });
        return { channel: channel.name, ok: false, error: (err as Error).message };
      }
    }),
  );
  return results;
}
