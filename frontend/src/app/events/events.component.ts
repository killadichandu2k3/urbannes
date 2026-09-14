import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { GraphqlService } from '../core/services/graphql.service';
import { EventItem, SearchResult, Venue } from '../core/models';

export interface EventWithVenue extends EventItem {
  venue: Venue;
}

@Component({
  selector: 'app-events',
  templateUrl: './events.component.html',
})
export class EventsComponent implements OnInit {
  movies: EventWithVenue[] = [];
  concerts: EventWithVenue[] = [];
  theatre: EventWithVenue[] = [];
  
  loading = true;
  error = '';

  constructor(private readonly graphql: GraphqlService, private readonly router: Router) {}

  ngOnInit(): void {
    forkJoin({
      events: this.graphql.events(),
      venues: this.graphql.venues(),
    }).subscribe({
      next: ({ events, venues }) => {
        const venueMap = new Map(venues.map(v => [v.id, v]));
        
        const enrichedEvents = events
          .map(e => ({ ...e, venue: venueMap.get(e.venueId)! }))
          .filter(e => e.venue && new Date(e.startsAt).getTime() > Date.now()) // Show only future events
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

        this.movies = enrichedEvents.filter(e => e.venue.venueType === 'CINEMA');
        this.concerts = enrichedEvents.filter(e => e.venue.venueType === 'STADIUM');
        this.theatre = enrichedEvents.filter(e => e.venue.venueType === 'THEATRE');

        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load events';
        this.loading = false;
      },
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  getFillPercentage(event: EventWithVenue): number {
    if (!event.stats) return 0;
    const total = event.stats.seatsSold + event.stats.seatsRemaining;
    if (total === 0) return 0;
    return Math.round((event.stats.seatsSold / total) * 100);
  }

  getTrendingStatus(event: EventWithVenue): { label: string, icon: string } | null {
    const fill = this.getFillPercentage(event);
    if (fill > 85) return { label: 'Fast Filling', icon: 'fire' };
    if (fill > 50) return { label: 'Trending', icon: 'trending' };
    if (event.stats && event.stats.seatsSold > 100) return { label: `${event.stats.seatsSold}+ Booked`, icon: 'users' };
    return null;
  }

  onSearchSelect(result: SearchResult): void {
    if (result.kind === 'EVENT') {
      this.router.navigate(['/events', result.id, 'seats']);
    }
  }
}
