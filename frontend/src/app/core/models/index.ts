export interface Venue {
  id: string;
  name: string;
  venueType: string;
  city: string;
}

export interface SearchResult {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
}

export interface EventItem {
  id: string;
  title: string;
  venueId: string;
  startsAt: string;
  endsAt: string;
  basePrice: number;
  bookingOpen: boolean;
  stats?: {
    seatsSold: number;
    seatsRemaining: number;
  };
}

export interface Seat {
  id: string;
  rowLabel: string;
  seatNumber: number;
  tier: string;
  status: string;
}

export interface SeatMap {
  eventId: string;
  venueId: string;
  seats: Seat[];
  servedFromCache: boolean;
}

export interface Booking {
  id: string;
  userId: string;
  eventId: string;
  status: string;
  basePrice: number;
  finalPrice: number;
  seatIds: string[];
  addOnCodes: string[];
  createdAt: string;
  updatedAt?: string;
}

export interface BookingAccepted {
  requestId: string;
  status: string;
  message: string;
  bookingId?: string | null;
}

export interface SeatMapUpdate {
  eventId: string;
  seatId: string;
  status: string;
}

export interface BookingUpdate {
  bookingId: string;
  eventId: string;
  status: string;
  message?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  body: string;
  sentAt: string;
}

export interface PaymentOrder {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  hasPassword: boolean;
}
