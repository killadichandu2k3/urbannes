import { Component, OnInit } from '@angular/core';
import { GraphqlService } from '../core/services/graphql.service';
import { AuthService } from '../core/services/auth.service';
import { EventItem } from '../core/models';

@Component({
  selector: 'app-landing',
  templateUrl: './landing.component.html',
})
export class LandingComponent implements OnInit {

  featuredEvents: EventItem[] = [];
  loadingEvents = true;

  constructor(private readonly graphql: GraphqlService, public readonly auth: AuthService) {}

  ngOnInit(): void {
    this.graphql.events().subscribe({
      next: (events) => {
        this.featuredEvents = events
          .filter((e) => e.bookingOpen)
          .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime())
          .slice(0, 3);
        this.loadingEvents = false;
      },
      error: () => {

        this.loadingEvents = false;
      },
    });
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
}
