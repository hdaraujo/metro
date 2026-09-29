import { describe, expect, it } from 'vitest';
import {
  busesInDirection,
  directionLabel,
  directionsAtStop,
  nextDirectionFilter,
  type DirectionAtStop,
} from './directions';
import type { BusPosition, Direction, Trip } from './types';

let nextId = 0;
function trip(direction: Direction, destination: string, stopIds: string[]): Trip {
  return {
    id: `t${nextId++}`,
    line: 'U1',
    direction,
    dayType: 'DU',
    destination,
    stopTimes: stopIds.map((stopId, i) => ({ stopId, seconds: 36_000 + i * 120 })),
  };
}

function bus(tripId: string, direction: Direction): BusPosition {
  return {
    tripId,
    line: 'U1',
    direction,
    destination: direction === 'outbound' ? 'Vale das Flores' : 'Coimbra B',
    coords: { lat: 40.2, lng: -8.43 },
    source: 'scheduled',
    at: '2026-09-23T09:44:00.000Z',
    towardsStopId: 'P',
    arrivalAtStopSeconds: 60,
  };
}

describe('directionsAtStop', () => {
  it('returns both directions, outbound first even when inbound trips come first', () => {
    const trips = [
      trip('inbound', 'Coimbra B', ['A', 'P', 'B']),
      trip('outbound', 'Vale das Flores', ['B', 'P', 'A']),
    ];
    expect(directionsAtStop('P', trips)).toEqual([
      { direction: 'outbound', destinations: ['Vale das Flores'] },
      { direction: 'inbound', destinations: ['Coimbra B'] },
    ]);
  });

  it('orders destinations by frequency, ties alphabetical, without duplicates', () => {
    const trips = [
      trip('outbound', 'Serpins', ['A', 'P', 'S']),
      trip('outbound', 'Vale das Flores', ['A', 'P', 'V']),
      trip('outbound', 'Corvo', ['A', 'P', 'C']),
      trip('outbound', 'Vale das Flores', ['A', 'P', 'V']),
      trip('outbound', 'Vale das Flores', ['A', 'P', 'V']),
      trip('outbound', 'Serpins', ['A', 'P', 'S']),
      trip('outbound', 'Corvo', ['A', 'P', 'C']),
    ];
    expect(directionsAtStop('P', trips)).toEqual([
      { direction: 'outbound', destinations: ['Vale das Flores', 'Corvo', 'Serpins'] },
    ]);
  });

  it('ignores a call at the trip’s first stop', () => {
    // A terminus: outbound trips start here, inbound trips end here.
    const trips = [
      trip('outbound', 'Vale das Flores', ['T', 'A', 'B']),
      trip('inbound', 'Coimbra B', ['B', 'A', 'T']),
    ];
    expect(directionsAtStop('T', trips)).toEqual([
      { direction: 'inbound', destinations: ['Coimbra B'] },
    ]);
  });

  it('returns one entry for a stop served one way only', () => {
    const trips = [
      trip('outbound', 'Vale das Flores', ['A', 'P', 'B']),
      trip('inbound', 'Coimbra B', ['B', 'Q', 'A']),
    ];
    expect(directionsAtStop('P', trips)).toEqual([
      { direction: 'outbound', destinations: ['Vale das Flores'] },
    ]);
  });

  it('returns nothing without trips or when no trip calls at the stop', () => {
    expect(directionsAtStop('P', [])).toEqual([]);
    expect(directionsAtStop('P', [trip('outbound', 'Vale das Flores', ['A', 'B'])])).toEqual([]);
  });
});

describe('nextDirectionFilter', () => {
  it('cycles both → outbound → inbound → both', () => {
    expect(nextDirectionFilter('both')).toBe('outbound');
    expect(nextDirectionFilter('outbound')).toBe('inbound');
    expect(nextDirectionFilter('inbound')).toBe('both');
  });
});

describe('busesInDirection', () => {
  const buses = [
    bus('a', 'outbound'),
    bus('b', 'inbound'),
    bus('c', 'outbound'),
    bus('d', 'inbound'),
  ];
  const ids = (list: BusPosition[]) => list.map((b) => b.tripId);

  it('keeps every bus for both directions', () => {
    expect(ids(busesInDirection(buses, 'both'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps only the filtered direction, in order', () => {
    expect(ids(busesInDirection(buses, 'outbound'))).toEqual(['a', 'c']);
    expect(ids(busesInDirection(buses, 'inbound'))).toEqual(['b', 'd']);
  });
});

describe('directionLabel', () => {
  const directions: DirectionAtStop[] = [
    { direction: 'outbound', destinations: ['Vale das Flores', 'Serpins', 'Corvo'] },
    { direction: 'inbound', destinations: ['Coimbra B'] },
  ];

  it('labels both directions', () => {
    expect(directionLabel('both', directions)).toBe('Both directions');
  });

  it('labels a direction by its destinations', () => {
    expect(directionLabel('inbound', directions)).toBe('To Coimbra B');
    expect(directionLabel('outbound', directions)).toBe('To Vale das Flores, Serpins, Corvo');
  });

  it('falls back to the direction’s name without destinations', () => {
    expect(directionLabel('outbound', [])).toBe('Outbound');
    expect(directionLabel('inbound', [{ direction: 'inbound', destinations: [] }])).toBe('Inbound');
  });
});
