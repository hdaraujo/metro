import { describe, expect, it } from 'vitest';
import shapesJson from '../../tests/fixtures/route-shapes.json';
import { parseShapes } from '../sources/metrobusTimetable';
import { bundleRoutes, DIRECTION_MERGE_METERS, type LineRun } from './routeBundles';
import { haversineMeters } from './geo';
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

  describe("merging a line's two directions", () => {
    const [p0, p1, p2, p3] = corridor as [LatLng, LatLng, LatLng, LatLng];
    const near = (p: LatLng) => P(p.lat + 0.00005, p.lng);
    const far = (p: LatLng) => P(p.lat, p.lng + 0.0025);

    it('merges near-parallel directions into one strand on the outbound coordinates', () => {
      const runs = bundleRoutes([
        shape('A-0', 'A', 'outbound', [p0, p1, p2, p3]),
        shape('A-1', 'A', 'inbound', [p3, near(p2), near(p1), p0]),
      ]);
      expect(runs).toEqual([{ line: 'A', color: '#000000', offset: 0, points: [p0, p1, p2, p3] }]);
      const drawn = runs.flatMap((r) => r.points.map(key));
      expect(drawn).not.toContain(key(near(p1)));
      expect(drawn).not.toContain(key(near(p2)));
    });

    it('keeps a far divergence', () => {
      const runs = bundleRoutes([
        shape('A-0', 'A', 'outbound', [p0, p1, p2, p3]),
        shape('A-1', 'A', 'inbound', [p3, far(p2), far(p1), p0]),
      ]);
      const slots = slotsByLineEdge(runs);
      for (const [a, b] of [
        [p0, p1],
        [p1, p2],
        [p2, p3],
        [p3, far(p2)],
        [far(p2), far(p1)],
        [far(p1), p0],
      ] as const) {
        expect(slots.has(`A@${edgeKey(a, b)}`)).toBe(true);
      }
    });

    it('bundles merged lines together', () => {
      const inbound = [p3, near(p2), near(p1), p0];
      const runs = bundleRoutes([
        shape('A-0', 'A', 'outbound', [p0, p1, p2, p3]),
        shape('A-1', 'A', 'inbound', inbound),
        shape('B-0', 'B', 'outbound', [p0, p1, p2, p3]),
        shape('B-1', 'B', 'inbound', inbound),
      ]);
      const slots = slotsByLineEdge(runs);
      expect(slots.size).toBe(6);
      for (const [a, b] of [
        [p0, p1],
        [p1, p2],
        [p2, p3],
      ] as const) {
        const e = edgeKey(a, b);
        expect([slots.get(`A@${e}`), slots.get(`B@${e}`)].sort()).toEqual([-0.5, 0.5]);
      }
    });

    it('bundles lines whose directions are labelled the other way round', () => {
      const base = [p0, p1, p2, p3];
      const offset = [p3, near(p2), near(p1), p0];
      for (const shapes of [
        [
          shape('A-0', 'A', 'outbound', base),
          shape('A-1', 'A', 'inbound', offset),
          shape('B-0', 'B', 'outbound', offset),
          shape('B-1', 'B', 'inbound', base),
        ],
        [
          shape('A-0', 'A', 'outbound', base),
          shape('A-1', 'A', 'inbound', offset),
          shape('B-0', 'B', 'outbound', base),
          shape('B-1', 'B', 'inbound', offset),
          shape('C-0', 'C', 'outbound', offset),
          shape('C-1', 'C', 'inbound', base),
        ],
      ]) {
        const lines = [...new Set(shapes.map((s) => s.line))];
        const slots = slotsByLineEdge(bundleRoutes(shapes));
        expect(slots.size).toBe(3 * lines.length);
        const n = lines.length;
        const expected = Array.from({ length: n }, (_, i) => i - (n - 1) / 2);
        for (const [a, b] of [
          [p0, p1],
          [p1, p2],
          [p2, p3],
        ] as const) {
          const e = edgeKey(a, b);
          const got = lines.map((l) => slots.get(`${l}@${e}`)!).sort((x, y) => x - y);
          expect(got).toEqual(expected);
        }
      }
    });

    it('never snaps across lines', () => {
      const b = [p0, p1, p2, p3].map(near);
      const runs = bundleRoutes([
        shape('A-0', 'A', 'outbound', [p0, p1, p2, p3]),
        shape('B-0', 'B', 'outbound', b),
      ]);
      expect(runs.filter((r) => r.line === 'B')).toEqual([
        { line: 'B', color: '#000000', offset: 0, points: b },
      ]);
    });

    it('does not mutate its input', () => {
      const input = [
        shape('A-0', 'A', 'outbound', [p0, p1, p2, p3]),
        shape('A-1', 'A', 'inbound', [p3, near(p2), near(p1), p0]),
      ];
      const clone = structuredClone(input);
      bundleRoutes(input);
      expect(input).toEqual(clone);
    });
  });

  describe('lines lying on a longer line', () => {
    const [p0, p1, p2, p3] = corridor as [LatLng, LatLng, LatLng, LatLng];

    it('are drawn as the longer line, in its colour', () => {
      const runs = bundleRoutes([
        shape('U-0', 'U', 'outbound', [p0, p1, p2], '#222222'),
        shape('U-1', 'U', 'inbound', [p2, p1, p0], '#222222'),
        shape('S-0', 'S', 'outbound', [p0, p1, p2, p3], '#111111'),
        shape('S-1', 'S', 'inbound', [p3, p2, p1, p0], '#111111'),
      ]);
      expect(runs).toEqual([{ line: 'S', color: '#111111', offset: 0, points: [p0, p1, p2, p3] }]);
    });

    it('go to the longest line, through chains', () => {
      const runs = bundleRoutes([
        shape('A-0', 'A', 'outbound', [p0, p1]),
        shape('B-0', 'B', 'outbound', [p0, p1, p2]),
        shape('C-0', 'C', 'outbound', [p0, p1, p2, p3]),
      ]);
      expect(runs.map((r) => r.line)).toEqual(['C']);
    });

    it('are kept apart when they leave the longer line or share it equally', () => {
      const branch = P(40.001, -8.01);
      const runs = bundleRoutes([
        shape('A-0', 'A', 'outbound', [p0, p1, p2, p3]),
        shape('B-0', 'B', 'outbound', [p0, p1, p2, p3]),
        shape('C-0', 'C', 'outbound', [p0, p1, branch]),
      ]);
      expect([...new Set(runs.map((r) => r.line))]).toEqual(['A', 'B', 'C']);
    });
  });

  it('is deterministic and independent of input order', () => {
    const shapes = parseShapes(shapesJson);
    expect(bundleRoutes(shapes)).toEqual(bundleRoutes(shapes));
    const shuffled = [...shapes].reverse();
    shuffled.push(shuffled.splice(3, 1)[0]!);
    expect(slotsByLineEdge(bundleRoutes(shuffled))).toEqual(slotsByLineEdge(bundleRoutes(shapes)));
  });

  /** The recorded network with U3's two directions swapped, as the live source served it on 2026-11-19. */
  const withU3Swapped = (shapes: Shape[]): Shape[] => {
    const u3 = (dir: Direction) => shapes.find((s) => s.line === 'U3' && s.direction === dir)!;
    const [out, back] = [u3('outbound'), u3('inbound')];
    return shapes.map((s) =>
      s === out ? { ...s, points: back.points } : s === back ? { ...s, points: out.points } : s,
    );
  };

  describe.each([
    ['on the recorded network', parseShapes(shapesJson)],
    ['with U3 labelled the other way round', withU3Swapped(parseShapes(shapesJson))],
  ])('%s', (_name, shapes) => {
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
      expect(maxLines).toBe(2);
    });

    it('covers every edge of every shape exactly once per line', () => {
      const otherDirection = (s: Shape) =>
        shapes
          .filter((o) => o.line === s.line && o.direction !== s.direction)
          .flatMap((o) => o.points);
      const isFar = (p: LatLng, s: Shape) =>
        otherDirection(s).every((o) => haversineMeters(p, o) > DIRECTION_MERGE_METERS);
      const drawnAs: Record<string, string> = { S1: 'S1', U1: 'S1', S2: 'S2', U2: 'S2', U3: 'U3' };
      for (const s of shapes) {
        for (let i = 0; i + 1 < s.points.length; i++) {
          const [a, b] = [s.points[i]!, s.points[i + 1]!];
          if (key(a) === key(b)) continue;
          if (!(isFar(a, s) && isFar(b, s))) continue;
          expect(slots.has(`${drawnAs[s.line]}@${edgeKey(a, b)}`)).toBe(true);
        }
      }
      // Every vertex drawn is a vertex of some shape of that line's group.
      const vertices = new Set(shapes.flatMap((s) => s.points.map(key)));
      for (const run of runs) for (const p of run.points) expect(vertices.has(key(p))).toBe(true);
      // slotsByLineEdge already fails if a line draws an edge twice.
    });

    it('draws three lines, S1 in blue, S2 in red and U3 in green, like the network diagram', () => {
      const colorOf = new Map(shapes.map((s) => [s.line, s.color]));
      expect(new Map(runs.map((r) => [r.line, r.color]))).toEqual(
        new Map([
          ['S1', colorOf.get('S1')],
          ['S2', colorOf.get('S2')],
          ['U3', colorOf.get('U3')],
        ]),
      );
    });

    it('draws S2 and U3 as two strands between Câmara and República', () => {
      const path = [
        P(40.21035, -8.432479),
        P(40.211257, -8.429836),
        P(40.211581, -8.424759),
        P(40.209825, -8.419701),
      ];
      for (let i = 0; i + 1 < path.length; i++) {
        const e = edgeKey(path[i]!, path[i + 1]!);
        const lines = [...slots.keys()]
          .filter((k) => k.endsWith(`@${e}`))
          .map((k) => k.slice(0, k.indexOf('@')))
          .sort();
        expect(lines).toEqual(['S2', 'U3']);
      }
      const drawn = new Set(runs.flatMap((r) => r.points.map(key)));
      for (const p of [P(40.211255, -8.42977), P(40.211565, -8.42482), P(40.209594, -8.420384)]) {
        expect(drawn.has(key(p))).toBe(false);
      }
    });

    it('draws each line once on every edge, at most 2 lines per edge', () => {
      const linesByEdge = new Map<string, string[]>();
      for (const k of slots.keys()) {
        const at = k.indexOf('@');
        const e = k.slice(at + 1);
        linesByEdge.set(e, [...(linesByEdge.get(e) ?? []), k.slice(0, at)]);
      }
      let maxLines = 0;
      for (const lines of linesByEdge.values()) {
        expect(new Set(lines).size).toBe(lines.length);
        maxLines = Math.max(maxLines, lines.length);
      }
      expect(maxLines).toBe(2);
    });

    it('draws one run per stretch: no line is drawn on two near-parallel paths', () => {
      // Every pair of drawn vertices of the same line is either identical or far apart.
      for (const line of new Set(runs.map((r) => r.line))) {
        const pts = [
          ...new Set(runs.filter((r) => r.line === line).flatMap((r) => r.points.map(key))),
        ];
        const ll = pts.map((k) => {
          const [lat, lng] = k.split(',').map(Number) as [number, number];
          return P(lat, lng);
        });
        for (let i = 0; i < ll.length; i++) {
          for (let j = i + 1; j < ll.length; j++) {
            expect(haversineMeters(ll[i]!, ll[j]!)).toBeGreaterThan(DIRECTION_MERGE_METERS);
          }
        }
      }
    });
  });
});
