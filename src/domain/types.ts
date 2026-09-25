/** Geographic coordinates. Inside the domain always `{ lat, lng }`; MapLibre's `[lng, lat]` lives in `src/ui/map/`. */
export interface LatLng {
  lat: number;
  lng: number;
}

/** A Metrobus line, e.g. 'S1' | 'S2' | 'U1' | 'U2' | 'U3' in the current data. */
export type LineId = string;

export type Direction = 'outbound' | 'inbound';

/** Timetable day type: weekday (`DU`), Saturday (`Sab`), Sunday and public holidays (`Dom`). */
export type DayType = 'DU' | 'Sab' | 'Dom';

export interface Stop {
  id: string;
  code: string;
  name: string;
  lines: LineId[];
  coords: LatLng;
  suburbanOnly: boolean;
}

export interface Shape {
  id: string;
  line: LineId;
  direction: Direction;
  color: string;
  points: LatLng[];
}

export interface StopTime {
  stopId: string;
  /** Seconds since the service day's midnight (Europe/Lisbon). May exceed 86400 for trips after midnight. */
  seconds: number;
}

export interface Trip {
  id: string;
  line: LineId;
  direction: Direction;
  dayType: DayType;
  destination: string;
  stopTimes: StopTime[];
}

export type DataSource = 'scheduled' | 'live';

export interface BusPosition {
  tripId: string;
  line: LineId;
  direction: Direction;
  coords: LatLng;
  source: DataSource;
  /** When the position was estimated or observed, UTC ISO 8601. */
  at: string;
  nextStopId: string;
  arrivalAtStopSeconds: number;
}

export interface Network {
  stops: Stop[];
  shapes: Shape[];
  lineColors: Record<LineId, string>;
  /** When the source data was fetched, UTC ISO 8601. */
  fetchedAt: string;
}
