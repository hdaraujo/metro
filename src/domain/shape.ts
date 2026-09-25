import { toLocalMeters } from './geo';
import type { LatLng, Shape, Stop, Trip } from './types';

export interface MeasuredShape {
  shape: Shape;
  /** Projection origin latitude used for the local metric projection. */
  originLat: number;
  /** Projected points, in metres. */
  xy: { x: number; y: number }[];
  /** `cumulative[i]` is the distance along the shape from its start to `points[i]`, in metres. */
  cumulative: number[];
  length: number;
}

export function measureShape(shape: Shape): MeasuredShape {
  const originLat = shape.points[0]?.lat ?? 0;
  const xy = shape.points.map((p) => toLocalMeters(p, originLat));
  const cumulative: number[] = [];
  let total = 0;
  xy.forEach((p, i) => {
    const prev = xy[i - 1];
    if (prev) total += Math.hypot(p.x - prev.x, p.y - prev.y);
    cumulative.push(total);
  });
  return { shape, originLat, xy, cumulative, length: total };
}

/**
 * The nearest point on the polyline to `point`, as a distance along the shape. Only segments from
 * `fromSegment` onwards are searched, so successive calls can be kept monotonic.
 */
export function projectOnShape(
  measured: MeasuredShape,
  point: LatLng,
  fromSegment = 0,
): { distance: number; segment: number } {
  const { xy, cumulative } = measured;
  const p = toLocalMeters(point, measured.originLat);
  let best = {
    distance: cumulative[Math.min(fromSegment, cumulative.length - 1)] ?? 0,
    segment: fromSegment,
  };
  let bestSquared = Infinity;
  for (let i = Math.max(0, fromSegment); i < xy.length - 1; i++) {
    const a = xy[i]!;
    const b = xy[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    const qx = a.x + t * dx;
    const qy = a.y + t * dy;
    const squared = (p.x - qx) ** 2 + (p.y - qy) ** 2;
    if (squared < bestSquared) {
      bestSquared = squared;
      best = { distance: cumulative[i]! + t * Math.sqrt(lengthSquared), segment: i };
    }
  }
  return best;
}

/** The point at distance `d` along the shape, clamped to `[0, length]`. */
export function pointAtDistance(measured: MeasuredShape, d: number): LatLng {
  const { cumulative, shape } = measured;
  const points = shape.points;
  if (points.length === 0) throw new Error(`Shape ${shape.id} has no points`);
  const target = Math.max(0, Math.min(measured.length, d));
  let lo = 0;
  let hi = cumulative.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= target) lo = mid;
    else hi = mid;
  }
  const a = points[lo]!;
  const b = points[hi] ?? a;
  const span = cumulative[hi]! - cumulative[lo]!;
  const t = span === 0 ? 0 : (target - cumulative[lo]!) / span;
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/** Memoised per measured shape, keyed by `shapeId|stopId,stopId,…`. */
const stopDistanceCache = new WeakMap<MeasuredShape, Map<string, number[]>>();

/**
 * Distance along the shape of each of the trip's stops, in order. Each stop is projected starting
 * from the previous stop's segment, so the distances never decrease — this keeps stops that sit
 * beside the polyline (e.g. the S2 asc/desc pairs) on the right stretch of it.
 */
export function stopDistancesForTrip(
  measured: MeasuredShape,
  trip: Trip,
  stopsById: ReadonlyMap<string, Stop>,
): number[] {
  const key = `${measured.shape.id}|${trip.stopTimes.map((st) => st.stopId).join(',')}`;
  let cache = stopDistanceCache.get(measured);
  if (!cache) {
    cache = new Map();
    stopDistanceCache.set(measured, cache);
  }
  const cached = cache.get(key);
  if (cached) return cached;

  const distances: number[] = [];
  let segment = 0;
  let previous = 0;
  for (const { stopId } of trip.stopTimes) {
    const stop = stopsById.get(stopId);
    if (!stop) throw new Error(`Trip ${trip.id} references unknown stop ${stopId}`);
    const projected = projectOnShape(measured, stop.coords, segment);
    segment = projected.segment;
    previous = Math.max(previous, projected.distance);
    distances.push(previous);
  }
  cache.set(key, distances);
  return distances;
}
