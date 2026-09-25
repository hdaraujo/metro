import { describe, expect, it } from 'vitest';
import { nearestStop } from './nearestStop';
import type { Stop } from './types';

const stop = (id: string, lat: number, lng: number): Stop => ({
  id,
  code: `c${id}`,
  name: `Stop ${id}`,
  lines: ['U1'],
  coords: { lat, lng },
  suburbanOnly: false,
});

describe('nearestStop', () => {
  const stops = [stop('1', 40.2, -8.4), stop('2', 40.21, -8.43), stop('3', 40.25, -8.45)];

  it('returns the closest stop and its distance', () => {
    const result = nearestStop(stops, { lat: 40.2095, lng: -8.4302 });
    expect(result?.stop.id).toBe('2');
    expect(result?.distanceMeters).toBeGreaterThan(0);
    expect(result?.distanceMeters).toBeLessThan(100);
  });

  it('breaks ties by the lower id', () => {
    const tied = [stop('b', 40.21, -8.41), stop('a', 40.21, -8.41)];
    expect(nearestStop(tied, { lat: 40.2, lng: -8.4 })?.stop.id).toBe('a');
    expect(nearestStop([...tied].reverse(), { lat: 40.2, lng: -8.4 })?.stop.id).toBe('a');
  });

  it('includes suburban-only stops', () => {
    const suburban = { ...stop('9', 40.1, -8.2), suburbanOnly: true };
    expect(nearestStop([...stops, suburban], { lat: 40.1, lng: -8.2 })?.stop.id).toBe('9');
  });

  it('returns null for an empty list', () => {
    expect(nearestStop([], { lat: 40.2, lng: -8.4 })).toBeNull();
  });
});
