// ============================================================================
// PATTERN: BUILDER — assembles a Booking from its many optional parts
// (seats, add-ons, discount code) in validated, fluent steps instead of a
// giant constructor or a raw object literal that could be half-formed.
// ============================================================================

export interface SeatSelection {
  seatId: string;
  rowLabel: string;
  seatNumber: number;
  tier: 'PLATINUM' | 'GOLD' | 'SILVER';
}

export interface AddOnLine {
  code: string;
  price: number;
}

export interface BookingDraft {
  userId: string;
  eventId: string;
  seats: SeatSelection[];
  addOns: AddOnLine[];
  discountCode?: string;
  basePrice: number;
}

export class BookingBuilder {
  private userId!: string;
  private eventId!: string;
  private seats: SeatSelection[] = [];
  private addOns: AddOnLine[] = [];
  private discountCode?: string;
  private basePrice = 0;

  setUser(userId: string): this {
    this.userId = userId;
    return this;
  }
  setEvent(eventId: string): this {
    this.eventId = eventId;
    return this;
  }
  addSeat(seat: SeatSelection, price: number): this {
    this.seats.push(seat);
    this.basePrice += price;
    return this;
  }
  addOn(addOn: AddOnLine): this {
    this.addOns.push(addOn);
    this.basePrice += addOn.price;
    return this;
  }
  applyDiscountCode(code: string): this {
    this.discountCode = code;
    return this;
  }

  build(): BookingDraft {
    if (!this.userId) throw new Error('BookingBuilder: userId is required');
    if (!this.eventId) throw new Error('BookingBuilder: eventId is required');
    if (this.seats.length === 0) throw new Error('BookingBuilder: at least one seat is required');
    return {
      userId: this.userId,
      eventId: this.eventId,
      seats: this.seats,
      addOns: this.addOns,
      discountCode: this.discountCode,
      basePrice: this.basePrice,
    };
  }
}
