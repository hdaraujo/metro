import type { LatLng, LineId, Shape } from './types';

/** One drawable piece of a line: consecutive edges with the same sideways offset. */
export interface LineRun {
  line: LineId;
  /** The line's colour: the colour of its first shape in input order. */
  color: string;
  /**
   * Sideways offset in line widths, relative to the order of `points`:
   * positive = right of travel, negative = left, 0 = centred on the road.
   * Values are multiples of 0.5 (e.g. -1.5, -0.5, 0.5, 1.5 for four lines).
   */
  offset: number;
  /** At least 2 points, in travel order. */
  points: LatLng[];
}

interface Edge {
  key: string;
  /** The two vertex keys, smaller first. */
  a: string;
  b: string;
  lines: Set<LineId>;
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

const vertexKey = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

function edgeKey(u: string, v: string): string {
  return u < v ? `${u}|${v}` : `${v}|${u}`;
}

const directionOrder = (shape: Shape) => (shape.direction === 'outbound' ? 0 : 1);

/**
 * Splits every line's shapes into runs that can be drawn side by side: wherever several lines
 * share a stretch of road (identical consecutive vertices), each line gets its own sideways slot,
 * ordered by line id, centred on the road. A stretch used by one line has offset 0. Every edge of
 * a line is drawn once, whichever of the line's shapes (directions) it comes from.
 *
 * Deterministic: the same shapes give the same runs, in the same order.
 */
export function bundleRoutes(shapes: readonly Shape[]): LineRun[] {
  const latLngByKey = new Map<string, LatLng>();
  const colorByLine = new Map<LineId, string>();

  // 1. Each shape as a list of distinct consecutive vertex keys.
  const vertexPaths = new Map<Shape, string[]>();
  for (const shape of shapes) {
    if (!colorByLine.has(shape.line)) colorByLine.set(shape.line, shape.color);
    const keys: string[] = [];
    for (const point of shape.points) {
      const key = vertexKey(point);
      if (!latLngByKey.has(key)) latLngByKey.set(key, point);
      if (keys[keys.length - 1] !== key) keys.push(key);
    }
    if (keys.length >= 2) vertexPaths.set(shape, keys);
  }

  // 2. Line rank: the left-to-right order of strands on every edge.
  const lineRank = new Map(
    [...new Set(shapes.map((s) => s.line))].sort(compare).map((line, i) => [line, i]),
  );

  // 3. Undirected edges and the lines using them.
  const edges = new Map<string, Edge>();
  for (const [shape, keys] of vertexPaths) {
    for (let i = 0; i + 1 < keys.length; i++) {
      const key = edgeKey(keys[i]!, keys[i + 1]!);
      let edge = edges.get(key);
      if (!edge) {
        const [a, b] =
          keys[i]! < keys[i + 1]! ? [keys[i]!, keys[i + 1]!] : [keys[i + 1]!, keys[i]!];
        edge = { key, a, b, lines: new Set() };
        edges.set(key, edge);
      }
      edge.lines.add(shape.line);
    }
  }

  // 4. A consistent orientation per edge, so strands keep their side along a corridor.
  const orient = orientEdges(edges);

  // 5. Each line's slot on each edge, relative to the edge's orientation.
  const slotOf = (edge: Edge, line: LineId): number => {
    const ranked = [...edge.lines].sort((x, y) => lineRank.get(x)! - lineRank.get(y)!);
    return ranked.indexOf(line) - (ranked.length - 1) / 2;
  };

  // 6. Walk each shape, emitting each line's edges once, grouped into runs of equal offset.
  const ordered = [...vertexPaths.keys()].sort(
    (x, y) =>
      lineRank.get(x.line)! - lineRank.get(y.line)! ||
      directionOrder(x) - directionOrder(y) ||
      compare(x.id, y.id),
  );
  const emitted = new Map<LineId, Set<string>>();
  const runs: LineRun[] = [];
  for (const shape of ordered) {
    const keys = vertexPaths.get(shape)!;
    let done = emitted.get(shape.line);
    if (!done) {
      done = new Set();
      emitted.set(shape.line, done);
    }
    let run: { offset: number; keys: string[] } | null = null;
    const close = (open: { offset: number; keys: string[] } | null) => {
      if (open) {
        runs.push({
          line: shape.line,
          color: colorByLine.get(shape.line)!,
          offset: open.offset,
          points: open.keys.map((k) => latLngByKey.get(k)!),
        });
      }
      return null;
    };
    for (let i = 0; i + 1 < keys.length; i++) {
      const u = keys[i]!;
      const v = keys[i + 1]!;
      const key = edgeKey(u, v);
      if (done.has(key)) {
        run = close(run);
        continue;
      }
      const slot = slotOf(edges.get(key)!, shape.line);
      const forward = orient.get(key)![0] === u;
      const signed = (forward ? slot : -slot) || 0; // normalise -0
      if (run && run.offset === signed && run.keys[run.keys.length - 1] === u) {
        run.keys.push(v);
      } else {
        close(run);
        run = { offset: signed, keys: [u, v] };
      }
      done.add(key);
    }
    close(run);
  }
  return runs;
}

/**
 * Orients every edge as a "flow": repeatedly continue the oriented edge whose neighbour shares
 * the most lines with it, seeding each connected component at its busiest edge.
 */
function orientEdges(edges: Map<string, Edge>): Map<string, [string, string]> {
  const incident = new Map<string, Edge[]>();
  for (const edge of edges.values()) {
    for (const v of [edge.a, edge.b]) {
      let list = incident.get(v);
      if (!list) {
        list = [];
        incident.set(v, list);
      }
      list.push(edge);
    }
  }

  const orient = new Map<string, [string, string]>();
  const shared = (x: Edge, y: Edge) => {
    let n = 0;
    for (const line of x.lines) if (y.lines.has(line)) n++;
    return n;
  };

  while (orient.size < edges.size) {
    let best: { e: Edge; f: Edge; v: string; score: number } | null = null;
    for (const [eKey, [from, to]] of orient) {
      const e = edges.get(eKey)!;
      for (const v of [from, to]) {
        for (const f of incident.get(v)!) {
          if (orient.has(f.key)) continue;
          const score = shared(e, f);
          if (
            !best ||
            score > best.score ||
            (score === best.score &&
              (f.key < best.f.key || (f.key === best.f.key && e.key < best.e.key)))
          ) {
            best = { e, f, v, score };
          }
        }
      }
    }

    if (best) {
      const { e, f, v } = best;
      const other = f.a === v ? f.b : f.a;
      const intoV = orient.get(e.key)![1] === v;
      orient.set(f.key, intoV ? [v, other] : [other, v]);
      continue;
    }

    // Seed a new component at its busiest unoriented edge.
    let seed: Edge | null = null;
    for (const edge of edges.values()) {
      if (orient.has(edge.key)) continue;
      if (
        !seed ||
        edge.lines.size > seed.lines.size ||
        (edge.lines.size === seed.lines.size && edge.key < seed.key)
      ) {
        seed = edge;
      }
    }
    orient.set(seed!.key, [seed!.a, seed!.b]);
  }
  return orient;
}
