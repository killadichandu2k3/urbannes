import { Resend } from 'resend';
import { createLogger } from '@urbannes/shared';
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
const FROM_ADDRESS = process.env.NOTIFICATIONS_FROM_EMAIL || 'UrbanNes <onboarding@resend.dev>';
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
