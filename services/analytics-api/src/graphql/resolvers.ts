// ============================================================================
// analytics-api resolvers.
// ----------------------------------------------------------------------------
// Two kinds of resolvers here:
//   1. Ordinary Query resolvers (venueStats, eventStats, platformStats).
//   2. A Federation `__resolveReference` on Venue/EventType — this is what
//      lets the Apollo Gateway ask "given this Venue id from booking-api,
//      give me the `stats` field this subgraph owns." Federation calls this
//      automatically whenever a client requests a field this subgraph
//      contributes to an entity it doesn't own the rest of.
// ----------------------------------------------------------------------------
// Sharding has been removed (see db/pool.ts): every query below runs once
// against the single Postgres instance — no more fan-out across shards, no
// de-duplication of reference rows, no partial-shard fail-soft logic.
// Every read here also goes through getOrCompute (see cache/statsCache.ts),
// a Redis cache-aside layer, since these aggregate queries are the most
// expensive reads in the system and are read far more often than the
// underlying booking data changes.
// ============================================================================

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
    const { rows } = await pool.query<{ status: string; final_price: string; seat_count: string }>(
      `SELECT b.status, b.final_price, COUNT(bs.seat_id) AS seat_count
       FROM bookings b
       JOIN events e ON e.id = b.event_id
       LEFT JOIN booking_seats bs ON bs.booking_id = b.id
       WHERE e.venue_id = $1
       GROUP BY b.id, b.status, b.final_price`,
      [venueId],
    );

    let totalBookings = 0;
    let confirmedBookings = 0;
    let cancelledBookings = 0;
    let totalRevenue = 0;
    let seatsSold = 0;

    for (const row of rows) {
      totalBookings += 1;
      if (row.status === 'CONFIRMED') {
        confirmedBookings += 1;
        totalRevenue += Number(row.final_price);
        seatsSold += Number(row.seat_count);
      }
      if (row.status === 'CANCELLED') cancelledBookings += 1;
    }

    const venueRows = await pool.query<{ total_seats: number }>('SELECT total_seats FROM venues WHERE id = $1', [venueId]);
    const totalSeats = venueRows.rows[0]?.total_seats ?? 0;

    return {
      venueId,
      totalBookings,
      confirmedBookings,
      cancelledBookings,
      totalRevenue,
      occupancyRate: totalSeats > 0 ? seatsSold / totalSeats : 0,
    };
  });
}

async function eventStatsFor(eventId: string) {
  return getOrCompute(`stats:event:${eventId}`, EVENT_STATS_TTL_SEC, async () => {
    const { rows } = await pool.query<{ status: string; final_price: string; seat_count: string }>(
      `SELECT b.status, b.final_price, COUNT(bs.seat_id) AS seat_count
       FROM bookings b
       LEFT JOIN booking_seats bs ON bs.booking_id = b.id
       WHERE b.event_id = $1
       GROUP BY b.id, b.status, b.final_price`,
      [eventId],
    );

    let totalBookings = 0;
    let confirmedBookings = 0;
    let totalRevenue = 0;
    let seatsSold = 0;

    for (const row of rows) {
      totalBookings += 1;
      if (row.status === 'CONFIRMED') {
        confirmedBookings += 1;
        totalRevenue += Number(row.final_price);
        seatsSold += Number(row.seat_count);
      }
    }

    const eventRows = await pool.query<{ venue_id: string }>('SELECT venue_id FROM events WHERE id = $1', [eventId]);
    const venueId = eventRows.rows[0]?.venue_id;
    let totalSeats = 0;
    if (venueId) {
      const venueRows = await pool.query<{ total_seats: number }>('SELECT total_seats FROM venues WHERE id = $1', [venueId]);
      totalSeats = venueRows.rows[0]?.total_seats ?? 0;
    }

    return {
      eventId,
      totalBookings,
      confirmedBookings,
      totalRevenue,
      seatsSold,
      seatsRemaining: Math.max(totalSeats - seatsSold, 0),
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
        // created_at is the range-partition key on `bookings` (see the
        // partitioning migration) — filtering/grouping on it lets Postgres
        // do partition pruning instead of scanning the whole table.
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

  // ---- Federation entity resolution ---------------------------------------
  // When the Gateway needs this subgraph's contribution to a Venue/EventType
  // that booking-api returned, it calls __resolveReference with just the
  // @key fields (here, just `id`) and expects the full entity-shaped object
  // for THIS subgraph's fields back.
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
