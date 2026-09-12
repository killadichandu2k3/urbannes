// ============================================================================
// PATTERN: FACTORY METHOD + ABSTRACT FACTORY
// ----------------------------------------------------------------------------
// Factory Method: getVenueFactory(type) hides which concrete factory class
// gets picked.
// Abstract Factory: a "venue kit" is a family of related objects (seat map
// description + check-in strategy) that must stay consistent with each
// other — a cinema's family is never mixed with a stadium's.
// ============================================================================

export type VenueType = 'CINEMA' | 'STADIUM' | 'THEATRE';

export interface SeatMapLayout {
  describe(): string;
}
export interface CheckInStrategy {
  checkIn(seatId: string): string;
}

class CinemaSeatMap implements SeatMapLayout { describe() { return 'Cinema hall: rows A-J'; } }
class StadiumSeatMap implements SeatMapLayout { describe() { return 'Stadium: tiered sections'; } }
class TheatreSeatMap implements SeatMapLayout { describe() { return 'Theatre: orchestra + balcony'; } }

class QrCheckIn implements CheckInStrategy { checkIn(seatId: string) { return `QR validated: ${seatId}`; } }
class GateScanCheckIn implements CheckInStrategy { checkIn(seatId: string) { return `Gate scan validated: ${seatId}`; } }

export interface VenueFactory {
  createSeatMap(): SeatMapLayout;
  createCheckInStrategy(): CheckInStrategy;
}

class CinemaVenueFactory implements VenueFactory {
  createSeatMap() { return new CinemaSeatMap(); }
  createCheckInStrategy() { return new QrCheckIn(); }
}
class StadiumVenueFactory implements VenueFactory {
  createSeatMap() { return new StadiumSeatMap(); }
  createCheckInStrategy() { return new GateScanCheckIn(); }
}
class TheatreVenueFactory implements VenueFactory {
  createSeatMap() { return new TheatreSeatMap(); }
  createCheckInStrategy() { return new QrCheckIn(); }
}

export function getVenueFactory(type: VenueType): VenueFactory {
  switch (type) {
    case 'CINEMA': return new CinemaVenueFactory();
    case 'STADIUM': return new StadiumVenueFactory();
    case 'THEATRE': return new TheatreVenueFactory();
    default: throw new Error(`Unknown venue type: ${type}`);
  }
}
