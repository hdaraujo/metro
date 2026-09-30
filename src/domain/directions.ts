import type { Direction, Trip } from './types';

/** Which buses the sheet lists: every approaching bus, or only one direction's. */
export type DirectionFilter = 'both' | Direction;

export interface DirectionAtStop {
  direction: Direction;
  /** Distinct trip destinations, most frequent first, ties alphabetical. */
  destinations: string[];
}

const DIRECTIONS: readonly Direction[] = ['outbound', 'inbound'];
const FALLBACK_LABELS: Record<Direction, string> = { outbound: 'Outbound', inbound: 'Inbound' };

/**
 * The directions a rider can board a trip at `stopId` in, outbound first. A call at a trip's last
 * stop does not count, since the bus ends its run there; a call at its first stop does, since the
 * bus departs from there. This is the same rule the sheet's list (`upcomingArrivals`) follows.
 */
export function directionsAtStop(stopId: string, trips: Iterable<Trip>): DirectionAtStop[] {
  const counts = new Map<Direction, Map<string, number>>();
  for (const trip of trips) {
    const lastIndex = trip.stopTimes.length - 1;
    if (!trip.stopTimes.some((st, i) => i < lastIndex && st.stopId === stopId)) continue;
    let byDestination = counts.get(trip.direction);
    if (!byDestination) {
      byDestination = new Map();
      counts.set(trip.direction, byDestination);
    }
    byDestination.set(trip.destination, (byDestination.get(trip.destination) ?? 0) + 1);
  }

  const directions: DirectionAtStop[] = [];
  for (const direction of DIRECTIONS) {
    const byDestination = counts.get(direction);
    if (!byDestination) continue;
    const destinations = [...byDestination]
      .sort(([a, aCount], [b, bCount]) => bCount - aCount || a.localeCompare(b))
      .map(([destination]) => destination);
    directions.push({ direction, destinations });
  }
  return directions;
}

/** `both` → `outbound` → `inbound` → `both`. */
export function nextDirectionFilter(filter: DirectionFilter): DirectionFilter {
  if (filter === 'both') return 'outbound';
  if (filter === 'outbound') return 'inbound';
  return 'both';
}

/** Keeps the buses of the filtered direction, in their original order. */
export function busesInDirection<T extends { direction: Direction }>(
  buses: readonly T[],
  filter: DirectionFilter,
): T[] {
  return filter === 'both' ? [...buses] : buses.filter((bus) => bus.direction === filter);
}

/**
 * "Both directions", or "To A, B" from that direction's destinations. If the direction is not in
 * `directions` (or has no destinations), falls back to "Outbound" / "Inbound" — never "To ".
 */
export function directionLabel(
  filter: DirectionFilter,
  directions: readonly DirectionAtStop[],
): string {
  if (filter === 'both') return 'Both directions';
  const destinations = directions.find((d) => d.direction === filter)?.destinations ?? [];
  return destinations.length > 0 ? `To ${destinations.join(', ')}` : FALLBACK_LABELS[filter];
}
