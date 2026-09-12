import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { GraphqlService } from '../core/services/graphql.service';
import { GraphqlWsService } from '../core/services/graphql-ws.service';
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
    private readonly graphql: GraphqlService,
    private readonly graphqlWs: GraphqlWsService,
  ) {}

  ngOnInit(): void {
    // route params, not @Input() props — the Vue version received eventId
    // as a router-passed prop (`props: true` in the route config); the
    // Angular idiom for the same "route param as component data" pattern
    // is reading it off ActivatedRoute.
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
    return seat ? `${seat.rowLabel}${seat.seatNumber} (${seat.tier})` : seatId;
  }

  seatClasses(seat: Seat): string {
    const statusClass = this.selected.has(seat.id) ? 'SELECTED' : seat.status;
    return `${statusClass} ${seat.tier}`;
  }

  toggleSeat(seat: Seat): void {
    if (seat.status !== 'AVAILABLE') return;
    if (this.selected.has(seat.id)) this.selected.delete(seat.id);
    else this.selected.add(seat.id);
    // Reassign to a new Set so Angular's change detection sees a new
    // reference — mirrors the Vue version's `selected.value = new
    // Set(selected.value)` reactivity trick, same reason.
    this.selected = new Set(this.selected);
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
          // In this build the ACCEPTED reply carries a human-readable
          // message rather than the generated booking id — see README
          // "Extension points" for wiring the full id through for
          // one-click payment confirmation directly from this screen.
          this.loadSeatMap();
          this.selected = new Set();
          this.booking = false;
        },
        error: (err) => {
          this.error = err.message || 'Booking failed';
          this.booking = false;
        },
      });
  }
}
