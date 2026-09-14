import Redis from 'ioredis';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('booking-worker:pubsub-publisher');

export const pubsubPublisher = new Redis({
  host: process.env.REDIS_LOCK_HOST || 'localhost',
  port: Number(process.env.REDIS_LOCK_PORT || 6379),
});

export interface ReplyMessage<T = unknown> {
  requestId: string;
  ok: boolean;
  data?: T;
  error?: string;
  servedFromCache?: boolean;
}

export async function sendReply<T>(requestId: string, reply: ReplyMessage<T>): Promise<void> {
  await pubsubPublisher.publish(`reply:${requestId}`, JSON.stringify(reply));
  logger.info('Reply published', { requestId, ok: reply.ok });
}

export async function pushBookingUpdate(payload: unknown): Promise<void> {
  await pubsubPublisher.publish('push:booking', JSON.stringify(payload));
}

export async function pushSeatMapUpdate(payload: unknown): Promise<void> {
  await pubsubPublisher.publish('push:seatmap', JSON.stringify(payload));
}
