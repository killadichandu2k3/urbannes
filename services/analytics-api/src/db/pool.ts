// ============================================================================
// DB POOL — single Postgres instance. Sharding has been removed from this
// project (see auth-api/src/db/pool.ts for the same note): analytics-api
// used to fan out read-only queries across two shard instances and merge
// the results in application code (see git history for the old
// queryAllShards-based version). Now there is exactly one Postgres
// instance, so every aggregate below is a single query against it — no
// merging, no de-duplication of reference rows, no partial-shard-failure
// fail-soft logic needed.
// ============================================================================

import { Pool } from 'pg';
import { createLogger } from '@urbannest/shared';

const logger = createLogger('analytics-api:db');

export const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'urbannest',
  password: process.env.PGPASSWORD || 'urbannest',
  database: process.env.PGDATABASE || 'urbannest',
  max: 10,
  // Analytics queries can be slower (aggregates/scans) than the OLTP path
  // in booking-worker, so this pool gets a longer statement timeout.
  statement_timeout: 10_000,
});

pool.on('error', (err) => logger.error('Idle client error', { error: err.message }));

export async function closePool(): Promise<void> {
  await pool.end();
}
