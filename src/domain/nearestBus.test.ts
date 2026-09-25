import { describe, expect, it } from 'vitest';
import stopsJson from '../../tests/fixtures/stops.json';
import shapesJson from '../../tests/fixtures/route-shapes.json';
import tripsJson from '../../tests/fixtures/trips-DU.sample.json';
import { parseShapes, parseStops, parseTrips, stopIdsByName } from '../sources/metrobusTimetable';
import { haversineMeters } from './geo';
import { lisbonClock } from './lisbonTime';
import { nearestApproachingBus } from './nearestBus';
import { measureShape } from './shape';
import type { DayType, Stop, Trip } from './types';

const stops = parseStops(stopsJson);
const stopsById = new Map<string, Stop>(stops.map((s) => [s.id, s]));
const shapesById = new Map(parseShapes(shapesJson).map((s) => [s.id, measureShape(s)]));
const weekdayTrips = parseTrips(tripsJson, stopIdsByName(stops), 'DU');
const tripsByDayType = new Map<DayType, Trip[]>([['DU', weekdayTrips]]);
const stopNamed = (name: string) => stops.find((s) => s.name === name)!;

function busAt(stopName: string, iso: string, trips = tripsByDayType) {
  const now = new Date(iso);
  return nearestApproachingBus({
    stop: stopNamed(stopName),
    clock: lisbonClock(now),
    tripsByDayType: trips,
    shapesById,
    stopsById,
    now,
  });
}

describe('nearestApproachingBus', () => {
  // Wednesday 23 September 2026, 10:44 in Lisbon (UTC+1).
  const weekdayMorning = '2026-09-23T09:44:00Z';

  it('picks the approaching trip that reaches the stop soonest', () => {
    // u1-DU-0-852 (Portagem 10:47:04) and u1-DU-1-823 (Portagem 10:53:18) are both under way.
    const bus = busAt('Portagem', weekdayMorning);
    expect(bus).toMatchObject({
      tripId: 'u1-DU-0-852',
      line: 'U1',
      direction: 'outbound',
      source: 'scheduled',
      at: '2026-09-23T09:44:00.000Z',
      nextStopId: stopNamed('Portagem').id,
      arrivalAtStopSeconds: 3 * 60 + 4,
    });
  });

  it('places the bus on the route between its previous and next stops', () => {
    const bus = busAt('Portagem', weekdayMorning)!;
    const trip = weekdayTrips.find((t) => t.id === bus.tripId)!;
    const startCoords = stopsById.get(trip.stopTimes[0]!.stopId)!.coords;
    const portagem = stopNamed('Portagem').coords;
    const legLength = haversineMeters(startCoords, portagem);
    expect(haversineMeters(bus.coords, portagem)).toBeLessThan(legLength);
    expect(haversineMeters(bus.coords, startCoords)).toBeGreaterThan(0);
  });

  it('excludes trips that have already passed the stop', () => {
    // s2-DU-0-701 called at Portagem at 10:25:35, so at 10:44 it is not a candidate.
    expect(busAt('Portagem', weekdayMorning)?.tripId).not.toBe('s2-DU-0-701');
    // Just after 10:47:04 the first U1 has passed; the second one is next.
    expect(busAt('Portagem', '2026-09-23T09:47:10Z')?.tripId).toBe('u1-DU-1-823');
  });

  it('excludes trips that have not started yet', () => {
    // Both U1 trips leave their terminus at 10:41.
    const bus = busAt('Portagem', '2026-09-23T09:40:30Z');
    expect(bus?.tripId).not.toBe('u1-DU-0-852');
    expect(bus?.tripId).not.toBe('u1-DU-1-823');
  });

  it("uses yesterday's timetable with times past 24:00 after midnight", () => {
    // Thursday 24 September 2026, 00:30 in Lisbon: s1-DU-0-726 from Wednesday is still running
    // and reaches Serpins at 25:29:28.
    const bus = busAt('Serpins', '2026-09-23T23:30:00Z');
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
    expect(busAt('Portagem', '2026-09-24T03:30:00Z', trips)).toBeNull();
    // At 03:30 (27:30 on Wednesday's service day) it is found.
    expect(busAt('Portagem', '2026-09-24T02:30:00Z', trips)?.tripId).toBe('late');
  });

  it('returns null when no bus is approaching', () => {
    // 04:30 on a weekday: the first trip in the sample leaves at 04:42.
    expect(busAt('Portagem', '2026-09-23T03:30:00Z')).toBeNull();
    // A Saturday, with no Saturday trips loaded.
    expect(busAt('Portagem', '2026-09-26T09:44:00Z')).toBeNull();
    // Coimbra B is the U1 terminus: at 10:44 every trip under way has already left it.
    expect(busAt('Coimbra B', weekdayMorning)?.tripId).not.toBe('u1-DU-0-852');
  });
});
