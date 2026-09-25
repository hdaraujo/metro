import { pointAtDistance, type MeasuredShape } from './shape';
import type { LatLng, Trip } from './types';

/**
 * Estimated position of a bus running `trip` at `seconds` of its service day, interpolated linearly
 * in time along the shape between the two scheduled stop times around it. Null before the first
 * stop time or after the last.
 */
export function positionAt(
  trip: Trip,
  measured: MeasuredShape,
  stopDistances: readonly number[],
  seconds: number,
): LatLng | null {
  const times = trip.stopTimes;
  const first = times[0];
  const last = times[times.length - 1];
  if (!first || !last || seconds < first.seconds || seconds > last.seconds) return null;

  for (let i = 0; i < times.length - 1; i++) {
    const t0 = times[i]!.seconds;
    const t1 = times[i + 1]!.seconds;
    if (seconds < t0 || seconds > t1) continue;
    const d0 = stopDistances[i]!;
    const d1 = stopDistances[i + 1]!;
    const distance = t1 === t0 ? d0 : d0 + ((d1 - d0) * (seconds - t0)) / (t1 - t0);
    return pointAtDistance(measured, distance);
  }
  // A single-stop trip, or `seconds` exactly at the last stop.
  return pointAtDistance(measured, stopDistances[times.length - 1] ?? 0);
}
