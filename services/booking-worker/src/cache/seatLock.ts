// ============================================================================
// SEAT LOCK MANAGER — a SEPARATE single Redis instance, deliberately not
// the Redis Cluster used for cache-aside above.
// ----------------------------------------------------------------------------
// Why not use the Cluster for locks too: multi-key atomic operations (our
// Lua compare-and-delete/extend scripts) require all keys touched by one
// EVAL to live on the same hash slot in Redis Cluster (a CROSSSLOT error
// otherwise). We only ever lock one seat key at a time per script call so
// this WOULD technically work on the Cluster, but keeping the coordination
// primitive (locks, which must be linearizable and low-latency) on a
// dedicated single instance is the safer, more standard separation of
// concerns: cache-aside data can tolerate the Cluster's eventual node
// failover hiccups, but an in-flight seat lock cannot.
//
// SET key value NX PX ttl is the actual primitive: NX = atomic
// compare-and-set (only if absent), PX = auto-expiring TTL so an abandoned
// checkout self-heals without a sweeper. The lock's VALUE is a fencing
// token (requestId) verified via Lua before release/extend, so a client
// can never release a lock it no longer owns after expiry+reacquisition by
// someone else.
// ============================================================================

import Redis from 'ioredis';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('booking-worker:seat-lock');

export const lockRedis = new Redis({
  host: process.env.REDIS_LOCK_HOST || 'localhost',
  port: Number(process.env.REDIS_LOCK_PORT || 6379),
  maxRetriesPerRequest: 3,
});

lockRedis.on('error', (err) => logger.error('Lock Redis error', { error: err.message }));

const SEAT_LOCK_TTL_MS = Number(process.env.SEAT_LOCK_TTL_MS || 5 * 60 * 1000);

function seatLockKey(eventId: string, seatId: string): string {
  return `seatlock:${eventId}:${seatId}`;
}

const RELEASE_IF_OWNER_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

export interface LockAttemptResult {
  seatId: string;
  acquired: boolean;
}

export async function acquireSeatLocks(eventId: string, seatIds: string[], fencingToken: string): Promise<LockAttemptResult[]> {
  const pipeline = lockRedis.pipeline();
  for (const seatId of seatIds) {
    pipeline.set(seatLockKey(eventId, seatId), fencingToken, 'PX', SEAT_LOCK_TTL_MS, 'NX');
  }
  const results = await pipeline.exec();
  if (!results) return seatIds.map((seatId) => ({ seatId, acquired: false }));
  return seatIds.map((seatId, i) => ({ seatId, acquired: results[i][1] === 'OK' }));
}

export async function releaseSeatLocks(eventId: string, seatIds: string[], fencingToken: string): Promise<void> {
  const pipeline = lockRedis.pipeline();
  for (const seatId of seatIds) {
    pipeline.eval(RELEASE_IF_OWNER_SCRIPT, 1, seatLockKey(eventId, seatId), fencingToken);
  }
  await pipeline.exec();
}

export async function acquireAllOrNothing(
  eventId: string,
  seatIds: string[],
  fencingToken: string,
): Promise<{ success: boolean; failedSeats: string[] }> {
  const attempts = await acquireSeatLocks(eventId, seatIds, fencingToken);
  const failed = attempts.filter((a) => !a.acquired).map((a) => a.seatId);
  const acquired = attempts.filter((a) => a.acquired).map((a) => a.seatId);

  if (failed.length > 0) {
    if (acquired.length > 0) await releaseSeatLocks(eventId, acquired, fencingToken);
    logger.warn('Seat lock batch failed, rolled back partial holds', { eventId, failed, acquired });
    return { success: false, failedSeats: failed };
  }
  return { success: true, failedSeats: [] };
}
