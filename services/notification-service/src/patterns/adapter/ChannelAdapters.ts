// ============================================================================
// PATTERN: ADAPTER — unchanged shape from the original stub version (see
// git history): each channel still normalizes its own "native" provider
// shape behind one NotificationChannel interface. What changed:
//   - EmailChannelAdapter now calls Resend for real (free tier: 3,000
//     sends/month, 100/day, no card required — see docs/NOTIFICATIONS.md)
//     instead of just logging.
//   - A new InAppChannelAdapter writes a row to `notifications` so the
//     frontend's bell icon has something real to query — this is NOT a
//     third-party API at all, just Postgres, but it fits the same
//     interface so NotificationDispatcher doesn't need to know the
//     difference between "call a vendor" and "write a row."
// SMS/push remain stubs — no free SMS/push provider was in scope, and
// swapping them for a real one later is, per the Adapter pattern's whole
// point, a new class here with zero changes to the dispatcher.
// ============================================================================

import { Resend } from 'resend';
import { createLogger } from '@urbannest/shared';
import { pool } from '../../db/pool';

const logger = createLogger('notification-service:channels');

export interface NotificationMessage {
  userId: string;
  title: string;
  body: string;
  toEmail?: string | null;
}

export interface NotificationChannel {
  readonly name: string;
  send(message: NotificationMessage): Promise<void>;
}

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_ADDRESS = process.env.NOTIFICATIONS_FROM_EMAIL || 'Chandu <onboarding@resend.dev>';
const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

export class EmailChannelAdapter implements NotificationChannel {
  readonly name = 'email';

  async send(message: NotificationMessage): Promise<void> {
    if (!message.toEmail) {
      logger.debug('No email on file for user, skipping email channel', { userId: message.userId });
      return;
    }
    if (!resend) {
      logger.warn('[EMAIL] RESEND_API_KEY not set - would have sent', { to: message.toEmail, subject: message.title });
      return;
    }
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: message.toEmail,
      subject: message.title,
      html: '<div style="font-family: sans-serif; padding: 24px;"><h2 style="margin: 0 0 12px;">' +
        message.title + '</h2><p style="color: #444;">' + message.body + '</p></div>',
    });
    if (error) throw new Error('Resend send failed: ' + error.message);
  }
}

export class InAppChannelAdapter implements NotificationChannel {
  readonly name = 'in-app';

  async send(message: NotificationMessage): Promise<void> {
    await pool.query('INSERT INTO notifications (user_id, title, body) VALUES ($1, $2, $3)', [
      message.userId,
      message.title,
      message.body,
    ]);
  }
}

interface NativeSmsApi {
  sendText(args: { phoneNumber: string; message: string }): Promise<void>;
}
class StubSmsProvider implements NativeSmsApi {
  async sendText(args: { phoneNumber: string; message: string }): Promise<void> {
    logger.info('[SMS STUB] sent', args);
  }
}

interface NativePushApi {
  push(args: { deviceToken: string; title: string; body: string }): Promise<void>;
}
class StubPushProvider implements NativePushApi {
  async push(args: { deviceToken: string; title: string; body: string }): Promise<void> {
    logger.info('[PUSH STUB] sent', args);
  }
}

export class SmsChannelAdapter implements NotificationChannel {
  readonly name = 'sms';
  constructor(private provider: NativeSmsApi = new StubSmsProvider()) {}
  async send(message: NotificationMessage): Promise<void> {
    await this.provider.sendText({
      phoneNumber: '+91-USER-' + message.userId.slice(0, 6),
      message: message.title + ': ' + message.body,
    });
  }
}

export class PushChannelAdapter implements NotificationChannel {
  readonly name = 'push';
  constructor(private provider: NativePushApi = new StubPushProvider()) {}
  async send(message: NotificationMessage): Promise<void> {
    await this.provider.push({
      deviceToken: 'device-' + message.userId,
      title: message.title,
      body: message.body,
    });
  }
}
