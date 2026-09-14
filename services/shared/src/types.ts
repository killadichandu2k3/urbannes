export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> {
  return { success: true, data, meta };
}

export function fail(code: string, message: string, details?: unknown): ApiError {
  return { success: false, error: { code, message, details } };
}

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  producedBy: string;
  producedAt: string;
  payload: T;
  traceId?: string;
}

export const KAFKA_TOPICS = {
  BOOKING_CREATED: 'booking.created',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_CANCELLED: 'booking.cancelled',
  PAYMENT_PROCESSED: 'payment.processed',
  NOTIFICATION_REQUESTED: 'notification.requested',
  EXPENSE_CREATED: 'expense.created',
  EXPENSE_SETTLED: 'expense.settled',
  URL_ACCESSED: 'url.accessed',

} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  strategy: 'token-bucket' | 'sliding-window' | 'fixed-window';
}
