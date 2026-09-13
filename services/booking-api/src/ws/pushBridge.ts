// ============================================================================
// WEBSOCKET PUSH LAYER
// ----------------------------------------------------------------------------
// Separate from the request/reply channel. booking-worker, after completing
// a write, publishes to Redis Pub/Sub channel `push:booking` or
// `push:seatmap` (fire-and-forget broadcast — NOT keyed to one requestId).
// This process re-broadcasts those to any connected GraphQL subscription
// clients over WebSocket (via graphql-ws), giving "other users watching the
// same seat map see it update live" — the actual behavior you'd want from
// a BookMyShow-style seat picker, not just the original requester.
// ============================================================================

import Redis from 'ioredis';
import { PubSub } from 'graphql-subscriptions';
import { createLogger } from '@urbannes/shared';

const logger = createLogger('booking-api:ws-push');

export const pubsub = new PubSub();

export const BOOKING_UPDATED = 'BOOKING_UPDATED';
export const SEAT_MAP_UPDATED = 'SEAT_MAP_UPDATED';

const pushSubscriber = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT || 6379),
});

export async function startPushBridge(): Promise<void> {
  await pushSubscriber.subscribe('push:booking', 'push:seatmap');
  pushSubscriber.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message);
      if (channel === 'push:booking') {
        pubsub.publish(BOOKING_UPDATED, { bookingUpdated: data });
      } else if (channel === 'push:seatmap') {
        pubsub.publish(SEAT_MAP_UPDATED, { seatMapUpdated: data });
      }
    } catch (err) {
      logger.error('Failed to parse push message', { channel, error: (err as Error).message });
    }
  });
  logger.info('WebSocket push bridge listening on push:booking, push:seatmap');
}
