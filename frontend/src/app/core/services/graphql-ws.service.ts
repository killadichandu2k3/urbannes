// ============================================================================
// graphql-ws client — subscribes to seatMapUpdated/bookingUpdated so the
// seat picker updates live when ANY user (not just you) locks/releases/
// confirms a seat. Angular port of wsClient.ts — kept as a direct
// graphql-ws client (not routed through apollo-angular's subscription
// link) to match the original's architecture exactly: this deliberately
// bypasses the Apollo Gateway's HTTP path entirely, connecting straight to
// booking-api's WS endpoint via NGINX's /graphql/ws passthrough (see
// gateway-graphql's server.ts and the nginx.conf routing notes for why
// subscriptions stay out of band from GraphQL Federation).
// ============================================================================

import { Injectable } from '@angular/core';
import { createClient, Client } from 'graphql-ws';
import { Observable } from 'rxjs';
import { SeatMapUpdate, BookingUpdate } from '../models';

@Injectable({ providedIn: 'root' })
export class GraphqlWsService {
  private client: Client | null = null;

  private getClient(): Client {
    if (this.client) return this.client;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.client = createClient({ url: `${protocol}//${window.location.host}/graphql/ws` });
    return this.client;
  }

  seatMapUpdated(eventId: string): Observable<SeatMapUpdate> {
    return new Observable((subscriber) => {
      const query = `subscription SeatMapUpdated($eventId: ID!) { seatMapUpdated(eventId: $eventId) { eventId seatId status } }`;
      const unsubscribe = this.getClient().subscribe(
        { query, variables: { eventId } },
        {
          next: (msg) => {
            const data = (msg.data as any)?.seatMapUpdated;
            if (data) subscriber.next(data);
          },
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        },
      );
      return unsubscribe;
    });
  }

  bookingUpdated(bookingId: string): Observable<BookingUpdate> {
    return new Observable((subscriber) => {
      const query = `subscription BookingUpdated($bookingId: ID!) { bookingUpdated(bookingId: $bookingId) { bookingId eventId status message } }`;
      const unsubscribe = this.getClient().subscribe(
        { query, variables: { bookingId } },
        {
          next: (msg) => {
            const data = (msg.data as any)?.bookingUpdated;
            if (data) subscriber.next(data);
          },
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        },
      );
      return unsubscribe;
    });
  }
}
