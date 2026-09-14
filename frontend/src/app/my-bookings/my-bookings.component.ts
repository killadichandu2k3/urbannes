import { Component, OnInit, OnDestroy } from '@angular/core';
import { combineLatest, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GraphqlService } from '../core/services/graphql.service';
import { Booking, EventItem } from '../core/models';

export type BookingCategoryFilter = 'ALL' | 'ACTIVE' | 'HELD' | 'CANCELLED';

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
  bookingToCancel: Booking | null = null;
  notification: { type: 'success' | 'error'; message: string } | null = null;
  selectedFilter: BookingCategoryFilter = 'ALL';
  private notificationTimer: any = null;

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly graphql: GraphqlService) {}

  ngOnInit(): void {
    this.loadBookings();
  }

  ngOnDestroy(): void {
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
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
          this.bookings = this.sortBookings(bookings);
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

  /**
   * Sort hierarchy:
   * Rank 1: Active bookings (CONFIRMED, ACCEPTED)
   * Rank 2: Seats held / expired (SEATS_LOCKED, PAYMENT_PENDING, CREATED, EXPIRED)
   * Rank 3: Canceled bookings (CANCELLED)
   */
  getBookingRank(b: Booking): number {
    const s = (b.status || '').toUpperCase();
    if (s === 'CONFIRMED' || s === 'ACCEPTED') return 1;
    if (s === 'SEATS_LOCKED' || s === 'PAYMENT_PENDING' || s === 'CREATED' || s === 'EXPIRED') return 2;
    if (s === 'CANCELLED') return 3;
    return 4;
  }

  private sortBookings(bookings: Booking[]): Booking[] {
    return [...bookings].sort((a, b) => {
      const rankA = this.getBookingRank(a);
      const rankB = this.getBookingRank(b);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeB - timeA;
    });
  }

  get activeBookings(): Booking[] {
    return this.bookings.filter((b) => this.getBookingRank(b) === 1);
  }

  get heldOrExpiredBookings(): Booking[] {
    return this.bookings.filter((b) => this.getBookingRank(b) === 2);
  }

  get cancelledBookings(): Booking[] {
    return this.bookings.filter((b) => this.getBookingRank(b) === 3);
  }

  get filteredBookings(): Booking[] {
    if (this.selectedFilter === 'ACTIVE') return this.activeBookings;
    if (this.selectedFilter === 'HELD') return this.heldOrExpiredBookings;
    if (this.selectedFilter === 'CANCELLED') return this.cancelledBookings;
    return this.bookings;
  }

  setFilter(filter: BookingCategoryFilter): void {
    this.selectedFilter = filter;
  }

  eventTitle(eventId: string): string {
    return this.eventsById.get(eventId)?.title ?? 'Event';
  }

  eventDate(eventId: string): string | null {
    const event = this.eventsById.get(eventId);
    if (!event?.startsAt) return null;
    return new Date(event.startsAt).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  getStatusBadge(b: Booking): { label: string; bgClass: string; textClass: string; borderClass: string } {
    const s = (b.status || '').toUpperCase();
    if (s === 'CONFIRMED' || s === 'ACCEPTED') {
      return {
        label: 'Active Booking',
        bgClass: 'bg-emerald-500/15',
        textClass: 'text-emerald-400',
        borderClass: 'border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]',
      };
    }
    if (s === 'SEATS_LOCKED' || s === 'PAYMENT_PENDING' || s === 'CREATED') {
      return {
        label: s === 'SEATS_LOCKED' ? 'Seats Held' : (s === 'PAYMENT_PENDING' ? 'Payment Pending' : 'Seats Reserved'),
        bgClass: 'bg-amber-500/15',
        textClass: 'text-amber-300',
        borderClass: 'border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]',
      };
    }
    if (s === 'EXPIRED') {
      return {
        label: 'Hold Expired',
        bgClass: 'bg-zinc-500/15',
        textClass: 'text-zinc-400',
        borderClass: 'border-zinc-500/30',
      };
    }
    if (s === 'CANCELLED') {
      return {
        label: 'Cancelled',
        bgClass: 'bg-red-500/15',
        textClass: 'text-red-400',
        borderClass: 'border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
      };
    }
    return {
      label: b.status,
      bgClass: 'bg-white/10',
      textClass: 'text-white',
      borderClass: 'border-white/20',
    };
  }

  canCancel(b: Booking): boolean {
    const s = (b.status || '').toUpperCase();
    return s === 'CONFIRMED' || s === 'ACCEPTED' || s === 'SEATS_LOCKED' || s === 'PAYMENT_PENDING';
  }

  promptCancel(booking: Booking): void {
    this.bookingToCancel = booking;
  }

  closeCancelModal(): void {
    if (this.cancellingId) return;
    this.bookingToCancel = null;
  }

  confirmCancel(): void {
    if (!this.bookingToCancel) return;
    const booking = this.bookingToCancel;

    if (this.cancellingId) {
      this.showNotification('error', 'A cancellation is already in progress. Please wait.');
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
          this.bookingToCancel = null;
          this.loadBookings();
          this.showNotification('success', 'Booking cancelled successfully');
        },
        error: (err) => {
          console.error('Cancel booking error:', err);
          this.cancellingId = null;
          
          let errorMessage = 'Failed to cancel booking';
          if (err?.message) {
            errorMessage = err.message;
          } else if (err?.error?.message) {
            errorMessage = err.error.message;
          } else if (err?.error?.errors && Array.isArray(err.error.errors) && err.error.errors.length > 0) {
            errorMessage = err.error.errors[0].message || errorMessage;
          } else if (err?.graphQLErrors && Array.isArray(err.graphQLErrors) && err.graphQLErrors.length > 0) {
            errorMessage = err.graphQLErrors[0].message || errorMessage;
          } else if (typeof err === 'string') {
            errorMessage = err;
          }

          this.showNotification('error', errorMessage);
        },
      });
  }

  showNotification(type: 'success' | 'error', message: string): void {
    this.notification = { type, message };
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
    this.notificationTimer = setTimeout(() => {
      this.notification = null;
    }, 5000);
  }

  dismissNotification(): void {
    this.notification = null;
    if (this.notificationTimer) {
      clearTimeout(this.notificationTimer);
    }
  }
}
