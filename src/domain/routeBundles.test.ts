import { describe, expect, it } from 'vitest';
import shapesJson from '../../tests/fixtures/route-shapes.json';
import { parseShapes } from '../sources/metrobusTimetable';
import { bundleRoutes, type LineRun } from './routeBundles';
import type { Direction, LatLng, LineId, Shape } from './types';

const P = (lat: number, lng: number): LatLng => ({ lat, lng });

function shape(
  id: string,
  line: LineId,
  direction: Direction,
  points: LatLng[],
  color = '#000000',
): Shape {
  return { id, line, direction, color, points };
}

const key = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
const edgeKey = (a: LatLng, b: LatLng) => {
  const [x, y] = [key(a), key(b)];
  return x < y ? `${x}|${y}` : `${y}|${x}`;
};

/** The run's offset on edge `i`, relative to the edge's lexicographic direction. */
function geoSlot(run: LineRun, i: number): number {
  const forward = key(run.points[i]!) < key(run.points[i + 1]!);
  return (forward ? run.offset : -run.offset) || 0;
}

/** Every (line, edge) → geographic slot, failing if a line covers an edge twice. */
function slotsByLineEdge(runs: readonly LineRun[]): Map<string, number> {
  const slots = new Map<string, number>();
  for (const run of runs) {
    expect(run.points.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i + 1 < run.points.length; i++) {
      const k = `${run.line}@${edgeKey(run.points[i]!, run.points[i + 1]!)}`;
      expect(slots.has(k), `${k} drawn twice`).toBe(false);
      slots.set(k, geoSlot(run, i));
    }
  }
  return slots;
}

const corridor = [P(40, -8), P(40.001, -8.001), P(40.002, -8.001), P(40.003, -8.002)];

describe('bundleRoutes', () => {
  it('draws a single line once, centred, with its first shape colour', () => {
    const runs = bundleRoutes([
      shape('A-0', 'A', 'outbound', corridor, '#111111'),
      shape('A-1', 'A', 'inbound', [...corridor].reverse(), '#222222'),
    ]);
    expect(runs).toEqual([{ line: 'A', color: '#111111', offset: 0, points: corridor }]);
  });

  it('puts two lines on a shared corridor side by side', () => {
    const runs = bundleRoutes([
      shape('B-0', 'B', 'outbound', corridor),
      shape('A-0', 'A', 'outbound', corridor),
    ]);
    expect(runs.map((r) => [r.line, r.offset, r.points.length])).toEqual([
      ['A', -0.5, 4],
      ['B', 0.5, 4],
    ]);
  });

  it('keeps lines digitised in opposite directions on opposite physical sides', () => {
    const runs = bundleRoutes([
      shape('A-0', 'A', 'outbound', corridor),
      shape('B-0', 'B', 'outbound', [...corridor].reverse()),
    ]);
    const slots = slotsByLineEdge(runs);
    for (let i = 0; i + 1 < corridor.length; i++) {
      const e = edgeKey(corridor[i]!, corridor[i + 1]!);
      const pair = [slots.get(`A@${e}`), slots.get(`B@${e}`)].sort();
      expect(pair).toEqual([-0.5, 0.5]);
    }
  });

  it('splits runs where lines join and leave a shared stretch, without swapping sides', () => {
    const a = [P(39.99, -7.99), ...corridor, P(40.004, -8.01)];
    const b = [P(39.99, -8.01), ...corridor, P(40.004, -7.99)].reverse();
    const runs = bundleRoutes([shape('A-0', 'A', 'outbound', a), shape('B-0', 'B', 'outbound', b)]);
    for (const line of ['A', 'B']) {
      const offsets = runs.filter((r) => r.line === line).map((r) => Math.abs(r.offset));
      expect(offsets).toEqual([0, 0.5, 0]);
    }
    const shared = runs.filter((r) => r.offset !== 0);
    for (const run of shared) {
      expect(run.points).toHaveLength(corridor.length);
      const slots = run.points.slice(1).map((_, i) => geoSlot(run, i));
      expect(new Set(slots).size).toBe(1);
    }
    const [sa, sb] = shared.map((r) => geoSlot(r, 0));
    expect(sa).toBe(-sb!);
    // Single-line ends meet the shared stretch at the junction vertices.
    const ends = runs.filter((r) => r.offset === 0).flatMap((r) => [r.points[0], r.points.at(-1)]);
    expect(ends).toContainEqual(corridor[0]);
    expect(ends).toContainEqual(corridor.at(-1));
  });

  it('tolerates duplicate consecutive points and one-point shapes', () => {
    const runs = bundleRoutes([
      shape('A-0', 'A', 'outbound', [corridor[0]!, corridor[0]!, corridor[1]!, corridor[1]!]),
      shape('B-0', 'B', 'outbound', [corridor[2]!]),
      shape('C-0', 'C', 'outbound', []),
    ]);
    expect(runs).toEqual([
      { line: 'A', color: '#000000', offset: 0, points: [corridor[0], corridor[1]] },
    ]);
  });

  it('is deterministic and independent of input order', () => {
    const shapes = parseShapes(shapesJson);
    expect(bundleRoutes(shapes)).toEqual(bundleRoutes(shapes));
    const shuffled = [...shapes].reverse();
    shuffled.push(shuffled.splice(3, 1)[0]!);
    expect(slotsByLineEdge(bundleRoutes(shuffled))).toEqual(slotsByLineEdge(bundleRoutes(shapes)));
  });

  describe('on the recorded network', () => {
    const shapes = parseShapes(shapesJson);
    const runs = bundleRoutes(shapes);
    const slots = slotsByLineEdge(runs);

    it('gives the lines on every edge distinct, centred slots', () => {
      const byEdge = new Map<string, number[]>();
      for (const [k, slot] of slots) {
        const e = k.slice(k.indexOf('@') + 1);
        byEdge.set(e, [...(byEdge.get(e) ?? []), slot]);
      }
      let maxLines = 0;
      for (const list of byEdge.values()) {
        const n = list.length;
        maxLines = Math.max(maxLines, n);
        const expected = Array.from({ length: n }, (_, i) => i - (n - 1) / 2);
        expect([...list].sort((x, y) => x - y)).toEqual(expected);
      }
      expect(maxLines).toBeGreaterThanOrEqual(4);
    });

    it('covers every edge of every shape exactly once per line', () => {
      for (const s of shapes) {
        for (let i = 0; i + 1 < s.points.length; i++) {
          if (key(s.points[i]!) === key(s.points[i + 1]!)) continue;
          expect(slots.has(`${s.line}@${edgeKey(s.points[i]!, s.points[i + 1]!)}`)).toBe(true);
        }
      }
      // slotsByLineEdge already fails if a line draws an edge twice.
    });
  });
});
