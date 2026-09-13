// ============================================================================
// TypeORM DataSource — the Node/Express equivalent of a Spring
// EntityManagerFactory. This is the ORM layer for auth-api specifically:
// its three owned tables (users, email_otps, notifications) now go through
// TypeORM's Repository<Entity> API instead of hand-written SQL strings,
// the same way a JPA @Repository would.
//
// Deliberately scoped to auth-api only, not the whole project: booking-
// worker's `bookings` table is RANGE-PARTITIONED (see its schema.sql) and
// driven through a Kafka request/reply queue rather than direct request/
// response — introducing an ORM there is a materially bigger, riskier
// change (partitioned-table mapping, an ORM query inside a Kafka consumer
// instead of a raw pg transaction) that touches the exact booking/payment
// code path this project's instructions call out as off-limits. auth-api's
// tables are plain, unpartitioned, and have no such constraint, so this is
// where a real ORM can be added safely and still be genuinely useful
// end-to-end rather than left half-wired.
//
// synchronize: false — schema.sql (run once by booking-worker/db/schema.sql
// against the shared Postgres instance) is the single source of truth for
// every table in this project. TypeORM's auto-sync would try to alter
// tables to match these entities on every boot; keeping it off means these
// entities describe the existing schema, they never drive it — the same
// division of responsibility Flyway/Liquibase migrations plus JPA
// @Entity(updatable-schema=false) gives you in a Spring app.
// ============================================================================

import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { User } from '../entities/User';
import { EmailOtp } from '../entities/EmailOtp';
import { Notification } from '../entities/Notification';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  username: process.env.PGUSER || 'urbannes',
  password: process.env.PGPASSWORD || 'urbannes',
  database: process.env.PGDATABASE || 'urbannes',
  entities: [User, EmailOtp, Notification],
  synchronize: false,
  logging: false,
});

let initialized = false;

/** Call once at server startup — see server.ts. Safe to call more than once (no-ops after the first). */
export async function initDataSource(): Promise<DataSource> {
  if (!initialized) {
    await AppDataSource.initialize();
    initialized = true;
  }
  return AppDataSource;
}
