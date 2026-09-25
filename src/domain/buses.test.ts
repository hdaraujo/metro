import { describe, expect, it } from 'vitest';
import stopsJson from '../../tests/fixtures/stops.json';
import shapesJson from '../../tests/fixtures/route-shapes.json';
import tripsJson from '../../tests/fixtures/trips-DU.sample.json';
import { parseShapes, parseStops, parseTrips, stopIdsByName } from '../sources/metrobusTimetable';
import { approachingBuses, busesInService } from './buses';
import { haversineMeters } from './geo';
import { lisbonClock } from './lisbonTime';
import { measureShape } from './shape';
import type { DayType, Stop, Trip } from './types';

const stops = parseStops(stopsJson);
const stopsById = new Map<string, Stop>(stops.map((s) => [s.id, s]));
const shapesById = new Map(parseShapes(shapesJson).map((s) => [s.id, measureShape(s)]));
const weekdayTrips = parseTrips(tripsJson, stopIdsByName(stops), 'DU');
const tripsByDayType = new Map<DayType, Trip[]>([['DU', weekdayTrips]]);
const stopNamed = (name: string) => stops.find((s) => s.name === name)!;

function busesAt(stopName: string | null, iso: string, trips = tripsByDayType) {
  const now = new Date(iso);
  return busesInService({
    stop: stopName === null ? null : stopNamed(stopName),
    clock: lisbonClock(now),
    tripsByDayType: trips,
    shapesById,
    stopsById,
    now,
  });
}

/** The approaching bus that reaches the stop soonest, as the sheet and smart zoom use it. */
const soonestAt = (stopName: string, iso: string, trips = tripsByDayType) =>
  approachingBuses(busesAt(stopName, iso, trips))[0] ?? null;

