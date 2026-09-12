// ============================================================================
// booking-worker ENTRYPOINT
// ----------------------------------------------------------------------------
// On boot: apply schema.sql + seed.sql to the single Postgres instance
// (idempotent — CREATE TABLE IF NOT EXISTS / ON CONFLICT DO NOTHING), then
// start the Kafka consumer loop. This means a fresh `docker compose up` or
// a fresh k8s deployment self-initializes Postgres without a manual
// migration step. Sharding has been removed — this used to apply the same
// schema to two independent shard instances in a loop (see git history);
// now there's exactly one instance to initialize.
// ============================================================================

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createLogger } from '@urbannest/shared';
import { startConsumer } from './consumers/bookingRequestConsumer';

const logger = createLogger('booking-worker:bootstrap');

const PG_HOST = process.env.PGHOST || 'localhost';
const PG_PORT = Number(process.env.PGPORT || 5432);

async function applySchema(): Promise<void> {
  const pool = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    user: process.env.PGUSER || 'urbannest',
    password: process.env.PGPASSWORD || 'urbannest',
    database: process.env.PGDATABASE || 'urbannest',
  });

  const schema = fs.readFileSync(path.join(__dirname, 'db/schema.sql'), 'utf-8');
  const seed = fs.readFileSync(path.join(__dirname, 'db/seed.sql'), 'utf-8');

  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      retries--;
      logger.warn('Waiting for Postgres to be ready...', { host: PG_HOST, port: PG_PORT, retriesLeft: retries });
      await new Promise((r) => setTimeout(r, 2000));
      if (retries === 0) throw err;
    }
  }

  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto'); // for gen_random_uuid()
  await pool.query(schema);
  await pool.query(seed);
  await pool.end();
  logger.info('Schema + seed applied', { host: PG_HOST, port: PG_PORT });
}

async function bootstrap(): Promise<void> {
  logger.info('Bootstrapping booking-worker: applying schema to Postgres');
  await applySchema();
  logger.info('Postgres initialized, starting Kafka consumer');
  await startConsumer();
}

bootstrap().catch((err) => {
  logger.error('Fatal bootstrap error', { error: err.message, stack: err.stack });
  process.exit(1);
});
