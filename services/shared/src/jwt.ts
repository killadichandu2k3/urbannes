// ============================================================================
// Shared JWT verification. auth-api is the only service that SIGNS tokens
// (see services/auth-api/src/jwt.ts) — it needs its own signToken() with
// jsonwebtoken's SignOptions typing, which isn't worth duplicating here.
// This file is deliberately the smaller, read-only half: any service that
// needs to authenticate an incoming request (booking-api's resolvers,
// chat-service, etc.) verifies against the SAME JWT_SECRET env var auth-api
// signs with, so a token minted by auth-api is valid everywhere without
// each service re-implementing its own verification.
// ============================================================================

import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'urbannes-dev-jwt-secret-change-me';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  displayName: string;
}

/** Returns the decoded payload, or null for a missing/expired/invalid token — never throws. */
export function verifyAuthToken(token: string | undefined | null): AuthTokenPayload | null {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

/** Extracts a bearer token from a headers object's `authorization` field, e.g. from GraphQL context. */
export function extractBearerToken(headers: Record<string, unknown> | undefined): string | null {
  const authHeader = headers?.['authorization'] as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length);
}
