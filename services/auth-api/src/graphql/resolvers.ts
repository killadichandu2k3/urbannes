// ============================================================================
// RESOLVERS — register/verifyEmail/resendVerificationCode/login/me/
// updateProfile/changePassword. Talks to Postgres via TypeORM's Repository
// API (see ../orm/data-source.ts) — the JPA-style layer this project's
// three auth-api-owned tables (users, email_otps, notifications) use
// instead of hand-written SQL strings. Passwords are hashed with bcrypt
// before they ever reach the database; the plaintext password only ever
// exists in memory for the duration of one request. `me` is cache-aside
// through Redis (see cache/userCache.ts).
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
//
// PROFILE EDITS — updateProfile() changes displayName only (email is the
// login identity and changing it would need its own re-verification flow,
// out of scope here); changePassword() requires the current password
// before accepting a new one, the same re-auth-for-credential-change
// pattern any real account settings page has. A Google-only account (see
// loginWithGoogle below) has no password at all — changePassword refuses
// it with a clear message rather than silently failing bcrypt.compare
// against a null hash.
//
// GOOGLE SIGN-IN — loginWithGoogle() verifies a client-obtained Google ID
// token against Google's public keys (google-auth-library), then finds an
// existing user by google_id, links an existing password account with a
// matching verified email, or creates a brand-new account — in all three
// cases returning the same AuthPayload shape login() does, so the
// frontend treats both paths identically after the initial call.
// ============================================================================

import bcrypt from 'bcryptjs';
import { GraphQLError } from 'graphql';
import { IsNull, Not } from 'typeorm';
import { OAuth2Client } from 'google-auth-library';
import { createLogger, extractBearerToken } from '@urbannes/shared';
import { AppDataSource } from '../orm/data-source';
import { User } from '../entities/User';
import { Notification } from '../entities/Notification';
import { getCachedUser, setCachedUser, invalidateCachedUser } from '../cache/userCache';
import { signToken, verifyToken } from '../jwt';
import { issueOtp, verifyOtp } from '../otp';

const logger = createLogger('auth-api:resolvers');

// TypeORM's Repository<Entity> is the direct analogue of a Spring Data JPA
// JpaRepository<Entity, ID> — findOne/save/update read like the JPA calls
// they replace, rather than hand-written SQL strings.
const userRepo = () => AppDataSource.getRepository(User);
const notificationRepo = () => AppDataSource.getRepository(Notification);

const BCRYPT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// At least 8 chars, one uppercase, one lowercase, one digit. Symbols are
// welcome but not required — requiring them tends to push people toward
// "Password1!" rather than meaningfully stronger passwords.
const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
// Re-used across requests — this holds Google's public signing keys in
// memory (refetched by the library as they rotate), not a per-request
// connection, so a single module-level client is the right lifetime, same
// as the `pool`/`AppDataSource` singletons elsewhere in this file.
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

