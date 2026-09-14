import Redis from 'ioredis';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('booking-worker:cache');

export const cacheRedis = new Redis({
  host: process.env.REDIS_CACHE_HOST || process.env.REDIS_LOCK_HOST || 'redis-coord',
  port: Number(process.env.REDIS_CACHE_PORT || process.env.REDIS_LOCK_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
});

cacheRedis.on('error', (err) => logger.error('Cache Redis error', { error: err.message }));
cacheRedis.on('connect', () => logger.info('Cache Redis connected'));

const SEAT_MAP_TTL_SEC = 30;
const EVENT_TTL_SEC = 120;

function seatMapKey(eventId: string): string {
  return `seatmap:${eventId}`;
}
function eventKey(eventId: string): string {
  return `event:${eventId}`;
}

export async function getCachedSeatMap<T>(eventId: string): Promise<T | null> {
  const raw = await cacheRedis.get(seatMapKey(eventId));
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function setCachedSeatMap<T>(eventId: string, data: T): Promise<void> {
  await cacheRedis.set(seatMapKey(eventId), JSON.stringify(data), 'EX', SEAT_MAP_TTL_SEC);
}

export async function invalidateSeatMap(eventId: string): Promise<void> {
  await cacheRedis.del(seatMapKey(eventId));
}

export async function getCachedEvent<T>(eventId: string): Promise<T | null> {
  const raw = await cacheRedis.get(eventKey(eventId));
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function setCachedEvent<T>(eventId: string, data: T): Promise<void> {
  await cacheRedis.set(eventKey(eventId), JSON.stringify(data), 'EX', EVENT_TTL_SEC);
}

export async function checkCacheHealth(): Promise<boolean> {
  try {
    await cacheRedis.ping();
    return true;
  } catch {
    return false;
  }
}
