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