function toUser(user: User) {
  return { id: user.id, email: user.email, displayName: user.displayName, hasPassword: user.passwordHash !== null };
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

      const user = await userRepo().findOneBy({ id: payload.userId });
      if (!user) return null;
      const result = toUser(user);
      await setCachedUser(result);
      return result;
    },

    myNotifications: async (_: unknown, __: unknown, context: any) => {
      const { userId } = requireAuth(context);
      const notifications = await notificationRepo().find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 30,
      });
      return notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        readAt: n.readAt,
        createdAt: n.createdAt,
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

      // TypeORM's query builder for the one query that needs a raw
      // case-insensitive comparison (lower(email) = $1) — the repository's
      // plain findOneBy can't express a SQL function on the compared
      // column, so this is the equivalent of a JPA @Query(nativeQuery)
      // escape hatch for the one spot that needs it.
      const existing = await userRepo()
        .createQueryBuilder('user')
        .where('lower(user.email) = :email', { email })
        .getOne();

      if (existing) {
        // A duplicate registration attempt against an ALREADY-verified
        // account is a real conflict; against an unverified one, treat it
        // as "resend the code" so someone who lost the email isn't stuck.
        if (existing.emailVerifiedAt) {
          badInput('An account with this email already exists.');
        }
        await issueOtp(email);
        return { email, message: 'This email is already registered but not verified — a new verification code was sent.' };
      }

      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
      const user = await userRepo().save(
        userRepo().create({
          email,
          passwordHash,
          displayName: displayName.trim(),
          emailVerifiedAt: null,
        }),
      );
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

      const user = await userRepo()
        .createQueryBuilder('user')
        .where('lower(user.email) = :email', { email })
        .getOne();
      if (!user) badInput('No account found for that email.');

      user.emailVerifiedAt = new Date();
      await userRepo().save(user);

      logger.info('User verified email', { userId: user.id });
      const token = signToken({ userId: user.id, email: user.email, displayName: user.displayName });
      return { token, user: toUser(user) };
    },

    resendVerificationCode: async (_: unknown, args: { email: string }) => {
      const email = args.email.trim().toLowerCase();
      const user = await userRepo()
        .createQueryBuilder('user')
        .where('lower(user.email) = :email', { email })
        .getOne();
      // Same "don't reveal whether the email exists" posture as login's
      // shared invalid-credentials error — but here there's nothing
      // secret to protect a code against sending to, so respond
      // identically either way rather than leaking account existence.
      if (user && !user.emailVerifiedAt) {
        await issueOtp(email);
      }
      return { email, message: 'If that email has a pending verification, a new code was sent.' };
    },

    login: async (_: unknown, args: { input: { email: string; password: string } }) => {
      const email = args.input.email.trim().toLowerCase();
      const { password } = args.input;

      const user = await userRepo()
        .createQueryBuilder('user')
        .where('lower(user.email) = :email', { email })
        .getOne();
      // Deliberately identical error for "no such user" and "wrong
      // password" — distinguishing them lets an attacker enumerate valid
      // emails one guess at a time.
      if (!user) unauthenticated('Invalid email or password.');

      // A Google-only account has passwordHash = null (see User entity) —
      // refuse this cleanly before ever calling bcrypt.compare against
      // null, and without revealing that the email belongs to a
      // Google-linked account (same enumeration-resistance posture as the
      // "no such user" case just above).
      if (!user.passwordHash) unauthenticated('Invalid email or password.');

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) unauthenticated('Invalid email or password.');

      if (!user.emailVerifiedAt) {
        throw new GraphQLError('Please verify your email before signing in.', {
          extensions: { code: 'EMAIL_NOT_VERIFIED', email: user.email },
        });
      }

      logger.info('User logged in', { userId: user.id });
      const token = signToken({ userId: user.id, email: user.email, displayName: user.displayName });
      return { token, user: toUser(user) };
    },

    loginWithGoogle: async (_: unknown, args: { idToken: string }) => {
      if (!googleClient) {
        // Fails loudly rather than pretending to succeed — an unset
        // GOOGLE_CLIENT_ID means this deployment genuinely can't verify
        // Google tokens yet (see .env.example), and a silent no-op here
        // would be far more confusing than an explicit error.
        throw new GraphQLError('Google sign-in is not configured on this server.', {
          extensions: { code: 'GOOGLE_AUTH_NOT_CONFIGURED' },
        });
      }

      // verifyIdToken checks the token's signature against Google's own
      // public keys, its audience (must match our client id, so a token
      // meant for a different app can't be replayed here), and its
      // expiry — this IS the credential check for this login path, the
      // same way bcrypt.compare is the credential check for login().
      let payload;
      try {
        const ticket = await googleClient.verifyIdToken({ idToken: args.idToken, audience: GOOGLE_CLIENT_ID });
        payload = ticket.getPayload();
      } catch (err) {
        logger.warn('Google ID token verification failed', { error: (err as Error).message });
        unauthenticated('Could not verify your Google sign-in. Please try again.');
      }
      if (!payload?.sub || !payload.email) {
        unauthenticated('Could not verify your Google sign-in. Please try again.');
      }

      const googleId = payload.sub;
      let user = await userRepo().findOneBy({ googleId });

      if (!user) {
        // No account linked to this Google id yet. If an existing
        // password account already uses this email, link the Google id
        // onto it instead of creating a duplicate row — Google has
        // already verified this email belongs to whoever is signing in,
        // so this is safe in a way that blindly trusting a client-
        // supplied email elsewhere would not be.
        const email = payload.email.trim().toLowerCase();
        const existingByEmail = await userRepo()
          .createQueryBuilder('user')
          .where('lower(user.email) = :email', { email })
          .getOne();

        if (existingByEmail) {
          existingByEmail.googleId = googleId;
          // Google has already verified this address, so a password
          // account that was still pending its own email verification is
          // now considered verified too — there is no longer a code to
          // wait on.
          if (!existingByEmail.emailVerifiedAt) existingByEmail.emailVerifiedAt = new Date();
          user = await userRepo().save(existingByEmail);
          logger.info('Linked Google account to existing user', { userId: user.id });
        } else {
          user = await userRepo().save(
            userRepo().create({
              email,
              passwordHash: null,
              displayName: payload.name?.trim() || email.split('@')[0],
              emailVerifiedAt: new Date(),
              googleId,
            }),
          );
          logger.info('Created new user via Google sign-in', { userId: user.id });
        }
      }

      logger.info('User logged in via Google', { userId: user.id });
      const token = signToken({ userId: user.id, email: user.email, displayName: user.displayName });
      return { token, user: toUser(user) };
    },

    markNotificationRead: async (_: unknown, args: { id: string }, context: any) => {
      const { userId } = requireAuth(context);
      const result = await notificationRepo().update(
        { id: args.id, userId, readAt: IsNull() },
        { readAt: new Date() },
      );
      return (result.affected ?? 0) > 0;
    },

    markAllNotificationsRead: async (_: unknown, __: unknown, context: any) => {
      const { userId } = requireAuth(context);
      await notificationRepo().update({ userId, readAt: IsNull() }, { readAt: new Date() });
      return true;
    },

    updateProfile: async (_: unknown, args: { input: { displayName: string } }, context: any) => {
      const { userId } = requireAuth(context);
      const displayName = args.input.displayName.trim();
      if (!displayName) badInput('Display name is required.');
      if (displayName.length > 80) badInput('Display name must be 80 characters or fewer.');

      const user = await userRepo().findOneBy({ id: userId });
      if (!user) unauthenticated('Your session is no longer valid — please sign in again.');

      user.displayName = displayName;
      await userRepo().save(user);

      // The `me` query is cache-aside through Redis (see cache/userCache.ts)
      // precisely so a stale cached name doesn't outlive this write — the
      // next `me` read misses the cache once, refetches from Postgres, and
      // repopulates with the new name.
      await invalidateCachedUser(userId);

      logger.info('User updated profile', { userId });
      return toUser(user);
    },

    changePassword: async (_: unknown, args: { input: { currentPassword: string; newPassword: string } }, context: any) => {
      const { userId } = requireAuth(context);
      const { currentPassword, newPassword } = args.input;

      const user = await userRepo().findOneBy({ id: userId });
      if (!user) unauthenticated('Your session is no longer valid — please sign in again.');

      if (!user.passwordHash) {
        badInput('This account signs in with Google and has no password to change.');
      }

      // Require the current password even though the caller is already
      // authenticated — a stolen/left-open session shouldn't be enough on
      // its own to take over the account's credentials, the same
      // "re-enter your password" defense any real settings page has for a
      // credential change.
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) unauthenticated('Current password is incorrect.');

      assertPasswordStrength(newPassword);
      user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
      await userRepo().save(user);

      logger.info('User changed password', { userId });
      return true;
    },
  },
};
