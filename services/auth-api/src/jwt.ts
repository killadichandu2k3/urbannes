import jwt from 'jsonwebtoken';
import type { AuthTokenPayload } from '@urbannes/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'urbannes-dev-jwt-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export { verifyAuthToken as verifyToken } from '@urbannes/shared';
