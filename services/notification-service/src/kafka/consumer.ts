// ============================================================================
// NOTIFICATION CONSUMER — subscribes to `booking.events` (the domain-event
// topic booking-worker publishes to). This is a genuinely independent
// consumer group ('notification-workers'): it can lag, restart, or scale
// to N replicas without ever affecting booking-worker's own processing,
// because Kafka decouples producer and consumer completely — the booking
// flow already returned a reply to the user long before this runs.
//
// Retry + Dead Letter Queue: if a message's processing throws after
// MAX_RETRIES attempts (e.g. every channel somehow fails), it's moved to
// `booking.events.dlq` instead of being silently dropped or blocking the
// partition forever. A human/ops process can inspect and replay the DLQ
// topic later — this is the real mechanism behind "at-least-once delivery"
// claims, not just an assertion in a README.
// ============================================================================

import { Kafka, logLevel } from 'kafkajs';
import { EventEnvelope, createLogger } from '@urbannest/shared';
import { dispatch } from '../patterns/facade/NotificationDispatcher';

const logger = createLogger('notification-service:consumer');

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
  logLevel: logLevel.WARN,
  retry: { retries: 8, initialRetryTime: 300 },
});

const SOURCE_TOPIC = 'booking.events'; // wildcard-ish: booking-worker publishes each KAFKA_TOPICS.* value; we subscribe to all of them below
const DLQ_TOPIC = 'booking.events.dlq';
const CONSUMER_GROUP = 'notification-workers';
const MAX_RETRIES = 3;

// booking-worker actually publishes to distinct topic names (booking.created,
// booking.confirmed, etc.) rather than one combined "booking.events" topic —
// subscribe to the full set explicitly so nothing is silently missed.
const TOPICS = ['booking.created', 'booking.confirmed', 'booking.cancelled', 'payment.processed'];

export async function startNotificationConsumer(): Promise<void> {
  const consumer = kafka.consumer({ groupId: CONSUMER_GROUP });
  const dlqProducer = kafka.producer();
  await consumer.connect();
  await dlqProducer.connect();
  await consumer.subscribe({ topics: TOPICS, fromBeginning: false });

  logger.info('notification-service consumer started', { group: CONSUMER_GROUP, topics: TOPICS });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      let envelope: EventEnvelope<any>;
      try {
        envelope = JSON.parse(message.value.toString());
      } catch {
        logger.error('Malformed event message, dropping', { topic });
        return;
      }

      let attempt = 0;
      let lastError: Error | null = null;
      while (attempt < MAX_RETRIES) {
        attempt++;
        try {
          const results = await dispatch(envelope);
          logger.info('Event dispatched', { topic, eventId: envelope.eventId, results });
          return;
        } catch (err) {
          lastError = err as Error;
          logger.warn('Dispatch attempt failed', { topic, attempt, error: lastError.message });
          if (attempt < MAX_RETRIES) await new Promise((r) => setTimeout(r, 300 * attempt));
        }
      }

      await dlqProducer.send({
        topic: DLQ_TOPIC,
        messages: [{ key: envelope.eventId, value: JSON.stringify({ envelope, error: lastError?.message }) }],
      });
      logger.error('Event failed after max retries, sent to DLQ', { topic, eventId: envelope.eventId });
    },
  });
}
