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

export async function initDataSource(): Promise<DataSource> {
  if (!initialized) {
    const maxRetries = 10;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await AppDataSource.initialize();
        initialized = true;
        return AppDataSource;
      } catch (err: any) {
        if (attempt === maxRetries) throw err;
        console.log(`[TypeORM] Postgres not ready, retrying (${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }
  return AppDataSource;
}
