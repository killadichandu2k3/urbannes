// ============================================================================
// JWT issuance — replaces the hardcoded Kong dev API key that used to sit
// in the Angular bundle (see graphql.module.ts's old comment). auth-api is
// the only service that SIGNS tokens; verification is shared logic (see
// @urbannest/shared's jwt.ts) so booking-api and any other service can
// verify the exact same token this service issues, off the same
// JWT_SECRET env var, without duplicating the jsonwebtoken.verify() call.
// ============================================================================

import jwt from 'jsonwebtoken';
import type { AuthTokenPayload } from '@urbannest/shared';

const JWT_SECRET = process.env.JWT_SECRET || 'urbannest-dev-jwt-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export function signToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export { verifyAuthToken as verifyToken } from '@urbannest/shared';
