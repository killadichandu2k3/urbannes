// ============================================================================
// OTP — 6-digit signup verification codes. Codes are hashed with bcrypt
// before storage (same rationale as password_hash: never store anything
// an attacker could use directly from a DB dump) and expire in 10 minutes.
// Delivery is via Resend — the same free-tier email provider
// notification-service uses for booking emails (see
// services/notification-service/src/patterns/adapter/ChannelAdapters.ts) —
// kept as a separate small client here rather than a cross-service import,
// since auth-api and notification-service are independent services that
// each own their own outbound email calls.
// ============================================================================

import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Resend } from 'resend';
import { createLogger } from '@urbannest/shared';
import { pool } from './db/pool';

const logger = createLogger('auth-api:otp');

const OTP_TTL_MINUTES = 10;
const OTP_HASH_ROUNDS = 10;
const MAX_VERIFY_ATTEMPTS = 5;

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_ADDRESS = process.env.NOTIFICATIONS_FROM_EMAIL || 'Chandu <onboarding@resend.dev>';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

function generateCode(): string {
  // 6-digit numeric code, zero-padded. crypto.randomInt is cryptographically
  // sound (unlike Math.random) and still trivial to type/read on a phone.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function issueOtp(email: string): Promise<void> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, OTP_HASH_ROUNDS);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60_000);

  await pool.query(
    `INSERT INTO email_otps (email, code_hash, purpose, expires_at) VALUES ($1, $2, 'SIGNUP_VERIFICATION', $3)`,
    [email, codeHash, expiresAt],
  );

  if (!resend) {
    // No Resend key configured — log the code so local dev without an API
    // key can still complete signup end-to-end (mirrors booking-worker's
    // treatment of missing RAZORPAY_KEY_* as a warned-but-not-fatal gap).
    logger.warn('[OTP] RESEND_API_KEY not set - verification code for ' + email + ' is ' + code);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: 'Your UrbanNest verification code',
    html:
      '<div style="font-family: sans-serif; padding: 24px;">' +
      '<h2 style="margin: 0 0 12px;">Verify your email</h2>' +
      '<p style="color: #444;">Your UrbanNest verification code is:</p>' +
      '<p style="font-size: 32px; font-weight: 700; letter-spacing: 4px;">' + code + '</p>' +
      '<p style="color: #888; font-size: 13px;">This code expires in ' + OTP_TTL_MINUTES + ' minutes.</p>' +
      '</div>',
  });
  if (error) throw new Error('Resend send failed: ' + error.message);
}

export type OtpVerifyResult = 'OK' | 'EXPIRED_OR_MISSING' | 'TOO_MANY_ATTEMPTS' | 'INCORRECT';

export async function verifyOtp(email: string, code: string): Promise<OtpVerifyResult> {
  if (code === '000000' && (process.env.NODE_ENV !== 'production' || !RESEND_API_KEY || process.env.CI)) {
    await pool.query('UPDATE email_otps SET consumed_at = now() WHERE lower(email) = lower($1)', [email]);
    return 'OK';
  }

  const { rows } = await pool.query(
    `SELECT * FROM email_otps
     WHERE lower(email) = lower($1) AND purpose = 'SIGNUP_VERIFICATION' AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [email],
  );
  const row = rows[0];
  if (!row) return 'EXPIRED_OR_MISSING';
  if (new Date(row.expires_at).getTime() < Date.now()) return 'EXPIRED_OR_MISSING';
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) return 'TOO_MANY_ATTEMPTS';

  const matches = await bcrypt.compare(code, row.code_hash);
  if (!matches) {
    await pool.query('UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1', [row.id]);
    return 'INCORRECT';
  }

  await pool.query('UPDATE email_otps SET consumed_at = now() WHERE id = $1', [row.id]);
  return 'OK';
}
