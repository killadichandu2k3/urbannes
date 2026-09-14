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
