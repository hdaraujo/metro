import { describe, expect, it } from 'vitest';
import { formatDistance, haversineMeters, toLocalMeters } from './geo';

describe('haversineMeters', () => {
  it('is zero for the same point', () => {
    expect(haversineMeters({ lat: 40.2, lng: -8.4 }, { lat: 40.2, lng: -8.4 })).toBe(0);
  });

  it('measures one degree of latitude as about 111.2 km', () => {
    const d = haversineMeters({ lat: 40, lng: -8.4 }, { lat: 41, lng: -8.4 });
    expect(d).toBeGreaterThan(111_100);
    expect(d).toBeLessThan(111_300);
  });

  it('measures Lisbon to Porto as about 274 km', () => {
    const d = haversineMeters({ lat: 38.7223, lng: -9.1393 }, { lat: 41.1579, lng: -8.6291 });
    expect(d / 1000).toBeCloseTo(274, 0);
  });

  it('measures Coimbra B to Portagem as about 2 km', () => {
    const d = haversineMeters(
      { lat: 40.224741, lng: -8.439876 },
      { lat: 40.207526, lng: -8.430654 },
    );
    expect(d).toBeGreaterThan(1900);
    expect(d).toBeLessThan(2100);
  });
});

describe('toLocalMeters', () => {
  it('matches haversine for short distances', () => {
    const a = { lat: 40.2075, lng: -8.4307 };
    const b = { lat: 40.2101, lng: -8.4262 };
    const pa = toLocalMeters(a, a.lat);
    const pb = toLocalMeters(b, a.lat);
    const planar = Math.hypot(pb.x - pa.x, pb.y - pa.y);
    expect(planar).toBeCloseTo(haversineMeters(a, b), 0);
  });
});

describe('formatDistance', () => {
  it.each([
    [0, '0 m'],
    [4, '0 m'],
    [183, '180 m'],
    [185, '190 m'],
    [994, '990 m'],
    [995, '1.0 km'],
    [1000, '1.0 km'],
    [1234, '1.2 km'],
    [12_345, '12.3 km'],
  ])('formats %d m as %s', (meters, expected) => {
    expect(formatDistance(meters)).toBe(expected);
  });
});
