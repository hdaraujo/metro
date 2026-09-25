import { describe, expect, it } from 'vitest';
import { positionAt } from './interpolation';
import { measureShape } from './shape';
import type { Shape, Trip } from './types';

const shape: Shape = {
  id: 'T-0',
  line: 'T',
  direction: 'outbound',
  color: '#000000',
  points: [
    { lat: 40.2, lng: -8.44 },
    { lat: 40.2, lng: -8.42 },
  ],
};
const measured = measureShape(shape);
const half = measured.length / 2;

const trip: Trip = {
  id: 't1',
  line: 'T',
  direction: 'outbound',
  dayType: 'DU',
  destination: 'East',
  stopTimes: [
    { stopId: 'a', seconds: 1000 },
    { stopId: 'b', seconds: 1100 },
    { stopId: 'c', seconds: 1100 },
    { stopId: 'd', seconds: 1300 },
  ],
};
const stopDistances = [0, half, half, measured.length];

describe('positionAt', () => {
  it('is null before the first stop time and after the last', () => {
    expect(positionAt(trip, measured, stopDistances, 999)).toBeNull();
    expect(positionAt(trip, measured, stopDistances, 1301)).toBeNull();
  });

  it('is at the stop exactly at its stop time', () => {
    expect(positionAt(trip, measured, stopDistances, 1000)).toEqual(shape.points[0]);
    expect(positionAt(trip, measured, stopDistances, 1300)?.lng).toBeCloseTo(-8.42, 9);
    expect(positionAt(trip, measured, stopDistances, 1100)?.lng).toBeCloseTo(-8.43, 6);
  });

  it('interpolates by time between two stops', () => {
    expect(positionAt(trip, measured, stopDistances, 1050)?.lng).toBeCloseTo(-8.435, 6);
    expect(positionAt(trip, measured, stopDistances, 1200)?.lng).toBeCloseTo(-8.425, 6);
  });

  it('uses the first stop of a pair with equal consecutive times', () => {
    const dwell: Trip = {
      ...trip,
      stopTimes: [
        { stopId: 'a', seconds: 1000 },
        { stopId: 'b', seconds: 1000 },
        { stopId: 'd', seconds: 1300 },
      ],
    };
    expect(positionAt(dwell, measured, [0, half, measured.length], 1000)).toEqual(shape.points[0]);
  });
});
