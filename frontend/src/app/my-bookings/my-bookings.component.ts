import { Component, OnInit, OnDestroy } from '@angular/core';
import { combineLatest, Subject, timer } from 'rxjs';
import { takeUntil, retry } from 'rxjs/operators';
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

  loadBookings(): void {
    this.loading = true;
    this.error = '';

    combineLatest({
      bookings: this.graphql.myBookings(),
      events: this.graphql.events(),
    })
      .pipe(
        retry({
          count: 2,
          delay: (_, retryCount) => timer(retryCount * 1200),
          resetOnSuccess: true,
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: ({ bookings, events }) => {
          this.eventsById = new Map(events.map((e) => [e.id, e]));
          this.bookings = this.sortBookings(bookings);
          this.loading = false;
          this.error = '';
        },
        error: (err) => {
          console.error('Failed to load bookings:', err);
          this.error = this.formatUserFriendlyError(err);
          this.loading = false;
        },
      });
  }

  formatUserFriendlyError(err: any): string {
    let raw = '';
    if (err?.message) {
      raw = err.message;
    } else if (err?.error?.message) {
      raw = err.error.message;
    } else if (err?.error?.errors && Array.isArray(err.error.errors) && err.error.errors.length > 0) {
      raw = err.error.errors[0].message || '';
    } else if (err?.graphQLErrors && Array.isArray(err.graphQLErrors) && err.graphQLErrors.length > 0) {
      raw = err.graphQLErrors[0].message || '';
    } else if (typeof err === 'string') {
      raw = err;
    }

    const isTimeout = /timed out|timeout|5000ms|8000ms|10000ms/i.test(raw);
    const isNetwork = /network|failed to fetch|connection/i.test(raw);
    const isInternal = /requestid|kafka|reply|nats|graphql|internal|list_my_bookings/i.test(raw);

    if (isTimeout) {
      return 'The reservation service is taking a moment to respond. Please try again.';
    }
    if (isNetwork) {
      return 'Unable to connect to the reservation service. Please check your network connection and try again.';
    }
    if (isInternal) {
      return 'We had trouble retrieving your bookings right now. Please try again in a few moments.';
    }
    return raw || 'Unable to load bookings at this time. Please try again.';
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
          
          const errorMessage = this.formatUserFriendlyError(err) || 'Failed to cancel booking. Please try again.';
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
