// ============================================================================
// DB POOL — single Postgres instance. Sharding has been removed from this
// project: every booking-domain query used to be routed by eventId through
// a ConsistentHashRing to one of two physical Postgres instances (see git
// history for the old shardRouter.ts). Now there is exactly one instance,
// so `withTransaction` below is a plain transaction wrapper — no routing
// decision, no scatter-gather across shards, no cross-shard trade-offs to
// reason about. Every caller that used to call `fanOutQuery` now just runs
// a single query; every caller that used to call `withShardTransaction`
// now calls `withTransaction`.
// ============================================================================

import { Pool, PoolClient } from 'pg';
import { createLogger } from '@urbannest/shared';

const logger = createLogger('booking-worker:db');

export const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'urbannest',
  password: process.env.PGPASSWORD || 'urbannest',
  database: process.env.PGDATABASE || 'urbannest',
  max: Number(process.env.PG_POOL_MAX || 20),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => logger.error('Idle client error', { error: err.message }));

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function checkDbHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
