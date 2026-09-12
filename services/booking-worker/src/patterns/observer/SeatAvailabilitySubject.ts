// ============================================================================
// PATTERN: OBSERVER — when seats are locked/released/confirmed, several
// unrelated concerns need to react (WebSocket push, in-process metrics).
// The worker just notifies the subject; observers subscribe independently
// instead of the core booking logic calling each one directly.
// ============================================================================

export type SeatEventType = 'LOCKED' | 'RELEASED' | 'CONFIRMED';

export interface SeatEvent {
  eventId: string;
  seatId: string;
  type: SeatEventType;
  at: string;
}

export interface SeatObserver {
  onSeatEvent(event: SeatEvent): void;
}

export class SeatAvailabilitySubject {
  private observers: SeatObserver[] = [];
  subscribe(observer: SeatObserver): void { this.observers.push(observer); }
  notify(event: SeatEvent): void {
    for (const observer of this.observers) observer.onSeatEvent(event);
  }
}

export class SeatMetricsObserver implements SeatObserver {
  private counts: Record<SeatEventType, number> = { LOCKED: 0, RELEASED: 0, CONFIRMED: 0 };
  onSeatEvent(event: SeatEvent): void { this.counts[event.type]++; }
  getCounts() { return { ...this.counts }; }
}

export const seatAvailabilitySubject = new SeatAvailabilitySubject();
export const seatMetricsObserver = new SeatMetricsObserver();
seatAvailabilitySubject.subscribe(seatMetricsObserver);
