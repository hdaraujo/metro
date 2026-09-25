import type { LatLng } from './types';

const EARTH_RADIUS_METERS = 6_371_008.8;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance between two points, in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Equirectangular projection to local metres around `originLat`. Accurate enough for segment
 * math over a city-sized area; `x` grows eastwards, `y` northwards.
 */
export function toLocalMeters(p: LatLng, originLat: number): { x: number; y: number } {
  const metersPerRadian = EARTH_RADIUS_METERS;
  return {
    x: toRadians(p.lng) * Math.cos(toRadians(originLat)) * metersPerRadian,
    y: toRadians(p.lat) * metersPerRadian,
  };
}

/** `"180 m"` below 1 km (to the nearest 10 m), `"1.2 km"` from 1 km. */
export function formatDistance(meters: number): string {
  const rounded = Math.round(meters / 10) * 10;
  if (rounded < 1000) return `${rounded} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
