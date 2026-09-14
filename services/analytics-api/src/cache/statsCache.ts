import Redis from 'ioredis';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('analytics-api:stats-cache');

export const cacheRedis = new Redis({
  host: process.env.REDIS_CACHE_HOST || 'redis-cache',
  port: Number(process.env.REDIS_CACHE_PORT || 6379),
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

cacheRedis.on('error', (err) => logger.error('Stats cache Redis error', { error: err.message }));

export async function getOrCompute<T>(key: string, ttlSec: number, compute: () => Promise<T>): Promise<T> {
  try {
    const cached = await cacheRedis.get(key);
    if (cached) return JSON.parse(cached) as T;
  } catch (err) {
    logger.warn('Stats cache read failed, computing directly', { key, error: (err as Error).message });
  }

  const result = await compute();

  try {
    await cacheRedis.set(key, JSON.stringify(result), 'EX', ttlSec);
  } catch (err) {
    logger.warn('Stats cache write failed', { key, error: (err as Error).message });
  }

  return result;
}

export async function invalidateStatsFor(venueId?: string, eventId?: string): Promise<void> {
  const keys = ['stats:platform', venueId ? `stats:venue:${venueId}` : null, eventId ? `stats:event:${eventId}` : null].filter(
    Boolean,
  ) as string[];
  if (keys.length === 0) return;
  try {
    await cacheRedis.del(...keys);
  } catch (err) {
    logger.warn('Stats cache invalidation failed', { keys, error: (err as Error).message });
  }
}
