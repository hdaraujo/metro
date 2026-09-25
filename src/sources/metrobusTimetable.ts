/**
 * Source adapter for the Metro Mondego timetable ("Horários Metrobus"): undocumented static JSON
 * with no stated licence, which may change without notice. Nothing outside this file knows the
 * source's field names, its `Ida`/`Volta`/`P-S`/`S-P` codes or its `[lat, lng]` point order.
 */
import { parseServiceTime } from '../domain/lisbonTime';
import type { DayType, Direction, LatLng, Network, Shape, Stop, Trip } from '../domain/types';

export const METROBUS_DATA_URL = 'https://planearviagem.metromondego.pt/data/';

export class SourceFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceFormatError';
  }
}

type Json = Record<string, unknown>;

function fail(what: string, detail: string): never {
  throw new SourceFormatError(`Metrobus timetable: ${what} ${detail}`);
}

function asArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) fail(what, 'is not an array');
  return value;
}

function asObject(value: unknown, what: string): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(what, 'is not an object');
  }
  return value as Json;
}

function str(obj: Json, key: string, what: string): string {
  const value = obj[key];
  if (typeof value !== 'string') fail(what, `has no string "${key}"`);
  return value;
}

function num(obj: Json, key: string, what: string): number {
  const value = obj[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(what, `has no number "${key}"`);
  return value;
}

function bool(obj: Json, key: string, what: string): boolean {
  const value = obj[key];
  if (typeof value !== 'boolean') fail(what, `has no boolean "${key}"`);
  return value;
}

function strings(obj: Json, key: string, what: string): string[] {
  const value = asArray(obj[key], `${what} "${key}"`);
  if (!value.every((v) => typeof v === 'string')) fail(what, `has non-string "${key}"`);
  return value as string[];
}

const SHAPE_DIRECTIONS: Record<string, Direction> = { Ida: 'outbound', Volta: 'inbound' };
const TRIP_DIRECTIONS: Record<string, Direction> = { 'P-S': 'outbound', 'S-P': 'inbound' };

export function parseStops(json: unknown): Stop[] {
  return asArray(json, 'stops.json').map((item, i) => {
    const what = `stop #${i}`;
    const raw = asObject(item, what);
    const coords = asObject(raw.coords, `${what} coords`);
    return {
      id: str(raw, 'id', what),
      code: str(raw, 'code', what),
      name: str(raw, 'name', what),
      lines: strings(raw, 'lines', what),
      coords: { lat: num(coords, 'lat', what), lng: num(coords, 'lng', what) },
      suburbanOnly: bool(raw, 'isSuburbanOnly', what),
    };
  });
}

function parsePoint(value: unknown, what: string): LatLng {
  const pair = asArray(value, what);
  const [lat, lng] = pair;
  if (pair.length < 2 || typeof lat !== 'number' || typeof lng !== 'number') {
    fail(what, 'is not a [lat, lng] pair');
  }
  return { lat, lng };
}

export function parseShapes(json: unknown): Shape[] {
  return asArray(json, 'route-shapes.json').map((item, i) => {
    const what = `shape #${i}`;
    const raw = asObject(item, what);
    const code = str(raw, 'direction', what);
    const direction = SHAPE_DIRECTIONS[code];
    if (!direction) fail(what, `has unknown direction "${code}"`);
    return {
      id: str(raw, 'id', what),
      line: str(raw, 'line', what),
      direction,
      color: str(raw, 'color', what),
      points: asArray(raw.points, `${what} points`).map((p, j) =>
        parsePoint(p, `${what} point #${j}`),
      ),
    };
  });
}

/**
 * Trips reference stops by name. A trip whose direction or a stop name is unknown is skipped, with
 * one warning per distinct problem, rather than failing the whole timetable.
 */
export function parseTrips(
  json: unknown,
  stopIdByName: ReadonlyMap<string, string>,
  dayType: DayType,
): Trip[] {
  const warned = new Set<string>();
  const warn = (problem: string) => {
    if (warned.has(problem)) return;
    warned.add(problem);
    console.warn(`Metrobus timetable (${dayType}): skipping trips with ${problem}`);
  };

  const trips: Trip[] = [];
  asArray(json, `trips-${dayType}.json`).forEach((item, i) => {
    const what = `trip #${i}`;
    const raw = asObject(item, what);
    const code = str(raw, 'direction', what);
    const stops = asArray(raw.stops, `${what} stops`).map((s, j) => {
      const call = asObject(s, `${what} stop #${j}`);
      return { name: str(call, 'name', what), time: str(call, 'time', what) };
    });

    const direction = TRIP_DIRECTIONS[code];
    if (!direction) return warn(`unknown direction "${code}"`);
    const unknown = stops.find((s) => !stopIdByName.has(s.name));
    if (unknown) return warn(`unknown stop name "${unknown.name}"`);

    trips.push({
      id: str(raw, 'id', what),
      line: str(raw, 'line', what),
      direction,
      dayType,
      destination: str(raw, 'finalDestination', what),
      stopTimes: stops.map((s) => {
        let seconds: number;
        try {
          seconds = parseServiceTime(s.time);
        } catch {
          fail(what, `has invalid time "${s.time}"`);
        }
        return { stopId: stopIdByName.get(s.name)!, seconds };
      }),
    });
  });
  return trips;
}

/** Maps stop names to ids, which is how the source's trips refer to stops. */
export function stopIdsByName(stops: readonly Stop[]): Map<string, string> {
  return new Map(stops.map((s) => [s.name, s.id]));
}

async function fetchJson(file: string): Promise<{ json: unknown; date: string | null }> {
  const url = new URL(file, METROBUS_DATA_URL).href;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GET ${url} failed with HTTP ${response.status}`);
  return { json: await response.json(), date: response.headers.get('Date') };
}

function toIsoOrNow(httpDate: string | null): string {
  const time = httpDate ? Date.parse(httpDate) : NaN;
  return new Date(Number.isNaN(time) ? Date.now() : time).toISOString();
}

export async function fetchNetwork(): Promise<Network> {
  const [stopsResponse, shapesResponse] = await Promise.all([
    fetchJson('stops.json'),
    fetchJson('route-shapes.json'),
  ]);
  const stops = parseStops(stopsResponse.json);
  const shapes = parseShapes(shapesResponse.json);
  const lineColors: Record<string, string> = {};
  for (const shape of shapes) lineColors[shape.line] ??= shape.color;
  // `Date` is not a CORS-safelisted response header, so browsers usually hide it; then "now" is used.
  return { stops, shapes, lineColors, fetchedAt: toIsoOrNow(stopsResponse.date) };
}

export async function fetchTrips(
  dayType: DayType,
  stopIdByName: ReadonlyMap<string, string>,
): Promise<Trip[]> {
  const { json } = await fetchJson(`trips-${dayType}.json`);
  return parseTrips(json, stopIdByName, dayType);
}
