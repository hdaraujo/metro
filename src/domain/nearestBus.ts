import { dayTypeFor } from './holidays';
import { positionAt } from './interpolation';
import { previousDate, type LisbonClock } from './lisbonTime';
import { stopDistancesForTrip, type MeasuredShape } from './shape';
import type { BusPosition, DayType, Direction, LineId, Stop, Trip } from './types';

const DAY_SECONDS = 86_400;
/** Before this Lisbon time, trips from yesterday's service day (times past 24:00) may still run. */
const PREVIOUS_SERVICE_DAY_UNTIL = 4 * 3600;

export interface NearestBusInput {
  stop: Stop;
  clock: LisbonClock;
  tripsByDayType: ReadonlyMap<DayType, readonly Trip[]>;
  shapesById: ReadonlyMap<string, MeasuredShape>;
  stopsById: ReadonlyMap<string, Stop>;
  now: Date;
}

function findShape(
  shapesById: ReadonlyMap<string, MeasuredShape>,
  line: LineId,
  direction: Direction,
): MeasuredShape | undefined {
  for (const measured of shapesById.values()) {
    if (measured.shape.line === line && measured.shape.direction === direction) return measured;
  }
  return undefined;
}

/**
 * The scheduled bus that will reach `stop` soonest among those already under way: its trip has
 * started but has not yet called at the stop. Positions are estimated from the timetable, so the
 * result is always `source: 'scheduled'`. Null when no such bus exists.
 */
export function nearestApproachingBus({
  stop,
  clock,
  tripsByDayType,
  shapesById,
  stopsById,
  now,
}: NearestBusInput): BusPosition | null {
  const serviceDays: { dayType: DayType; offset: number }[] = [
    { dayType: dayTypeFor(clock.date), offset: clock.seconds },
  ];
  if (clock.seconds < PREVIOUS_SERVICE_DAY_UNTIL) {
    serviceDays.push({
      dayType: dayTypeFor(previousDate(clock.date)),
      offset: clock.seconds + DAY_SECONDS,
    });
  }

  let best: { trip: Trip; offset: number; wait: number } | null = null;
  for (const { dayType, offset } of serviceDays) {
    for (const trip of tripsByDayType.get(dayType) ?? []) {
      const start = trip.stopTimes[0]?.seconds;
      if (start === undefined || start > offset) continue;
      const call = trip.stopTimes.find((st) => st.stopId === stop.id && st.seconds > offset);
      if (!call) continue;
      const wait = call.seconds - offset;
      if (best === null || wait < best.wait) best = { trip, offset, wait };
    }
  }
  if (!best) return null;

  const { trip, offset, wait } = best;
  const measured = findShape(shapesById, trip.line, trip.direction);
  if (!measured) return null;
  const coords = positionAt(
    trip,
    measured,
    stopDistancesForTrip(measured, trip, stopsById),
    offset,
  );
  if (!coords) return null;

  return {
    tripId: trip.id,
    line: trip.line,
    direction: trip.direction,
    coords,
    source: 'scheduled',
    at: now.toISOString(),
    nextStopId: stop.id,
    arrivalAtStopSeconds: wait,
  };
}
