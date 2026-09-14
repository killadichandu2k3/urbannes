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

const userRepo = () => AppDataSource.getRepository(User);
const notificationRepo = () => AppDataSource.getRepository(Notification);

const BCRYPT_ROUNDS = 10;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

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

      const existing = await userRepo()
        .createQueryBuilder('user')
        .where('lower(user.email) = :email', { email })
        .getOne();

      if (existing) {

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

      if (!user) unauthenticated('Invalid email or password.');

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

        throw new GraphQLError('Google sign-in is not configured on this server.', {
          extensions: { code: 'GOOGLE_AUTH_NOT_CONFIGURED' },
        });
      }

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

        const email = payload.email.trim().toLowerCase();
        const existingByEmail = await userRepo()
          .createQueryBuilder('user')
          .where('lower(user.email) = :email', { email })
          .getOne();

        if (existingByEmail) {
          existingByEmail.googleId = googleId;

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

    deleteNotification: async (_: unknown, args: { id: string }, context: any) => {
      const { userId } = requireAuth(context);
      const result = await notificationRepo().delete({ id: args.id, userId });
      return (result.affected ?? 0) > 0;
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
