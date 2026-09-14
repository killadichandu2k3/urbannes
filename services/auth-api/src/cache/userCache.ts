// ============================================================================
// USER CACHE — cache-aside Redis layer in front of the `users` table for
// GET reads (the `me` query). Register/login are writes/credential checks
// and are never cached; only "look this user up by id" benefits from a
// cache, since the same logged-in user re-fetches `me` on practically
// every page load.
// ----------------------------------------------------------------------------
// Uses a dedicated cache Redis instance (REDIS_CACHE_HOST/REDIS_CACHE_PORT
// — same instance and same env var names as booking-worker's cache — see
// its cache/cache.ts), kept separate from the REDIS_HOST/REDIS_PORT
// coordination instance that booking-api uses for locks and
// Pub/Sub, since this is a shared Kubernetes ConfigMap and the two
// instances must not collide under the same env var name. Cache
// invalidation is a plain `del()` on the rare write that changes a user
// row — updateProfile() (see graphql/resolvers.ts) calls
// invalidateCachedUser() right after saving a new displayName, so the
// next `me` read misses the cache once and refetches the fresh row
// instead of serving a stale cached name.
// ============================================================================

import Redis from 'ioredis';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('auth-api:user-cache');

export const cacheRedis = new Redis({
  host: process.env.REDIS_CACHE_HOST || 'redis-cache',
  port: Number(process.env.REDIS_CACHE_PORT || 6379),
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

cacheRedis.on('error', (err) => logger.error('User cache Redis error', { error: err.message }));

const USER_TTL_SEC = 60;

function userKey(userId: string): string {
  return `user:${userId}`;
}

export interface CachedUser {
  id: string;
  email: string;
  displayName: string;
}

export async function getCachedUser(userId: string): Promise<CachedUser | null> {
  try {
    const raw = await cacheRedis.get(userKey(userId));
    return raw ? (JSON.parse(raw) as CachedUser) : null;
  } catch (err) {
    // Cache-aside is fail-open: a Redis hiccup should fall back to
    // Postgres, never 500 the request.
    logger.warn('User cache read failed, falling back to DB', { userId, error: (err as Error).message });
    return null;
  }
}

export async function setCachedUser(user: CachedUser): Promise<void> {
  try {
    await cacheRedis.set(userKey(user.id), JSON.stringify(user), 'EX', USER_TTL_SEC);
  } catch (err) {
    logger.warn('User cache write failed', { userId: user.id, error: (err as Error).message });
  }
}

export async function invalidateCachedUser(userId: string): Promise<void> {
  try {
    await cacheRedis.del(userKey(userId));
  } catch (err) {
    logger.warn('User cache invalidation failed', { userId, error: (err as Error).message });
  }
}
