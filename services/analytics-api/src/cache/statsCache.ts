// ============================================================================
// STATS CACHE — cache-aside Redis layer in front of analytics-api's
// aggregate GET queries (venueStats/eventStats/platformStats/search). These
// are the most expensive reads in the system (multi-row GROUP BY scans),
// and read far more often than the underlying data changes, so they're the
// clearest win for a GET-side cache: `getOrCompute` below is a generic
// cache-aside wrapper any resolver can call with its own key + TTL.
// ----------------------------------------------------------------------------
// Uses a dedicated cache Redis instance (REDIS_CACHE_HOST/REDIS_CACHE_PORT
// — same instance and same env var names as booking-worker's cache — see
// its cache/cache.ts), kept separate from the REDIS_HOST/REDIS_PORT
// coordination instance that booking-api/chat-service use for locks and
// Pub/Sub, since this is a shared Kubernetes ConfigMap and the two
// instances must not collide under the same env var name.
// ============================================================================

import Redis from 'ioredis';
import { createLogger } from '@urbannest/shared';

const logger = createLogger('analytics-api:stats-cache');

export const cacheRedis = new Redis({
  host: process.env.REDIS_CACHE_HOST || 'redis-cache',
  port: Number(process.env.REDIS_CACHE_PORT || 6379),
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

cacheRedis.on('error', (err) => logger.error('Stats cache Redis error', { error: err.message }));

/**
 * Cache-aside wrapper: return the cached value if present, otherwise call
 * `compute`, cache its result, and return it. Fails open — any Redis error
 * (get or set) falls through to `compute` so a cache outage never breaks
 * an analytics query, it just makes it as slow as it would've been anyway.
 */
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
