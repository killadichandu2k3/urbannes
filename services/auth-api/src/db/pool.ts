import { Pool } from 'pg';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('auth-api:db');

export const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'urbannes',
  password: process.env.PGPASSWORD || 'urbannes',
  database: process.env.PGDATABASE || 'urbannes',
  max: 10,
  statement_timeout: 10_000,
});

pool.on('error', (err) => logger.error('Idle client error', { error: err.message }));

export async function closePool(): Promise<void> {
  await pool.end();
}
