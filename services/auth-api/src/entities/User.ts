// ============================================================================
// User entity — TypeORM's equivalent of a JPA @Entity class. This maps the
// EXISTING `users` table (see services/booking-worker/src/db/schema.sql,
// the single source of truth for schema — TypeORM's synchronize is OFF,
// see data-source.ts, so this file describes reality, it doesn't create it).
// ============================================================================

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  email!: string;

  // Nullable: a Google-authenticated account has no password of its own
  // (see schema.sql's ALTER ... DROP NOT NULL and its comment) — Google
  // itself is the credential check for that account, there is nothing to
  // hash and store here.
  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  // Google's stable per-account subject id ("sub" claim in the ID token) —
  // the actual join key for "does this Google account already have a
  // UrbanNes user," since email alone isn't a safe identity key across
  // providers (a Google account's email can change; it's also
  // theoretically possible for a password account and a Google account to
  // share an email before either one verifies the other belongs to the
  // same person).
  @Column({ name: 'google_id', type: 'text', nullable: true, unique: true })
  googleId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
