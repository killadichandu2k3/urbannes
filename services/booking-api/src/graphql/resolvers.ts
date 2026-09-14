import { GraphQLError } from 'graphql';
import { requestReply } from '../kafka/requestReply';
import { pubsub, BOOKING_UPDATED, SEAT_MAP_UPDATED } from '../ws/pushBridge';
import { createLogger, extractBearerToken, verifyAuthToken } from '@urbannes/shared';

const logger = createLogger('booking-api:resolvers');

function unwrapOrThrow<T>(reply: { ok: boolean; data?: T; error?: string }): T {
  if (!reply.ok) throw new Error(reply.error || 'Upstream request failed');
  return reply.data as T;
}

function requireAuth(context: any): { userId: string; email: string; displayName: string } {
  const token = extractBearerToken(context?.headers);
  const payload = verifyAuthToken(token);
  if (!payload) {
    throw new GraphQLError('You must be signed in to do this.', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  return payload;
}

export const resolvers = {
  Query: {
    venues: async () => {
      const reply = await requestReply('LIST_VENUES', {});
      return unwrapOrThrow(reply);
    },
    events: async () => {
      const reply = await requestReply('LIST_EVENTS', {});
      return unwrapOrThrow(reply);
    },
    event: async (_: unknown, args: { id: string }) => {
      const reply = await requestReply('GET_EVENT', { eventId: args.id });
      return unwrapOrThrow(reply);
    },
    seatMap: async (_: unknown, args: { eventId: string }) => {
      const reply = await requestReply<{ eventId: string }, any>('GET_SEAT_MAP', { eventId: args.eventId });
      const data = unwrapOrThrow(reply);
      return { ...data, servedFromCache: reply.servedFromCache ?? false };
    },
    booking: async (_: unknown, args: { id: string; eventId: string }) => {
      const reply = await requestReply<{ bookingId: string; eventId: string }, any>('GET_BOOKING', {
        bookingId: args.id,
        eventId: args.eventId,
      });
      const data = unwrapOrThrow(reply);
      return data ?? null;
    },
    myBookings: async (_: unknown, __: unknown, context: any) => {
      const { userId } = requireAuth(context);
      const reply = await requestReply<{ userId: string }, any[]>('LIST_MY_BOOKINGS', { userId });
      return unwrapOrThrow(reply);
    },
  },

  Mutation: {
    createBooking: async (_: unknown, args: { input: any }, context: any) => {
      const { userId } = requireAuth(context);
      const reply = await requestReply<any, { requestId: string; bookingId: string; message: string }>('CREATE_BOOKING', {
        ...args.input,
        userId,
      });
      const data = unwrapOrThrow(reply);
      logger.info('createBooking accepted', { requestId: data.requestId, bookingId: data.bookingId, userId });
      return { requestId: data.requestId, status: 'ACCEPTED', message: data.message, bookingId: data.bookingId };
    },
    createPaymentOrder: async (_: unknown, args: { bookingId: string; eventId: string }, context: any) => {
      const { userId } = requireAuth(context);
      const reply = await requestReply<typeof args & { userId: string }, { orderId: string; amount: number; currency: string; keyId: string }>(
        'CREATE_PAYMENT_ORDER',
        { ...args, userId },
      );
      return unwrapOrThrow(reply);
    },
    confirmPayment: async (
      _: unknown,
      args: { bookingId: string; eventId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
      context: any,
    ) => {
      const { userId } = requireAuth(context);

      const reply = await requestReply<typeof args & { userId: string }, { requestId: string; message: string }>(
        'CONFIRM_PAYMENT',
        { ...args, userId },
      );
      const data = unwrapOrThrow(reply);
      return { requestId: data.requestId, status: 'ACCEPTED', message: data.message };
    },
    cancelBooking: async (_: unknown, args: { bookingId: string; eventId: string }, context: any) => {
      const { userId } = requireAuth(context);
      const reply = await requestReply<typeof args & { userId: string }, { requestId: string; message: string }>(
        'CANCEL_BOOKING',
        { ...args, userId },
      );
      const data = unwrapOrThrow(reply);
      return { requestId: data.requestId, status: 'ACCEPTED', message: data.message };
    },
    createShortLink: async (_: unknown, args: { targetUrl: string }) => {
      const reply = await requestReply<{ targetUrl: string }, any>('CREATE_SHORT_LINK', { targetUrl: args.targetUrl });
      const data = unwrapOrThrow(reply);
      return data;
    },
  },

  Subscription: {
    bookingUpdated: {

      subscribe: () => (pubsub as any).asyncIterator([BOOKING_UPDATED]),
      resolve: (payload: any) => {
        return payload.bookingUpdated;
      },
    },
    seatMapUpdated: {
      subscribe: () => (pubsub as any).asyncIterator([SEAT_MAP_UPDATED]),
      resolve: (payload: any) => payload.seatMapUpdated,
    },
  },
};
