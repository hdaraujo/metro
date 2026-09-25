import { dayTypeFor } from './holidays';
import { positionAt } from './interpolation';
import { previousDate, type LisbonClock } from './lisbonTime';
import { stopDistancesForTrip, type MeasuredShape } from './shape';
import type { BusPosition, DayType, Direction, LatLng, LineId, Stop, Trip } from './types';

const DAY_SECONDS = 86_400;
/** Before this Lisbon time, trips from yesterday's service day (times past 24:00) may still run. */
const PREVIOUS_SERVICE_DAY_UNTIL = 4 * 3600;

export interface BusesInput {
  /** The selected (nearest) stop, or null when none is known yet. */
  stop: Stop | null;
  clock: LisbonClock;
  tripsByDayType: ReadonlyMap<DayType, readonly Trip[]>;
  shapesById: ReadonlyMap<string, MeasuredShape>;
  stopsById: ReadonlyMap<string, Stop>;
  now: Date;
}

/** Service days whose trips may be running at `clock`, each with the offset of `clock` into it. */
function serviceDays(clock: LisbonClock): { dayType: DayType; offset: number }[] {
  const days = [{ dayType: dayTypeFor(clock.date), offset: clock.seconds }];
  if (clock.seconds < PREVIOUS_SERVICE_DAY_UNTIL) {
    days.push({
      dayType: dayTypeFor(previousDate(clock.date)),
      offset: clock.seconds + DAY_SECONDS,
    });
  }
  return days;
}

const shapeKey = (line: LineId, direction: Direction) => `${line}|${direction}`;

/** Memoised per `shapesById` map, so the lookup is built once rather than on every tick. */
const shapesByLineCache = new WeakMap<
  ReadonlyMap<string, MeasuredShape>,
  Map<string, MeasuredShape>
>();

function shapesByLine(
  shapesById: ReadonlyMap<string, MeasuredShape>,
): ReadonlyMap<string, MeasuredShape> {
  let byLine = shapesByLineCache.get(shapesById);
  if (!byLine) {
    byLine = new Map();
    for (const measured of shapesById.values()) {
      const key = shapeKey(measured.shape.line, measured.shape.direction);
      if (!byLine.has(key)) byLine.set(key, measured);
    }
    shapesByLineCache.set(shapesById, byLine);
  }
  return byLine;
}

const compareIds = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function compareBuses(a: BusPosition, b: BusPosition): number {
  const aWait = a.arrivalAtStopSeconds;
  const bWait = b.arrivalAtStopSeconds;
  if (aWait !== null && bWait !== null) return aWait - bWait || compareIds(a.tripId, b.tripId);
  if (aWait !== null) return -1;
  if (bWait !== null) return 1;
  return compareIds(a.line, b.line) || compareIds(a.tripId, b.tripId);
}

/**
 * Every bus in service at `now`, estimated from the timetable: each trip that has left its first
 * stop and not yet reached its last. Buses approaching `stop` come first, soonest first, each with
 * a countdown to the stop; the rest follow by line. Positions are estimates, so every result is
 * `source: 'scheduled'`.
 */
export function busesInService({
  stop,
  clock,
  tripsByDayType,
  shapesById,
  stopsById,
  now,
}: BusesInput): BusPosition[] {
  const shapes = shapesByLine(shapesById);
  const at = now.toISOString();
  const seen = new Set<string>();
  const buses: BusPosition[] = [];

  for (const { dayType, offset } of serviceDays(clock)) {
    for (const trip of tripsByDayType.get(dayType) ?? []) {
      if (seen.has(trip.id)) continue;
      const first = trip.stopTimes[0];
      const last = trip.stopTimes[trip.stopTimes.length - 1];
      if (!first || !last || first.seconds > offset || offset > last.seconds) continue;

      const measured = shapes.get(shapeKey(trip.line, trip.direction));
      if (!measured) continue;
      let coords: LatLng | null;
      try {
        coords = positionAt(
          trip,
          measured,
          stopDistancesForTrip(measured, trip, stopsById),
          offset,
        );
      } catch {
        // A trip that references an unknown stop is skipped; it must not blank the map.
        continue;
      }
      if (!coords) continue;

      const call = stop
        ? trip.stopTimes.find((st) => st.stopId === stop.id && st.seconds > offset)
        : undefined;
      seen.add(trip.id);
      buses.push({
        tripId: trip.id,
        line: trip.line,
        direction: trip.direction,
        destination: trip.destination,
        coords,
        source: 'scheduled',
        at,
        towardsStopId: call ? call.stopId : null,
        arrivalAtStopSeconds: call ? call.seconds - offset : null,
      });
    }
  }
  return buses.sort(compareBuses);
}

/** The buses with a countdown to the selected stop, in the order `busesInService` gave them. */
export function approachingBuses(buses: readonly BusPosition[]): BusPosition[] {
  return buses.filter((bus) => bus.arrivalAtStopSeconds !== null);
}

/**
 * The soonest approaching bus in each direction of travel, so that the default framing shows the
 * next bus arriving from each side of the stop. At most one bus per direction, soonest first.
 */
export function soonestPerDirection(approaching: readonly BusPosition[]): BusPosition[] {
  const seen = new Set<Direction>();
  const soonest: BusPosition[] = [];
  for (const bus of approaching) {
    if (bus.arrivalAtStopSeconds === null || seen.has(bus.direction)) continue;
    seen.add(bus.direction);
    soonest.push(bus);
  }
  return soonest;
}
