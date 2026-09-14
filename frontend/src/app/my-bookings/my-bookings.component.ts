import { Component, OnInit, OnDestroy } from '@angular/core';
import { combineLatest, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GraphqlService } from '../core/services/graphql.service';
import { Booking, EventItem } from '../core/models';

@Component({
  selector: 'app-my-bookings',
  templateUrl: './my-bookings.component.html',
})
export class MyBookingsComponent implements OnInit, OnDestroy {
  bookings: Booking[] = [];
  eventsById = new Map<string, EventItem>();
  loading = true;
  error = '';
  cancellingId: string | null = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly graphql: GraphqlService) {}

  ngOnInit(): void {
    // Bookings only carry an eventId — fetch events once and join
    // client-side so the list can show a title instead of a raw id.
    this.loadBookings();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private loadBookings(): void {
    this.loading = true;
    this.error = '';
    
    combineLatest({
      bookings: this.graphql.myBookings(),
      events: this.graphql.events(),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ bookings, events }) => {
          this.eventsById = new Map(events.map((e) => [e.id, e]));
          this.bookings = bookings;
          this.loading = false;
          this.error = '';
        },
        error: (err) => {
          console.error('Failed to load bookings:', err);
          this.error = err?.message || 'Failed to load bookings';
          this.loading = false;
        },
      });
  }

  eventTitle(eventId: string): string {
    return this.eventsById.get(eventId)?.title ?? 'Event';
  }

  cancelBooking(booking: Booking): void {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    if (this.cancellingId) {
      alert('A cancellation is already in progress. Please wait.');
      return;
    }

    this.cancellingId = booking.id;

    this.graphql
      .cancelBooking(booking.id, booking.eventId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          console.log('Cancel booking response:', response);
          this.cancellingId = null;
          
          // Reload bookings to reflect the cancellation
          this.loadBookings();
          alert('Booking cancelled successfully');
        },
        error: (err) => {
          console.error('Cancel booking error:', err);
          this.cancellingId = null;
          
          // Extract error message from different error formats
          let errorMessage = 'Failed to cancel booking';
          
          if (err?.message) {
            errorMessage = err.message;
          } else if (err?.error?.message) {
            errorMessage = err.error.message;
          } else if (
            err?.error?.errors &&
            Array.isArray(err.error.errors) &&
            err.error.errors.length > 0
          ) {
            errorMessage = err.error.errors[0].message || errorMessage;
          } else if (err?.graphQLErrors && Array.isArray(err.graphQLErrors) && err.graphQLErrors.length > 0) {
            errorMessage = err.graphQLErrors[0].message || errorMessage;
          } else if (typeof err === 'string') {
            errorMessage = err;
          }

          console.error('Final error message:', errorMessage);
          alert(errorMessage);
        },
      });
  }
}
