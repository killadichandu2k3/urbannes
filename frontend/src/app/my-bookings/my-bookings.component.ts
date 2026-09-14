import { Component, OnInit } from '@angular/core';
import { combineLatest } from 'rxjs';
import { GraphqlService } from '../core/services/graphql.service';
import { Booking, EventItem } from '../core/models';

@Component({
  selector: 'app-my-bookings',
  templateUrl: './my-bookings.component.html',
})
export class MyBookingsComponent implements OnInit {
  bookings: Booking[] = [];
  eventsById = new Map<string, EventItem>();
  loading = true;
  error = '';

  constructor(private readonly graphql: GraphqlService) {}

  ngOnInit(): void {
    // Bookings only carry an eventId — fetch events once and join
    // client-side so the list can show a title instead of a raw id.
    combineLatest({
      bookings: this.graphql.myBookings(),
      events: this.graphql.events(),
    }).subscribe({
      next: ({ bookings, events }) => {
        this.eventsById = new Map(events.map((e) => [e.id, e]));
        this.bookings = bookings;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load bookings';
        this.loading = false;
      },
    });
  }

  eventTitle(eventId: string): string {
    return this.eventsById.get(eventId)?.title ?? 'Event';
  }

  cancelBooking(booking: Booking): void {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    
    this.graphql.cancelBooking(booking.id, booking.eventId).subscribe({
      next: () => {
        // Update the booking status locally to reflect the cancellation
        booking.status = 'CANCELLED';
      },
      error: (err) => {
        alert(err.message || 'Failed to cancel booking');
      },
    });
  }
}
