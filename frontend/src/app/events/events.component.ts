import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { combineLatest, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { GraphqlService } from '../core/services/graphql.service';
import { EventItem, SearchResult, Venue } from '../core/models';

export interface EventWithVenue extends EventItem {
  venue: Venue;
}

@Component({
  selector: 'app-events',
  templateUrl: './events.component.html',
})
export class EventsComponent implements OnInit, OnDestroy {
  movies: EventWithVenue[] = [];
  concerts: EventWithVenue[] = [];
  theatre: EventWithVenue[] = [];

  loading = true;
  error = '';

  private readonly destroy$ = new Subject<void>();

  constructor(private readonly graphql: GraphqlService, private readonly router: Router) {}

  ngOnInit(): void {
    try {
      combineLatest({
        events: this.graphql.events(),
        venues: this.graphql.venues(),
      })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: ({ events, venues }) => {
            try {

              if (!venues || !Array.isArray(venues)) {
                this.error = 'Invalid venues data from server';
                this.loading = false;
                return;
              }

              if (!events || !Array.isArray(events)) {
                this.error = 'Invalid events data from server';
                this.loading = false;
                return;
              }

              const venueMap = new Map<string, Venue>();
              for (const venue of venues) {
                if (venue && venue.id) {
                  venueMap.set(venue.id, venue);
                }
              }

              const enrichedEvents: EventWithVenue[] = [];

              for (const event of events) {

                if (!event || !event.venueId) {
                  continue;
                }

                const venue = venueMap.get(event.venueId);
                if (!venue) {
                  continue;
                }

                enrichedEvents.push({ ...event, venue });
              }

              enrichedEvents.sort(
                (a, b) =>
                  new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
              );

              this.movies = this.sortEvents(
                enrichedEvents.filter(
                  (e) => (e.venue?.venueType || '').toUpperCase() === 'CINEMA'
                )
              );
              this.theatre = this.sortEvents(
                enrichedEvents.filter(
                  (e) => (e.venue?.venueType || '').toUpperCase() === 'THEATRE'
                )
              );
              this.concerts = this.sortEvents(
                enrichedEvents.filter((e) => {
                  const vt = (e.venue?.venueType || '').toUpperCase();
                  return vt !== 'CINEMA' && vt !== 'THEATRE';
                })
              );

              this.loading = false;
              this.error = '';
            } catch (processErr) {
              console.error('Error processing events:', processErr);
              this.error = 'Error processing event data';
              this.loading = false;
            }
          },
          error: (err) => {
            console.error('GraphQL error:', err);
            this.error =
              err?.message ||
              err?.error?.message ||
              'Failed to load events';
            this.loading = false;
          },
        });
    } catch (initErr) {
      console.error('Error initializing events:', initErr);
      this.error = 'Failed to initialize events';
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isBookingOpen(event: EventWithVenue): boolean {
    if (!event.bookingOpen) return false;
    if (event.stats && event.stats.seatsRemaining <= 0) return false;
    return true;
  }

  getEventRank(event: EventWithVenue): number {
    if (!this.isBookingOpen(event)) return 4;
    const status = this.getTrendingStatus(event);
    if (status?.icon === 'trending') return 1;
    if (status?.icon === 'fire') return 2;
    return 3;
  }

  private sortEvents(events: EventWithVenue[]): EventWithVenue[] {
    return [...events].sort((a, b) => {
      const rankA = this.getEventRank(a);
      const rankB = this.getEventRank(b);
      if (rankA !== rankB) {
        return rankA - rankB;
      }

      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  }

  getFillPercentage(event: EventWithVenue): number {
    if (!event.stats) return 0;
    const total = event.stats.seatsSold + event.stats.seatsRemaining;
    if (total === 0) return 100;
    return Math.min(100, Math.round((event.stats.seatsSold / total) * 100));
  }

  getTrendingStatus(
    event: EventWithVenue
  ): { label: string; icon: string } | null {
    if (!this.isBookingOpen(event)) return null;

    const fill = this.getFillPercentage(event);
    const sold = event.stats?.seatsSold ?? 0;

    if (fill >= 40 && fill < 75) {
      return { label: 'Trending', icon: 'trending' };
    }

    if (fill >= 75) {
      return { label: 'Fast Filling', icon: 'fire' };
    }

    return null;
  }

  onSearchSelect(result: SearchResult): void {
    if (result.kind === 'EVENT') {
      this.router.navigate(['/events', result.id, 'seats']);
    }
  }
}
