// ============================================================================
// GraphQL service — talks to /graphql, which NGINX reverse-proxies
// through to the Apollo Gateway's composed booking + analytics + auth
// schema. Every method here corresponds 1:1 to a
// query/mutation booking-api's resolvers expose, same as the old
// graphqlClient.ts — this is an Angular-idiomatic port (apollo-angular +
// RxJS Observables) of that same file, not a behavior change.
// ============================================================================

import { Injectable } from '@angular/core';
import { Apollo, gql } from 'apollo-angular';
import { Observable, map } from 'rxjs';
import { Booking, BookingAccepted, AppNotification, EventItem, PaymentOrder, SearchResult, SeatMap, Venue } from '../models';

const SEARCH_QUERY = gql`
  query Search($query: String!, $limit: Int) {
    search(query: $query, limit: $limit) { kind id title subtitle }
  }
`;

const VENUES_QUERY = gql`
  query Venues {
    venues { id name venueType city }
  }
`;

const EVENTS_QUERY = gql`
  query Events {
    events { 
      id title venueId startsAt endsAt basePrice bookingOpen 
      stats { seatsSold seatsRemaining }
    }
  }
`;

const SEAT_MAP_QUERY = gql`
  query SeatMap($eventId: ID!) {
    seatMap(eventId: $eventId) {
      eventId venueId servedFromCache
      seats { id rowLabel seatNumber tier status }
    }
  }
`;

const MY_BOOKINGS_QUERY = gql`
  query MyBookings {
    myBookings {
      id eventId status basePrice finalPrice seatIds addOnCodes createdAt
    }
  }
`;

const CREATE_BOOKING_MUTATION = gql`
  mutation CreateBooking($input: CreateBookingInput!) {
    createBooking(input: $input) { requestId status message bookingId }
  }
`;

const CREATE_PAYMENT_ORDER_MUTATION = gql`
  mutation CreatePaymentOrder($bookingId: String!, $eventId: String!) {
    createPaymentOrder(bookingId: $bookingId, eventId: $eventId) { orderId amount currency keyId }
  }
`;

const CANCEL_BOOKING_MUTATION = gql`
  mutation CancelBooking($bookingId: String!, $eventId: String!) {
    cancelBooking(bookingId: $bookingId, eventId: $eventId) { requestId status message }
  }
`;

const CONFIRM_PAYMENT_MUTATION = gql`
  mutation ConfirmPayment(
    $bookingId: String!
    $eventId: String!
    $razorpayOrderId: String!
    $razorpayPaymentId: String!
    $razorpaySignature: String!
  ) {
    confirmPayment(
      bookingId: $bookingId
      eventId: $eventId
      razorpayOrderId: $razorpayOrderId
      razorpayPaymentId: $razorpayPaymentId
      razorpaySignature: $razorpaySignature
    ) { requestId status message }
  }
`;

const MY_NOTIFICATIONS_QUERY = gql`
  query MyNotifications {
    myNotifications { id title body readAt createdAt }
  }
`;

const MARK_NOTIFICATION_READ_MUTATION = gql`
  mutation MarkNotificationRead($id: ID!) {
    markNotificationRead(id: $id)
  }
`;

const MARK_ALL_NOTIFICATIONS_READ_MUTATION = gql`
  mutation MarkAllNotificationsRead {
    markAllNotificationsRead
  }
`;

const DELETE_NOTIFICATION_MUTATION = gql`
  mutation DeleteNotification($id: ID!) {
    deleteNotification(id: $id)
  }
`;

@Injectable({ providedIn: 'root' })
export class GraphqlService {
  constructor(private readonly apollo: Apollo) {}

  search(query: string, limit = 10): Observable<SearchResult[]> {
    // Hits analytics-api's search resolver (Apollo Gateway routes it
    // there automatically — see gateway-graphql). That resolver queries
    // Postgres directly (cache-aside through Redis — see analytics-api's
    // cache/statsCache.ts), bypassing booking-api's Kafka request/reply
    // path entirely — search traffic never touches the OLTP write path or
    // its queue.
    return this.apollo
      .watchQuery<{ search: SearchResult[] }>({
        query: SEARCH_QUERY,
        variables: { query, limit },
        fetchPolicy: 'network-only',
      })
      .valueChanges.pipe(map((result) => result.data.search));
  }

