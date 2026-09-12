import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { GraphqlService } from '../core/services/graphql.service';
import { EventItem, SearchResult } from '../core/models';

@Component({
  selector: 'app-events',
  templateUrl: './events.component.html',
})
export class EventsComponent implements OnInit {
  events: EventItem[] = [];
  loading = true;
  error = '';

  constructor(private readonly graphql: GraphqlService, private readonly router: Router) {}

  ngOnInit(): void {
    this.graphql.events().subscribe({
      next: (events) => {
        this.events = events;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.message || 'Failed to load events';
        this.loading = false;
      },
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  onSearchSelect(result: SearchResult): void {
    if (result.kind === 'EVENT') {
      this.router.navigate(['/events', result.id, 'seats']);
    }
    // VENUE results have no dedicated detail page in this app yet — a
    // venue pick just leaves its label in the search box rather than
    // navigating nowhere. A future venue-detail route is the natural
    // place to send this instead.
  }
}