describe('busesInService', () => {
  // Wednesday 23 September 2026, 10:44 in Lisbon (UTC+1).
  const weekdayMorning = '2026-09-23T09:44:00Z';

  it('returns every running bus, approaching ones first and soonest first', () => {
    const portagem = stopNamed('Portagem').id;
    const buses = busesAt('Portagem', weekdayMorning);
    expect(
      buses.map(({ tripId, line, destination, towardsStopId, arrivalAtStopSeconds }) => ({
        tripId,
        line,
        destination,
        towardsStopId,
        arrivalAtStopSeconds,
      })),
    ).toEqual([
      // Portagem at 10:47:04.
      {
        tripId: 'u1-DU-0-852',
        line: 'U1',
        destination: 'Vale das Flores',
        towardsStopId: portagem,
        arrivalAtStopSeconds: 3 * 60 + 4,
      },
      // Portagem at 10:53:18.
      {
        tripId: 'u1-DU-1-823',
        line: 'U1',
        destination: 'Coimbra B',
        towardsStopId: portagem,
        arrivalAtStopSeconds: 9 * 60 + 18,
      },
      // Called at Portagem at 10:25:35, so it is in service but not approaching.
      {
        tripId: 's2-DU-0-701',
        line: 'S2',
        destination: 'Serpins',
        towardsStopId: null,
        arrivalAtStopSeconds: null,
      },
    ]);
    expect(approachingBuses(buses).map((b) => b.tripId)).toEqual(['u1-DU-0-852', 'u1-DU-1-823']);
  });

  it('returns every running bus without countdowns when no stop is known', () => {
    const buses = busesAt(null, weekdayMorning);
    expect(buses.map((b) => b.tripId).sort()).toEqual([
      's2-DU-0-701',
      'u1-DU-0-852',
      'u1-DU-1-823',
    ]);
    for (const bus of buses) {
      expect(bus.towardsStopId).toBeNull();
      expect(bus.arrivalAtStopSeconds).toBeNull();
    }
    expect(approachingBuses(buses)).toEqual([]);
  });

  it('labels every bus as scheduled, at `now`, with its destination', () => {
    for (const bus of busesAt('Portagem', weekdayMorning)) {
      expect(bus.source).toBe('scheduled');
      expect(bus.at).toBe('2026-09-23T09:44:00.000Z');
      expect(bus.destination).not.toBe('');
    }
  });

  it('picks the approaching trip that reaches the stop soonest', () => {
    expect(soonestAt('Portagem', weekdayMorning)).toMatchObject({
      tripId: 'u1-DU-0-852',
      line: 'U1',
      direction: 'outbound',
      arrivalAtStopSeconds: 3 * 60 + 4,
    });
  });

  it('places the bus on the route between its previous and next stops', () => {
    const bus = soonestAt('Portagem', weekdayMorning)!;
    const trip = weekdayTrips.find((t) => t.id === bus.tripId)!;
    const startCoords = stopsById.get(trip.stopTimes[0]!.stopId)!.coords;
    const portagem = stopNamed('Portagem').coords;
    const legLength = haversineMeters(startCoords, portagem);
    expect(haversineMeters(bus.coords, portagem)).toBeLessThan(legLength);
    expect(haversineMeters(bus.coords, startCoords)).toBeGreaterThan(0);
  });

  it('gives no countdown to trips that have already passed the stop', () => {
    const s2 = busesAt('Portagem', weekdayMorning).find((b) => b.tripId === 's2-DU-0-701');
    expect(s2?.arrivalAtStopSeconds).toBeNull();
    // Just after 10:47:04 the first U1 has passed; the second one is next.
    const later = busesAt('Portagem', '2026-09-23T09:47:10Z');
    expect(approachingBuses(later)[0]?.tripId).toBe('u1-DU-1-823');
    expect(later.find((b) => b.tripId === 'u1-DU-0-852')?.arrivalAtStopSeconds).toBeNull();
  });

  it('excludes trips that have not started yet', () => {
    // Both U1 trips leave their terminus at 10:41.
    const ids = busesAt('Portagem', '2026-09-23T09:40:30Z').map((b) => b.tripId);
    expect(ids).not.toContain('u1-DU-0-852');
    expect(ids).not.toContain('u1-DU-1-823');
  });

  it("uses yesterday's timetable with times past 24:00 after midnight", () => {
    // Thursday 24 September 2026, 00:30 in Lisbon: s1-DU-0-726 from Wednesday is still running
    // and reaches Serpins at 25:29:28.
    const bus = soonestAt('Serpins', '2026-09-23T23:30:00Z');
    expect(bus?.tripId).toBe('s1-DU-0-726');
    expect(bus?.arrivalAtStopSeconds).toBe(25 * 3600 + 29 * 60 + 28 - (24 * 3600 + 30 * 60));
  });

  it("ignores yesterday's timetable from 04:00", () => {
    const late: Trip = {
      id: 'late',
      line: 'U1',
      direction: 'outbound',
      dayType: 'DU',
      destination: 'Vale das Flores',
      stopTimes: [
        { stopId: stopNamed('Coimbra B').id, seconds: 27 * 3600 },
        { stopId: stopNamed('Portagem').id, seconds: 29 * 3600 },
      ],
    };
    const trips = new Map<DayType, Trip[]>([['DU', [late]]]);
    // Thursday 04:30 Lisbon = 28:30 on Wednesday's service day, but yesterday is no longer checked.
    expect(busesAt('Portagem', '2026-09-24T03:30:00Z', trips)).toEqual([]);
    // At 03:30 (27:30 on Wednesday's service day) it is found.
    expect(soonestAt('Portagem', '2026-09-24T02:30:00Z', trips)?.tripId).toBe('late');
  });

  it('returns no buses when none is running', () => {
    // 04:30 on a weekday: the first trip in the sample leaves at 04:42.
    expect(busesAt('Portagem', '2026-09-23T03:30:00Z')).toEqual([]);
    // A Saturday, with no Saturday trips loaded.
    expect(busesAt('Portagem', '2026-09-26T09:44:00Z')).toEqual([]);
    // Coimbra B is the U1 terminus: at 10:44 every trip under way has already left it.
    expect(soonestAt('Coimbra B', weekdayMorning)?.tripId).not.toBe('u1-DU-0-852');
  });

  it('skips trips with an unknown shape or stop without throwing', () => {
    const running = weekdayTrips.find((t) => t.id === 'u1-DU-0-852')!;
    const noShape: Trip = { ...running, id: 'no-shape', line: 'X9' };
    const unknownStop: Trip = {
      ...running,
      id: 'unknown-stop',
      stopTimes: [{ stopId: 'nowhere', seconds: 0 }, ...running.stopTimes],
    };
    const trips = new Map<DayType, Trip[]>([['DU', [noShape, unknownStop, running]]]);
    expect(busesAt('Portagem', weekdayMorning, trips).map((b) => b.tripId)).toEqual([
      'u1-DU-0-852',
    ]);
  });
});
