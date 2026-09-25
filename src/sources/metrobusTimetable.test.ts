import { afterEach, describe, expect, it, vi } from 'vitest';
import stopsJson from '../../tests/fixtures/stops.json';
import shapesJson from '../../tests/fixtures/route-shapes.json';
import tripsJson from '../../tests/fixtures/trips-DU.sample.json';
import {
  fetchNetwork,
  parseShapes,
  parseStops,
  parseTrips,
  SourceFormatError,
  stopIdsByName,
} from './metrobusTimetable';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('parseStops', () => {
  it('parses the recorded stops', () => {
    const stops = parseStops(stopsJson);
    expect(stops).toHaveLength(39);
    expect(stops.find((s) => s.name === 'Portagem')).toEqual({
      id: '233',
      code: 'cbr_mm026',
      name: 'Portagem',
      lines: ['S1', 'S2', 'U1', 'U2'],
      coords: { lat: 40.207526, lng: -8.430654 },
      suburbanOnly: false,
    });
    expect(stops.find((s) => s.name === 'Serpins')?.suburbanOnly).toBe(true);
  });

  it('throws SourceFormatError on a malformed file', () => {
    expect(() => parseStops({ stops: [] })).toThrow(SourceFormatError);
    expect(() => parseStops([{ id: '1', name: 'No coords' }])).toThrow(SourceFormatError);
    const [first] = stopsJson;
    expect(() => parseStops([{ ...first, coords: { lat: '40.2', lng: -8.4 } }])).toThrow(
      SourceFormatError,
    );
  });
});

describe('parseShapes', () => {
  const shapes = parseShapes(shapesJson);

  it('parses the recorded shapes', () => {
    expect(shapes).toHaveLength(10);
    expect(new Set(shapes.map((s) => s.line))).toEqual(new Set(['S1', 'S2', 'U1', 'U2', 'U3']));
  });

  it('maps Ida to outbound and Volta to inbound', () => {
    expect(shapes.find((s) => s.id === 'U1-0')?.direction).toBe('outbound');
    expect(shapes.find((s) => s.id === 'U1-1')?.direction).toBe('inbound');
  });

  it('converts [lat, lng] pairs to LatLng', () => {
    const s1 = shapes.find((s) => s.id === 'S1-0')!;
    expect(s1.points[0]).toEqual({ lat: 40.224741, lng: -8.439876 });
    expect(s1.color).toBe('#0080FF');
  });

  it('rejects an unknown direction', () => {
    const [first] = shapesJson;
    expect(() => parseShapes([{ ...first, direction: 'Circular' }])).toThrow(SourceFormatError);
  });
});

describe('parseTrips', () => {
  const stops = parseStops(stopsJson);
  const byName = stopIdsByName(stops);

  it('parses the recorded sample', () => {
    const trips = parseTrips(tripsJson, byName, 'DU');
    expect(trips).toHaveLength(96);
    const trip = trips.find((t) => t.id === 'u1-DU-0-852')!;
    expect(trip).toMatchObject({ line: 'U1', dayType: 'DU', destination: 'Vale das Flores' });
    expect(trip.stopTimes[0]).toEqual({
      stopId: byName.get('Coimbra B'),
      seconds: 10 * 3600 + 41 * 60,
    });
  });

  it('maps P-S to outbound and S-P to inbound', () => {
    const trips = parseTrips(tripsJson, byName, 'DU');
    expect(trips.find((t) => t.id === 'u1-DU-0-852')?.direction).toBe('outbound');
    expect(trips.find((t) => t.id === 'u1-DU-1-823')?.direction).toBe('inbound');
  });

  it('keeps stop times past 24:00', () => {
    const trips = parseTrips(tripsJson, byName, 'DU');
    const late = trips.find((t) => t.id === 's1-DU-0-726')!;
    expect(late.stopTimes.at(-1)?.seconds).toBe(25 * 3600 + 29 * 60 + 28);
  });

  it('skips trips with an unknown stop name or direction, warning once per problem', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const [good] = tripsJson;
    const ghost = { ...good, id: 'ghost', stops: [{ name: 'Nowhere', time: '10:00:00' }] };
    const trips = parseTrips(
      [good, ghost, { ...ghost, id: 'ghost-2' }, { ...good, id: 'loop', direction: 'Circ' }],
      byName,
      'DU',
    );
    expect(trips.map((t) => t.id)).toEqual([good!.id]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('throws SourceFormatError on a malformed trip', () => {
    expect(() => parseTrips([{ id: 'x', direction: 'P-S' }], byName, 'DU')).toThrow(
      SourceFormatError,
    );
  });
});

describe('fetchNetwork', () => {
  const respond = (body: unknown, init: ResponseInit = {}) =>
    new Response(JSON.stringify(body), { status: 200, ...init });

  it('fetches stops and shapes and derives the line colours', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        Promise.resolve(
          url.endsWith('stops.json')
            ? respond(stopsJson, { headers: { Date: 'Fri, 25 Sep 2026 19:00:24 GMT' } })
            : respond(shapesJson),
        ),
      ),
    );
    const network = await fetchNetwork();
    expect(network.stops).toHaveLength(39);
    expect(network.shapes).toHaveLength(10);
    expect(network.lineColors).toEqual({
      S1: '#0080FF',
      S2: '#FF0000',
      U1: '#2B6CC4',
      U2: '#FF5349',
      U3: '#00FF40',
    });
    expect(network.fetchedAt).toBe('2026-09-25T19:00:24.000Z');
  });

  it('throws with the URL and status on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('nope', { status: 503 }))),
    );
    await expect(fetchNetwork()).rejects.toThrow(
      /planearviagem\.metromondego\.pt\/data\/(stops|route-shapes)\.json.*503/,
    );
  });
});
