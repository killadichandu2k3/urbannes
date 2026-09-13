import { Component, OnInit } from '@angular/core';
import { forkJoin } from 'rxjs';
import { GraphqlService } from '../core/services/graphql.service';
import { AuthService } from '../core/services/auth.service';
import { Booking, EventItem } from '../core/models';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  loading = true;
  // The single soonest CONFIRMED/PAYMENT_PENDING/SEATS_LOCKED booking, if
  // any — a post-login home's most useful job is answering "what do I have
  // coming up" in one glance, not repeating the full My Bookings list.
  nextBooking: Booking | null = null;
  nextBookingEvent: EventItem | null = null;
  featuredEvents: EventItem[] = [];

  constructor(private readonly graphql: GraphqlService, public readonly auth: AuthService) {}

  ngOnInit(): void {
    forkJoin({
      bookings: this.graphql.myBookings(),
      events: this.graphql.events(),
    }).subscribe({
      next: ({ bookings, events }) => {
        const eventsById = new Map(events.map((e) => [e.id, e]));

        const upcoming = bookings
          .filter((b) => b.status !== 'CANCELLED' && b.status !== 'EXPIRED')
          .map((b) => ({ booking: b, event: eventsById.get(b.eventId) }))
          .filter((pair): pair is { booking: Booking; event: EventItem } => !!pair.event)
          .filter((pair) => new Date(pair.event.startsAt).getTime() > Date.now())
          .sort((a, b) => new Date(a.event.startsAt).getTime() - new Date(b.event.startsAt).getTime());

        if (upcoming.length > 0) {
          this.nextBooking = upcoming[0].booking;
          this.nextBookingEvent = upcoming[0].event;
        }

        this.featuredEvents = events
          .filter((e) => e.bookingOpen)
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
          .slice(0, 3);

        this.loading = false;
      },
      error: () => {
        this.loading = false;
      },
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  get firstName(): string {
    const name = this.auth.currentUser?.displayName ?? '';
    return name.split(' ')[0] || name;
  }
}
