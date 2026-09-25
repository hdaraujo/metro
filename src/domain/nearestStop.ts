import { haversineMeters } from './geo';
import type { LatLng, Stop } from './types';

/** The stop closest to `point` in straight-line distance. Ties go to the lower `id` (string order). */
export function nearestStop(
  stops: readonly Stop[],
  point: LatLng,
): { stop: Stop; distanceMeters: number } | null {
  let best: { stop: Stop; distanceMeters: number } | null = null;
  for (const stop of stops) {
    const distanceMeters = haversineMeters(point, stop.coords);
    if (
      best === null ||
      distanceMeters < best.distanceMeters ||
      (distanceMeters === best.distanceMeters && stop.id < best.stop.id)
    ) {
      best = { stop, distanceMeters };
    }
  }
  return best;
}
