// ============================================================================
// RESOLVERS — register/verifyEmail/resendVerificationCode/login/me.
// Talks to Postgres directly (a single instance — see db/pool.ts).
// Passwords are hashed with bcrypt before they ever reach the database;
// the plaintext password only ever exists in memory for the duration of
// one request. `me` is cache-aside through Redis (see cache/userCache.ts).
//
// SIGNUP FLOW (changed from a single register-and-get-a-token call):
//   register()  -> validates input, checks for a duplicate email, creates
//                  the user row with email_verified_at = NULL, emails a
//                  6-digit code (see ../otp.ts), returns NO token.
//   verifyEmail() -> checks the code, sets email_verified_at, returns the
//                  token. This is the only mutation that actually signs
//                  the user in after registering.
// login() refuses an unverified account rather than silently treating it
// as usable, so a signup that never got verified can't be used to bypass
// verification entirely.
// ============================================================================

import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import { createLogger, extractBearerToken } from '@urbannest/shared';
import { pool } from '../db/pool';
import { getCachedUser, setCachedUser } from '../cache/userCache';
import { signToken, verifyToken } from '../jwt';
import { issueOtp, verifyOtp } from '../otp';

const logger = createLogger('auth-api:resolvers');

const BCRYPT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// At least 8 chars, one uppercase, one lowercase, one digit. Symbols are
// welcome but not required — requiring them tends to push people toward
// "Password1!" rather than meaningfully stronger passwords.
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  email_verified_at: string | null;
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

function requireAuth(context: any): { userId: string; email: string; displayName: string } {
  const token = extractBearerToken(context?.headers);
  const payload = token ? verifyToken(token) : null;
  if (!payload) unauthenticated('You must be signed in to do this.');
  return payload;
}

function assertPasswordStrength(password: string): void {
  if (password.length < 8) badInput('Password must be at least 8 characters.');
  if (!PASSWORD_RE.test(password)) {
    badInput('Password must include an uppercase letter, a lowercase letter, and a number.');
  }
}

export const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, context: any) => {
      const token = extractBearerToken(context?.headers);
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

    myNotifications: async (_: unknown, __: unknown, context: any) => {
      const { userId } = requireAuth(context);
      const { rows } = await pool.query(
        'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
        [userId],
      );
      return rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        readAt: r.read_at,
        createdAt: r.created_at,
      }));
    },
  },

  Mutation: {
    register: async (_: unknown, args: { input: { email: string; password: string; displayName: string } }) => {
      const email = args.input.email.trim().toLowerCase();
      const { password, displayName } = args.input;

      if (!EMAIL_RE.test(email)) badInput('Enter a valid email address.');
      assertPasswordStrength(password);
      if (!displayName.trim()) badInput('Display name is required.');

      const existing = await pool.query('SELECT id, email_verified_at FROM users WHERE lower(email) = $1', [email]);
      if (existing.rows.length > 0) {
        // A duplicate registration attempt against an ALREADY-verified
        // account is a real conflict; against an unverified one, treat it
        // as "resend the code" so someone who lost the email isn't stuck.
        if (existing.rows[0].email_verified_at) {
          badInput('An account with this email already exists.');
        }
        await issueOtp(email);
        return { email, message: 'This email is already registered but not verified — a new verification code was sent.' };
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const { rows } = await pool.query<UserRow>(
        'INSERT INTO users (email, password_hash, display_name, email_verified_at) VALUES ($1, $2, $3, NULL) RETURNING *',
        [email, passwordHash, displayName.trim()],
      );
      const user = rows[0];
      logger.info('User registered, pending verification', { userId: user.id, email: user.email });

      await issueOtp(email);
      return { email, message: 'Account created. Check your email for a 6-digit verification code.' };
    },

    verifyEmail: async (_: unknown, args: { email: string; code: string }) => {
      const email = args.email.trim().toLowerCase();
      const result = await verifyOtp(email, args.code.trim());

      if (result === 'EXPIRED_OR_MISSING') badInput('That code has expired. Request a new one.');
      if (result === 'TOO_MANY_ATTEMPTS') badInput('Too many incorrect attempts. Request a new code.');
      if (result === 'INCORRECT') badInput('Incorrect code.');

      const { rows } = await pool.query<UserRow>(
        'UPDATE users SET email_verified_at = now() WHERE lower(email) = $1 RETURNING *',
        [email],
      );
      const user = rows[0];
      if (!user) badInput('No account found for that email.');

      logger.info('User verified email', { userId: user.id });
      const token = signToken({ userId: user.id, email: user.email, displayName: user.display_name });
      return { token, user: toUser(user) };
    },

    resendVerificationCode: async (_: unknown, args: { email: string }) => {
      const email = args.email.trim().toLowerCase();
      const { rows } = await pool.query<UserRow>('SELECT * FROM users WHERE lower(email) = $1', [email]);
      const user = rows[0];
      // Same "don't reveal whether the email exists" posture as login's
      // shared invalid-credentials error — but here there's nothing
      // secret to protect a code against sending to, so respond
      // identically either way rather than leaking account existence.
      if (user && !user.email_verified_at) {
        await issueOtp(email);
      }
      return { email, message: 'If that email has a pending verification, a new code was sent.' };
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

      if (!user.email_verified_at) {
        throw new GraphQLError('Please verify your email before signing in.', {
          extensions: { code: 'EMAIL_NOT_VERIFIED', email: user.email },
        });
      }

      logger.info('User logged in', { userId: user.id });
      const token = signToken({ userId: user.id, email: user.email, displayName: user.display_name });
      return { token, user: toUser(user) };
    },

    markNotificationRead: async (_: unknown, args: { id: string }, context: any) => {
      const { userId } = requireAuth(context);
      const result = await pool.query(
        'UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL',
        [args.id, userId],
      );
      return (result.rowCount ?? 0) > 0;
    },

    markAllNotificationsRead: async (_: unknown, __: unknown, context: any) => {
      const { userId } = requireAuth(context);
      await pool.query('UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL', [userId]);
      return true;
    },
  },
};
