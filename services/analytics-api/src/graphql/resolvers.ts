import { pool } from '../db/pool';
import { getOrCompute } from '../cache/statsCache';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('analytics-api:resolvers');

const VENUE_STATS_TTL_SEC = 30;
const EVENT_STATS_TTL_SEC = 30;
const PLATFORM_STATS_TTL_SEC = 60;
const SEARCH_TTL_SEC = 30;

async function venueStatsFor(venueId: string) {
  return getOrCompute(`stats:venue:${venueId}`, VENUE_STATS_TTL_SEC, async () => {
    const { rows } = await pool.query<{ status: string; final_price: string }>(
      `SELECT b.status, b.final_price
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       WHERE e.venue_id = $1`,
      [venueId],
    );

    let totalBookings = 0;
    let confirmedBookings = 0;
    let cancelledBookings = 0;
    let totalRevenue = 0;

    for (const row of rows) {
      totalBookings += 1;
      if (row.status === 'CONFIRMED') {
        confirmedBookings += 1;
        totalRevenue += Number(row.final_price);
      }
      if (row.status === 'CANCELLED') cancelledBookings += 1;
    }

    const seatsRes = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM seats WHERE venue_id = $1', [venueId]);
    const totalSeats = Number(seatsRes.rows[0]?.count ?? 0);

    const bookedRes = await pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT bs.seat_id) AS count
       FROM booking_seats bs
       JOIN bookings b ON b.id = bs.booking_id
       JOIN events e ON e.id = b.event_id
       WHERE e.venue_id = $1 AND b.status = 'CONFIRMED'`,
      [venueId],
    );
    const seatsSold = Number(bookedRes.rows[0]?.count ?? 0);

    return {
      venueId,
      totalBookings,
      confirmedBookings,
      cancelledBookings,
      totalRevenue,
      occupancyRate: totalSeats > 0 ? Math.min(1, seatsSold / totalSeats) : 0,
    };
  });
}

async function eventStatsFor(eventId: string) {
  return getOrCompute(`stats:event:${eventId}`, EVENT_STATS_TTL_SEC, async () => {
    const { rows } = await pool.query<{ status: string; final_price: string }>(
      `SELECT status, final_price
       FROM bookings
       WHERE event_id = $1`,
      [eventId],
    );

    let totalBookings = 0;
    let confirmedBookings = 0;
    let totalRevenue = 0;

    for (const row of rows) {
      totalBookings += 1;
      if (row.status === 'CONFIRMED') {
        confirmedBookings += 1;
        totalRevenue += Number(row.final_price);
      }
    }

    const eventRows = await pool.query<{ venue_id: string }>('SELECT venue_id FROM events WHERE id = $1', [eventId]);
    const venueId = eventRows.rows[0]?.venue_id;
    let totalSeats = 0;
    if (venueId) {
      const seatsRes = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM seats WHERE venue_id = $1', [venueId]);
      totalSeats = Number(seatsRes.rows[0]?.count ?? 0);
    }

    const bookedRes = await pool.query<{ count: string }>(
      `SELECT COUNT(DISTINCT bs.seat_id) AS count
       FROM booking_seats bs
       JOIN bookings b ON b.id = bs.booking_id
       WHERE b.event_id = $1 AND b.status IN ('SEATS_LOCKED', 'PAYMENT_PENDING', 'CONFIRMED')`,
      [eventId],
    );
    const seatsSold = Number(bookedRes.rows[0]?.count ?? 0);
    const seatsRemaining = Math.max(totalSeats - seatsSold, 0);

    return {
      eventId,
      totalBookings,
      confirmedBookings,
      totalRevenue,
      seatsSold,
      seatsRemaining,
    };
  });
}

async function searchAll(query: string, limit: number) {
  return getOrCompute(`stats:search:${query}:${limit}`, SEARCH_TTL_SEC, async () => {
    const like = `%${query}%`;
    const { rows } = await pool.query<{ id: string; title: string; subtitle: string; kind: string }>(
      `(SELECT 'EVENT' AS kind, e.id, e.title AS title, to_char(e.starts_at, 'YYYY-MM-DD') AS subtitle
        FROM events e WHERE e.title ILIKE $1 LIMIT $2)
       UNION ALL
       (SELECT 'VENUE' AS kind, v.id, v.name AS title, (v.venue_type || ' · ' || v.city) AS subtitle
        FROM venues v WHERE v.name ILIKE $1 LIMIT $2)`,
      [like, limit],
    );
    return rows.slice(0, limit);
  });
}

export const resolvers = {
  Query: {
    search: async (_: unknown, args: { query: string; limit?: number }) => {
      const q = args.query.trim();
      if (!q) return [];
      return searchAll(q, Math.min(args.limit ?? 10, 25));
    },
    venueStats: async (_: unknown, args: { venueId: string }) => venueStatsFor(args.venueId),
    eventStats: async (_: unknown, args: { eventId: string }) => eventStatsFor(args.eventId),

    platformStats: async () => {
      return getOrCompute('stats:platform', PLATFORM_STATS_TTL_SEC, async () => {

        const { rows } = await pool.query<{ month: string; total_revenue: string; booking_count: string }>(
          `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                  SUM(final_price) FILTER (WHERE status = 'CONFIRMED') AS total_revenue,
                  COUNT(*) FILTER (WHERE status = 'CONFIRMED') AS booking_count
           FROM bookings
           GROUP BY 1
           ORDER BY 1`,
        );

        const revenueByMonth = rows.map((row) => ({
          month: row.month,
          totalRevenue: Number(row.total_revenue || 0),
          bookingCount: Number(row.booking_count || 0),
        }));

        const venueCountRows = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM venues');
        const eventCountRows = await pool.query<{ count: string }>('SELECT COUNT(*) AS count FROM events');
        const totalVenues = Number(venueCountRows.rows[0]?.count ?? 0);
        const totalEvents = Number(eventCountRows.rows[0]?.count ?? 0);

        const totalRevenue = revenueByMonth.reduce((sum, m) => sum + m.totalRevenue, 0);
        const totalBookings = revenueByMonth.reduce((sum, m) => sum + m.bookingCount, 0);

        return { totalVenues, totalEvents, totalBookings, totalRevenue, revenueByMonth };
      });
    },
  },

  Venue: {
    __resolveReference: async (ref: { id: string }) => {
      logger.info('Resolving Venue reference for stats', { venueId: ref.id });
      return { id: ref.id, stats: await venueStatsFor(ref.id) };
    },
  },
  EventType: {
    __resolveReference: async (ref: { id: string }) => {
      logger.info('Resolving EventType reference for stats', { eventId: ref.id });
      return { id: ref.id, stats: await eventStatsFor(ref.id) };
    },
  },
};
