// ============================================================================
// CROSS-INSTANCE FAN-OUT — the actual reason this needs Redis at all.
// ----------------------------------------------------------------------------
// chat-service runs as N replicas behind the NGINX load balancer. If user A
// is connected to pod-1 and user B (same room) is connected to pod-2, the
// in-memory ChatRoomMediator on pod-1 has no way to reach user B's socket —
// it doesn't even know pod-2 exists. Redis Pub/Sub solves this the standard
// way: every pod both publishes locally-originated messages to a shared
// channel AND subscribes to that channel, so a message sent to any pod
// reaches every pod, which then hands it to its own local ChatRoomMediator
// for delivery to its own locally-connected sockets. This is the same
// "fan-out via a shared bus" idea Kafka gives at larger scale — Redis
// Pub/Sub is the lightweight version appropriate for ephemeral chat
// fan-out.
// ============================================================================

import Redis from 'ioredis';
import { createLogger } from '@urbannest/shared';
import { ChatMessage, chatRoomMediator } from '../patterns/mediator/ChatRoomMediator';

const logger = createLogger('chat-service:pubsub');

const CHAT_CHANNEL = 'chat:broadcast';

export const publisher = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
});

const subscriber = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
});

let started = false;

export async function startFanOutBridge(): Promise<void> {
  if (started) return;
  await subscriber.subscribe(CHAT_CHANNEL);
  subscriber.on('message', (_channel, raw) => {
    try {
      const message: ChatMessage = JSON.parse(raw);
      // Deliver to whichever locally-connected participants belong to this
      // room on THIS pod. Pods with no local participants in that room are
      // a harmless no-op.
      chatRoomMediator.broadcast(message.roomId, message);
    } catch (err) {
      logger.error('Failed to parse fan-out message', { error: (err as Error).message });
    }
  });
  started = true;
  logger.info('Chat fan-out bridge subscribed', { channel: CHAT_CHANNEL });
}

export async function publishToAllPods(message: ChatMessage): Promise<void> {
  await publisher.publish(CHAT_CHANNEL, JSON.stringify(message));
}
