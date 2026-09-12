import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { GraphqlService } from '../core/services/graphql.service';
import { GraphqlWsService } from '../core/services/graphql-ws.service';
import { AuthService } from '../core/services/auth.service';
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
  booking = false;
  activeBooking: { status: string; message: string } | null = null;

  private seatMapSub: Subscription | null = null;

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly graphql: GraphqlService,
    private readonly graphqlWs: GraphqlWsService,
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

  createBooking(): void {
    if (!this.auth.isLoggedIn) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    this.booking = true;
    this.error = '';
    this.graphql
      .createBooking({
        eventId: this.eventId,
        seatIds: Array.from(this.selected),
      })
      .subscribe({
        next: (data) => {
          this.activeBooking = { status: data.status, message: data.message };
          this.loadSeatMap();
          this.selected = new Set();
          this.booking = false;
        },
        error: (err) => {
          this.error = err.message || 'Booking failed. Please try again.';
          this.booking = false;
        },
      });
  }
}
