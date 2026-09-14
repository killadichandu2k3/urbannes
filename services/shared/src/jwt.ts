import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'urbannes-dev-jwt-secret-change-me';

export interface AuthTokenPayload {
  userId: string;
  email: string;
  displayName: string;
}

export function verifyAuthToken(token: string | undefined | null): AuthTokenPayload | null {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(headers: Record<string, unknown> | undefined): string | null {
  const authHeader = headers?.['authorization'] as string | undefined;
  if (!authHeader?.startsWith('Bearer ')) return null;
  return authHeader.slice('Bearer '.length);
}
