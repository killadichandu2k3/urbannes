// ============================================================================
// KAFKA PRODUCER — domain events (`booking.events` topic) consumed by
// notification-service. Separate from the request/reply plumbing: these are
// durable, replayable business events ("a booking was confirmed"), not
// ephemeral RPC replies.
// ============================================================================

import { Kafka, Producer, logLevel } from 'kafkajs';
import { EventEnvelope, KAFKA_TOPICS, createLogger } from '@urbannes/shared';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('booking-worker:kafka-producer');

const kafka = new Kafka({
  clientId: 'booking-worker-producer',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: logLevel.WARN,
  retry: { retries: 8, initialRetryTime: 300 },
});

let producer: Producer | null = null;

async function getProducer(): Promise<Producer> {
  if (producer) return producer;
  producer = kafka.producer({ allowAutoTopicCreation: true, idempotent: true });
  await producer.connect();
  logger.info('Domain event producer connected');
  return producer;
}

export async function publishDomainEvent<T>(topic: string, payload: T, traceId?: string): Promise<void> {
  const envelope: EventEnvelope<T> = {
    eventId: uuidv4(),
    eventType: topic,
    producedBy: 'booking-worker',
    producedAt: new Date().toISOString(),
    payload,
    traceId,
  };
  const p = await getProducer();
  await p.send({
    topic,
    acks: -1,
    messages: [{ key: traceId || envelope.eventId, value: JSON.stringify(envelope), headers: { eventType: topic } }],
  });
  logger.info('Domain event published', { topic, eventId: envelope.eventId });
}

export { KAFKA_TOPICS };
