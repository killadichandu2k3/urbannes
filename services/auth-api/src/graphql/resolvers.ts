// ============================================================================
// RESOLVERS — register/login/me. Unlike booking-api, this talks to Postgres
// directly (a single instance — see db/pool.ts). Passwords are hashed with
// bcrypt before they ever reach the database; the plaintext password only
// ever exists in memory for the duration of one request.
// `me` is cache-aside through Redis (see cache/userCache.ts) since it's the
// highest-traffic read in this service — called on practically every page
// load to check "who's logged in."
// ============================================================================

import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import { createLogger, extractBearerToken } from '@urbannest/shared';
import { pool } from '../db/pool';
import { getCachedUser, setCachedUser } from '../cache/userCache';
import { signToken, verifyToken } from '../jwt';

const logger = createLogger('auth-api:resolvers');

const BCRYPT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
}

function toUser(row: UserRow) {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

function badInput(message: string): never {
  throw new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

function unauthenticated(message: string): never {
  throw new GraphQLError(message, { extensions: { code: 'UNAUTHENTICATED' } });
}

export const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, context: any) => {
      const token = extractBearerToken(context?.headers);
      // verifyToken (= shared verifyAuthToken) returns null instead of
      // throwing for a missing/expired/invalid token — `me` mirrors that
      // by returning null rather than raising, so the frontend can treat
      // "not logged in" and "bad token" the same way (clear the stored
      // token, show the login screen) without a try/catch of its own.
      const payload = token ? verifyToken(token) : null;
      if (!payload) return null;

      const cached = await getCachedUser(payload.userId);
      if (cached) return cached;

      const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE id = $1', [payload.userId]);
      if (!rows[0]) return null;
      const user = toUser(rows[0]);
      await setCachedUser(user);
      return user;
    },
  },

  Mutation: {
    register: async (_: unknown, args: { input: { email: string; password: string; displayName: string } }) => {
      const email = args.input.email.trim().toLowerCase();
      const { password, displayName } = args.input;

      if (!EMAIL_RE.test(email)) badInput('Enter a valid email address.');
      if (password.length < 8) badInput('Password must be at least 8 characters.');
      if (!displayName.trim()) badInput('Display name is required.');

      const existing = await pool.query('SELECT id FROM users WHERE lower(email) = $1', [email]);
      if (existing.rows.length > 0) badInput('An account with this email already exists.');

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      const { rows } = await pool.query<UserRow>(
        'INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING *',
        [email, passwordHash, displayName.trim()],
      );
      const user = rows[0];

      logger.info('User registered', { userId: user.id, email: user.email });
      const token = signToken({ userId: user.id, email: user.email, displayName: user.display_name });
      return { token, user: toUser(user) };
    },

    login: async (_: unknown, args: { input: { email: string; password: string } }) => {
      const email = args.input.email.trim().toLowerCase();
      const { password } = args.input;

      const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE lower(email) = $1', [email]);
      const user = rows[0];
      // Deliberately identical error for "no such user" and "wrong
      // password" — distinguishing them lets an attacker enumerate valid
      // emails one guess at a time.
      if (!user) unauthenticated('Invalid email or password.');

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) unauthenticated('Invalid email or password.');

      logger.info('User logged in', { userId: user.id });
      const token = signToken({ userId: user.id, email: user.email, displayName: user.display_name });
      return { token, user: toUser(user) };
    },
  },
};
