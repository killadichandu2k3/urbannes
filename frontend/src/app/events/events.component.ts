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
              // Defensive: build venue map
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

              // Enrich events with venues
              const enrichedEvents: EventWithVenue[] = [];

              for (const event of events) {
                // Skip events without venueId
                if (!event || !event.venueId) {
                  continue;
                }

                // Get venue
                const venue = venueMap.get(event.venueId);
                if (!venue) {
                  continue; // Skip if venue not found
                }

                enrichedEvents.push({ ...event, venue });
              }

              // Sort by date (earliest first)
              enrichedEvents.sort(
                (a, b) =>
                  new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
              );

              // Categorize safely across venue types with priority sorting:
              // 1. Trending first
              // 2. Fast Filling second
              // 3. Available and Sold Out mixed
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

  getEventRank(event: EventWithVenue): number {
    const status = this.getTrendingStatus(event);
    if (status?.icon === 'trending') return 1; // 1. Trending first
    if (status?.icon === 'fire') return 2;     // 2. Then Fast Filling
    return 3;                                 // 3. Then Available and Sold Out mixed
  }

  private sortEvents(events: EventWithVenue[]): EventWithVenue[] {
    return [...events].sort((a, b) => {
      const rankA = this.getEventRank(a);
      const rankB = this.getEventRank(b);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      // Within the same rank (including available and sold out mixed),
      // sort chronologically by event start date
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
    if (total === 0) return 0;
    return Math.round((event.stats.seatsSold / total) * 100);
  }

  getTrendingStatus(
    event: EventWithVenue
  ): { label: string; icon: string } | null {
    if (!event.bookingOpen) return null;

    const fill = this.getFillPercentage(event);
    const sold = event.stats?.seatsSold ?? 0;

    // 1. Trending: 40% to 74% booked with strong momentum
    if (fill >= 40 && fill < 75) {
      return { label: 'Trending', icon: 'trending' };
    }

    // 2. Fast Filling: 75% or higher occupancy
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