  venues(): Observable<Venue[]> {
    return this.apollo
      .watchQuery<{ venues: Venue[] }>({ query: VENUES_QUERY, fetchPolicy: 'network-only' })
      .valueChanges.pipe(map((result) => result.data.venues));
  }

  events(): Observable<EventItem[]> {
    return this.apollo
      .watchQuery<{ events: EventItem[] }>({ query: EVENTS_QUERY, fetchPolicy: 'network-only' })
      .valueChanges.pipe(map((result) => result.data.events));
  }

  seatMap(eventId: string): Observable<SeatMap> {
    return this.apollo
      .watchQuery<{ seatMap: SeatMap }>({
        query: SEAT_MAP_QUERY,
        variables: { eventId },
        fetchPolicy: 'network-only',
      })
      .valueChanges.pipe(map((result) => result.data.seatMap));
  }

  myBookings(): Observable<Booking[]> {
    return this.apollo
      .watchQuery<{ myBookings: Booking[] }>({ query: MY_BOOKINGS_QUERY, fetchPolicy: 'network-only' })
      .valueChanges.pipe(map((result) => result.data.myBookings));
  }

  createBooking(input: { eventId: string; seatIds: string[] }): Observable<BookingAccepted> {
    return this.apollo
      .mutate<{ createBooking: BookingAccepted }>({
        mutation: CREATE_BOOKING_MUTATION,
        variables: { input },
      })
      .pipe(map((result) => result.data!.createBooking));
  }

  createPaymentOrder(bookingId: string, eventId: string): Observable<PaymentOrder> {
    return this.apollo
      .mutate<{ createPaymentOrder: PaymentOrder }>({
        mutation: CREATE_PAYMENT_ORDER_MUTATION,
        variables: { bookingId, eventId },
      })
      .pipe(map((result) => result.data!.createPaymentOrder));
  }

  confirmPayment(args: {
    bookingId: string;
    eventId: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
  }): Observable<BookingAccepted> {
    return this.apollo
      .mutate<{ confirmPayment: BookingAccepted }>({
        mutation: CONFIRM_PAYMENT_MUTATION,
        variables: args,
      })
      .pipe(map((result) => result.data!.confirmPayment));
  }

  cancelBooking(bookingId: string, eventId: string): Observable<BookingAccepted> {
    return this.apollo
      .mutate<{ cancelBooking: BookingAccepted }>({
        mutation: CANCEL_BOOKING_MUTATION,
        variables: { bookingId, eventId },
      })
      .pipe(map((result) => result.data!.cancelBooking));
  }

  myNotifications(): Observable<AppNotification[]> {
    return this.apollo
      .watchQuery<{ myNotifications: AppNotification[] }>({ query: MY_NOTIFICATIONS_QUERY, fetchPolicy: 'network-only' })
      .valueChanges.pipe(map((result) => result.data.myNotifications));
  }

  markNotificationRead(id: string): Observable<boolean> {
    return this.apollo
      .mutate<{ markNotificationRead: boolean }>({ mutation: MARK_NOTIFICATION_READ_MUTATION, variables: { id } })
      .pipe(map((result) => result.data!.markNotificationRead));
  }

  markAllNotificationsRead(): Observable<boolean> {
    return this.apollo
      .mutate<{ markAllNotificationsRead: boolean }>({ mutation: MARK_ALL_NOTIFICATIONS_READ_MUTATION })
      .pipe(map((result) => result.data!.markAllNotificationsRead));
  }

  deleteNotification(id: string): Observable<boolean> {
    return this.apollo
      .mutate<{ deleteNotification: boolean }>({ mutation: DELETE_NOTIFICATION_MUTATION, variables: { id } })
      .pipe(map((result) => result.data!.deleteNotification));
  }
}
