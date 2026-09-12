// ============================================================================
// PATTERN: ADAPTER — each notification channel (email, SMS, push) has a
// different "native" API shape in the real world (an email SDK wants
// {to, subject, html}, an SMS gateway wants {phone, text}, a push provider
// wants {deviceToken, title, body}). The adapter normalizes all of them
// behind one NotificationChannel interface so the dispatch logic doesn't
// care which concrete provider it's talking to.
//
// These are STUB providers (they log instead of calling a real paid API —
// no SendGrid/Twilio account needed to run this locally), but the adapter
// boundary is real: swapping the stub for a real provider means writing one
// new Adapter class, not touching the dispatch logic.
// ============================================================================

import { createLogger } from '@urbannest/shared';

const logger = createLogger('notification-service:channels');

export interface NotificationMessage {
  userId: string;
  title: string;
  body: string;
}

export interface NotificationChannel {
  readonly name: string;
  send(message: NotificationMessage): Promise<void>;
}

// ---- "Native" third-party-shaped APIs (stand-ins for real SDKs) -----------

interface NativeEmailApi {
  deliver(args: { to: string; subject: string; html: string }): Promise<void>;
}
class StubEmailProvider implements NativeEmailApi {
  async deliver(args: { to: string; subject: string; html: string }): Promise<void> {
    logger.info('[EMAIL STUB] delivered', args);
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

// ---- Adapters ---------------------------------------------------------------

export class EmailChannelAdapter implements NotificationChannel {
  readonly name = 'email';
  constructor(private provider: NativeEmailApi = new StubEmailProvider()) {}
  async send(message: NotificationMessage): Promise<void> {
    await this.provider.deliver({
      to: `${message.userId}@example.com`,
      subject: message.title,
      html: `<p>${message.body}</p>`,
    });
  }
}

export class SmsChannelAdapter implements NotificationChannel {
  readonly name = 'sms';
  constructor(private provider: NativeSmsApi = new StubSmsProvider()) {}
  async send(message: NotificationMessage): Promise<void> {
    await this.provider.sendText({
      phoneNumber: `+91-USER-${message.userId.slice(0, 6)}`,
      message: `${message.title}: ${message.body}`,
    });
  }
}

export class PushChannelAdapter implements NotificationChannel {
  readonly name = 'push';
  constructor(private provider: NativePushApi = new StubPushProvider()) {}
  async send(message: NotificationMessage): Promise<void> {
    await this.provider.push({
      deviceToken: `device-${message.userId}`,
      title: message.title,
      body: message.body,
    });
  }
}
