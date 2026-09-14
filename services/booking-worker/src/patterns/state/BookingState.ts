export type BookingStatus = 'CREATED' | 'SEATS_LOCKED' | 'PAYMENT_PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
export type BookingAction = 'LOCK_SEATS' | 'PAY' | 'CONFIRM' | 'CANCEL' | 'EXPIRE';

interface StateHandler {
  next(action: BookingAction): BookingStatus;
}

class CreatedState implements StateHandler {
  next(action: BookingAction): BookingStatus {
    if (action === 'LOCK_SEATS') return 'SEATS_LOCKED';
    if (action === 'CANCEL') return 'CANCELLED';
    throw new Error(`Illegal transition '${action}' from CREATED`);
  }
}
class SeatsLockedState implements StateHandler {
  next(action: BookingAction): BookingStatus {
    if (action === 'PAY') return 'PAYMENT_PENDING';
    if (action === 'CANCEL') return 'CANCELLED';
    if (action === 'EXPIRE') return 'EXPIRED';
    throw new Error(`Illegal transition '${action}' from SEATS_LOCKED`);
  }
}
class PaymentPendingState implements StateHandler {
  next(action: BookingAction): BookingStatus {
    if (action === 'CONFIRM') return 'CONFIRMED';
    if (action === 'CANCEL') return 'CANCELLED';
    if (action === 'EXPIRE') return 'EXPIRED';
    throw new Error(`Illegal transition '${action}' from PAYMENT_PENDING`);
  }
}
class ConfirmedState implements StateHandler {
  next(action: BookingAction): BookingStatus {
    if (action === 'CANCEL') return 'CANCELLED';
    throw new Error(`Illegal transition '${action}' from CONFIRMED`);
  }
}
class TerminalState implements StateHandler {
  constructor(private label: BookingStatus) {}
  next(action: BookingAction): BookingStatus {
    throw new Error(`Booking is in terminal state '${this.label}', cannot apply '${action}'`);
  }
}

const REGISTRY: Record<BookingStatus, StateHandler> = {
  CREATED: new CreatedState(),
  SEATS_LOCKED: new SeatsLockedState(),
  PAYMENT_PENDING: new PaymentPendingState(),
  CONFIRMED: new ConfirmedState(),
  CANCELLED: new TerminalState('CANCELLED'),
  EXPIRED: new TerminalState('EXPIRED'),
};

export function nextBookingStatus(current: BookingStatus, action: BookingAction): BookingStatus {
  return REGISTRY[current].next(action);
}
