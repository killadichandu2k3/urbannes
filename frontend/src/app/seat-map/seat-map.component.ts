import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GraphqlService } from '../core/services/graphql.service';
import { GraphqlWsService } from '../core/services/graphql-ws.service';
import { AuthService } from '../core/services/auth.service';
import { RazorpayCheckoutService } from '../core/services/razorpay-checkout.service';
import { Seat, SeatMap } from '../core/models';

@Component({
  selector: 'app-seat-map',
  templateUrl: './seat-map.component.html',
})
export class SeatMapComponent implements OnInit, OnDestroy {
  eventId = '';
  seatMap: SeatMap | null = null;
  selected = new Set<string>();
  loading = true;
  error = '';

  // Checkout progresses through these phases; the template shows different
  // panels for each rather than a single boolean "booking in progress" flag,
  // since "seats held, awaiting payment" and "payment confirmed" need very
  // different UI (a Pay button vs a ticket).
  phase: 'SELECTING' | 'CREATING_BOOKING' | 'AWAITING_PAYMENT' | 'CONFIRMING' | 'CONFIRMED' = 'SELECTING';
  activeBookingId: string | null = null;
  confirmedBooking: { bookingId: string; message: string } | null = null;

  private seatMapSub: Subscription | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly graphql: GraphqlService,
    private readonly graphqlWs: GraphqlWsService,
    private readonly razorpay: RazorpayCheckoutService,
    public readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.eventId = this.route.snapshot.paramMap.get('eventId') || '';
    this.loadSeatMap();

    this.seatMapSub = this.graphqlWs.seatMapUpdated(this.eventId).subscribe((update) => {
      if (!this.seatMap) return;
      const seat = this.seatMap.seats.find((s) => s.id === update.seatId);
      if (seat) seat.status = update.status;
    });
  }

  ngOnDestroy(): void {
    this.seatMapSub?.unsubscribe();
  }

  seatLabel(seatId: string): string {
    const seat = this.seatMap?.seats.find((s) => s.id === seatId);
    return seat ? `Row ${seat.rowLabel}, Seat ${seat.seatNumber} (${seat.tier})` : seatId;
  }

  seatClasses(seat: Seat): string {
    const statusClass = this.selected.has(seat.id) ? 'SELECTED' : seat.status;
    return `${statusClass} ${seat.tier}`;
  }

  toggleSeat(seat: Seat): void {
    if (seat.status !== 'AVAILABLE') return;
    if (this.selected.has(seat.id)) this.selected.delete(seat.id);
    else this.selected.add(seat.id);
    this.selected = new Set(this.selected);
  }

  calculateTotal(): number {
    if (!this.seatMap) return 0;
    let total = 0;
    const basePrice = 500; // default base estimate
    for (const id of this.selected) {
      const seat = this.seatMap.seats.find((s) => s.id === id);
      if (seat) {
        let mult = 1.0;
        if (seat.tier === 'VIP') mult = 2.0;
        else if (seat.tier === 'PLATINUM') mult = 1.5;
        else if (seat.tier === 'GOLD') mult = 1.25;
        total += Math.round(basePrice * mult);
      }
    }
    return total;
  }

  loadSeatMap(): void {
    this.loading = true;
    this.graphql.seatMap(this.eventId).subscribe({
      next: (seatMap) => {
        this.seatMap = seatMap;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load seat map';
        this.loading = false;
      },
    });
  }

  /** Step 1: lock the seats (unchanged backend call — still just CREATE_BOOKING). */
  createBooking(): void {
    if (!this.auth.isLoggedIn) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    this.phase = 'CREATING_BOOKING';
    this.error = '';
    this.graphql
      .createBooking({ eventId: this.eventId, seatIds: Array.from(this.selected) })
      .subscribe({
        next: (data) => {
          if (!data.bookingId) {
            this.error = 'Booking was created but no booking id was returned — cannot continue to payment.';
            this.phase = 'SELECTING';
            return;
          }
          this.activeBookingId = data.bookingId;
          this.loadSeatMap();
          this.startPayment(data.bookingId);
        },
        error: (err) => {
          this.error = err.message || 'Booking failed. Please try again.';
          this.phase = 'SELECTING';
        },
      });
  }

  /** Step 2: open Razorpay Checkout for the locked booking's price. */
  private startPayment(bookingId: string): void {
    this.phase = 'AWAITING_PAYMENT';
    this.graphql.createPaymentOrder(bookingId, this.eventId).subscribe({
      next: (order) => {
        this.razorpay
          .open(order, {
            description: `UrbanNest booking ${bookingId}`,
            userEmail: this.auth.currentUser?.email,
            userName: this.auth.currentUser?.displayName,
          })
          .then((response) => this.confirmPayment(bookingId, response))
          .catch((err: Error) => {
            // A dismissed widget isn't a hard error — the seats stay held
            // (5-minute TTL — see booking-worker's seat_locks) and the
            // person can retry payment without re-selecting seats, so
            // this returns to the summary panel rather than SELECTING.
            this.error = err.message === 'dismissed' ? 'Payment was cancelled. Your seats are still held — you can try again.' : err.message;
            this.phase = 'SELECTING';
          });
      },
      error: (err) => {
        this.error = err.message || 'Could not start payment. Please try again.';
        this.phase = 'SELECTING';
      },
    });
  }

  /** Step 3: server-side signature verification, then real confirmation. */
  private confirmPayment(bookingId: string, response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }): void {
    this.phase = 'CONFIRMING';
    this.graphql
      .confirmPayment({
        bookingId,
        eventId: this.eventId,
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      })
      .subscribe({
        next: (data) => {
          this.confirmedBooking = { bookingId, message: data.message };
          this.phase = 'CONFIRMED';
          this.selected = new Set();
          this.loadSeatMap();
        },
        error: (err) => {
          this.error = err.message || 'Payment succeeded but confirmation failed — contact support with your payment id.';
          this.phase = 'SELECTING';
        },
      });
  }
}
