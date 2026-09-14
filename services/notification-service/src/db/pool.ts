import { Pool } from 'pg';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('notification-service:db');

export const pool = new Pool({
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'urbannes',
  password: process.env.PGPASSWORD || 'urbannes',
  database: process.env.PGDATABASE || 'urbannes',
  max: Number(process.env.PG_POOL_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => logger.error('Idle client error', { error: err.message }));

export async function getUserEmail(userId: string): Promise<string | null> {
  const { rows } = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
  return rows[0]?.email ?? null;
}

export async function checkDbHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
