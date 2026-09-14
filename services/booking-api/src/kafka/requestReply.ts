import { Kafka, Producer, logLevel } from 'kafkajs';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('booking-api:request-reply');

const REPLY_TIMEOUT_MS = Number(process.env.REPLY_TIMEOUT_MS || 10000);
const REQUEST_TOPIC = 'booking.requests';

export interface RequestMessage<TPayload = unknown> {
  requestId: string;
  kind: string;
  payload: TPayload;
  requestedAt: string;
}

export interface ReplyMessage<TData = unknown> {
  requestId: string;
  ok: boolean;
  data?: TData;
  error?: string;
  servedFromCache?: boolean;
}

const kafka = new Kafka({
  clientId: 'booking-api',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: logLevel.WARN,
  retry: { retries: 8, initialRetryTime: 300 },
});

let producer: Producer | null = null;
const pending = new Map<string, { resolve: (r: ReplyMessage) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();

const subscriber = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
});

let subscribed = false;

async function ensureSubscribed(): Promise<void> {
  if (subscribed) return;
  await subscriber.psubscribe('reply:*');
  subscriber.on('pmessage', (_pattern, channel, message) => {
    const requestId = channel.split(':')[1];
    const waiter = pending.get(requestId);
    if (!waiter) return;
    clearTimeout(waiter.timer);
    pending.delete(requestId);
    try {
      waiter.resolve(JSON.parse(message) as ReplyMessage);
    } catch (err) {
      waiter.reject(err as Error);
    }
  });
  subscribed = true;
  logger.info('Subscribed to reply:* pattern on Redis Pub/Sub');
}

async function getProducer(): Promise<Producer> {
  if (producer) return producer;
  producer = kafka.producer({ allowAutoTopicCreation: true, idempotent: true });
  await producer.connect();
  logger.info('Kafka producer connected');
  return producer;
}

export async function requestReply<TPayload, TData>(
  kind: string,
  payload: TPayload,
): Promise<ReplyMessage<TData>> {
  await ensureSubscribed();
  const p = await getProducer();

  const requestId = uuidv4();
  const message: RequestMessage<TPayload> = {
    requestId,
    kind,
    payload,
    requestedAt: new Date().toISOString(),
  };

  const replyPromise = new Promise<ReplyMessage<TData>>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error(`Timed out waiting for reply to ${kind} (requestId=${requestId}) after ${REPLY_TIMEOUT_MS}ms`));
    }, REPLY_TIMEOUT_MS);
    pending.set(requestId, { resolve: resolve as (r: ReplyMessage) => void, reject, timer });
  });

  await p.send({
    topic: REQUEST_TOPIC,
    messages: [{ key: requestId, value: JSON.stringify(message), headers: { kind } }],
  });
  logger.info('Request published, awaiting reply', { kind, requestId });

  return replyPromise;
}
