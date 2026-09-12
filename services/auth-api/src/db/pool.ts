// ============================================================================
// DB POOL — single Postgres instance. Sharding has been removed from this
// project: `users` used to be fan-out-written to two independent shard
// instances (see git history / README for the old design); now there is
// exactly one Postgres instance and one connection pool, so register/login
// are plain single-instance writes/reads with no fan-out and no partial-
// shard-failure handling to worry about.
// ============================================================================

import { Pool } from 'pg';
import { createLogger } from '@urbannest/shared';

const logger = createLogger('auth-api:db');

export const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'urbannest',
  password: process.env.PGPASSWORD || 'urbannest',
  database: process.env.PGDATABASE || 'urbannest',
  max: 10,
  statement_timeout: 10_000,
});

pool.on('error', (err) => logger.error('Idle client error', { error: err.message }));

export async function closePool(): Promise<void> {
  await pool.end();
}
