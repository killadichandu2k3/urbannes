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
