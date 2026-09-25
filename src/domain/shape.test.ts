import { describe, expect, it } from 'vitest';
import stopsJson from '../../tests/fixtures/stops.json';
import shapesJson from '../../tests/fixtures/route-shapes.json';
import tripsJson from '../../tests/fixtures/trips-DU.sample.json';
import { parseShapes, parseStops, parseTrips, stopIdsByName } from '../sources/metrobusTimetable';
import { haversineMeters } from './geo';
import { measureShape, pointAtDistance, projectOnShape, stopDistancesForTrip } from './shape';
import type { Shape, Stop, Trip } from './types';

// A straight east-west line of three points, roughly 850 m per segment at Coimbra's latitude.
const line: Shape = {
  id: 'T-0',
  line: 'T',
  direction: 'outbound',
  color: '#000000',
  points: [
    { lat: 40.2, lng: -8.44 },
    { lat: 40.2, lng: -8.43 },
    { lat: 40.2, lng: -8.42 },
  ],
};

describe('measureShape', () => {
  it('accumulates segment lengths', () => {
    const measured = measureShape(line);
    expect(measured.cumulative[0]).toBe(0);
    expect(measured.cumulative[1]).toBeCloseTo(
      haversineMeters(line.points[0]!, line.points[1]!),
      0,
    );
    expect(measured.length).toBeCloseTo(haversineMeters(line.points[0]!, line.points[2]!), 0);
  });
});

describe('projectOnShape', () => {
  const measured = measureShape(line);

  it('projects a point beside the line onto its nearest segment', () => {
    const { distance, segment } = projectOnShape(measured, { lat: 40.2005, lng: -8.425 });
    expect(segment).toBe(1);
    expect(distance).toBeCloseTo(measured.length * 0.75, -1);
  });

  it('only searches from the given segment onwards', () => {
    const p = { lat: 40.2, lng: -8.435 };
    expect(projectOnShape(measured, p).segment).toBe(0);
    const later = projectOnShape(measured, p, 1);
    expect(later.segment).toBe(1);
    expect(later.distance).toBeCloseTo(measured.cumulative[1]!, 5);
  });
});

describe('pointAtDistance', () => {
  const measured = measureShape(line);

  it('interpolates within a segment', () => {
    const p = pointAtDistance(measured, measured.length / 4);
    expect(p.lat).toBeCloseTo(40.2, 6);
    expect(p.lng).toBeCloseTo(-8.435, 4);
  });

  it('clamps to the ends of the shape', () => {
    expect(pointAtDistance(measured, -100)).toEqual(line.points[0]);
    expect(pointAtDistance(measured, measured.length + 100)).toEqual(line.points[2]);
  });
});

describe('stopDistancesForTrip', () => {
  const stops = parseStops(stopsJson);
  const stopsById = new Map<string, Stop>(stops.map((s) => [s.id, s]));
  const shapes = parseShapes(shapesJson);
  const trips = parseTrips(tripsJson, stopIdsByName(stops), 'DU');
  const shapeFor = (trip: Trip) =>
    measureShape(shapes.find((s) => s.line === trip.line && s.direction === trip.direction)!);

  it('gives monotonic distances for every sample trip', () => {
    for (const trip of trips) {
      const distances = stopDistancesForTrip(shapeFor(trip), trip, stopsById);
      expect(distances).toHaveLength(trip.stopTimes.length);
      for (let i = 1; i < distances.length; i++) {
        expect(distances[i]!).toBeGreaterThanOrEqual(distances[i - 1]!);
      }
    }
  });

  it('places the off-vertex S2 (desc) stops close to the route', () => {
    const trip = trips.find((t) => t.id === 's2-DU-0-701')!;
    const measured = shapeFor(trip);
    const distances = stopDistancesForTrip(measured, trip, stopsById);
    trip.stopTimes.forEach((st, i) => {
      const onShape = pointAtDistance(measured, distances[i]!);
      expect(haversineMeters(onShape, stopsById.get(st.stopId)!.coords)).toBeLessThan(60);
    });
  });

  it('memoises results per shape and stop sequence', () => {
    const trip = trips.find((t) => t.line === 'U1')!;
    const measured = shapeFor(trip);
    expect(stopDistancesForTrip(measured, trip, stopsById)).toBe(
      stopDistancesForTrip(measured, trip, stopsById),
    );
  });
});
