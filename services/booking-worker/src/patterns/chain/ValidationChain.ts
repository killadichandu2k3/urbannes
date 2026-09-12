// ============================================================================
// PATTERN: CHAIN OF RESPONSIBILITY — a booking request passes through
// independent validators (auth, event-open, seat-count, fraud) before seats
// get locked. Each checker only knows its own job; new checks slot in
// without touching existing ones.
// ============================================================================

export interface BookingRequestContext {
  userId: string;
  eventId: string;
  seatIds: string[];
  eventBookingOpen: boolean;
}

export interface ValidationResult {
  passed: boolean;
  reason?: string;
}

export abstract class BookingValidator {
  private next?: BookingValidator;
  setNext(validator: BookingValidator): BookingValidator {
    this.next = validator;
    return validator;
  }
  handle(ctx: BookingRequestContext): ValidationResult {
    const result = this.check(ctx);
    if (!result.passed) return result;
    return this.next ? this.next.handle(ctx) : { passed: true };
  }
  protected abstract check(ctx: BookingRequestContext): ValidationResult;
}

class AuthValidator extends BookingValidator {
  protected check(ctx: BookingRequestContext): ValidationResult {
    return ctx.userId ? { passed: true } : { passed: false, reason: 'User not authenticated' };
  }
}
class EventOpenValidator extends BookingValidator {
  protected check(ctx: BookingRequestContext): ValidationResult {
    return ctx.eventBookingOpen ? { passed: true } : { passed: false, reason: 'Booking window is closed for this event' };
  }
}
class SeatCountValidator extends BookingValidator {
  protected check(ctx: BookingRequestContext): ValidationResult {
    if (ctx.seatIds.length === 0) return { passed: false, reason: 'At least one seat must be selected' };
    if (ctx.seatIds.length > 10) return { passed: false, reason: 'Cannot book more than 10 seats at once' };
    return { passed: true };
  }
}

export function buildDefaultValidationChain(): BookingValidator {
  const auth = new AuthValidator();
  const eventOpen = new EventOpenValidator();
  const seatCount = new SeatCountValidator();
  auth.setNext(eventOpen).setNext(seatCount);
  return auth;
}
