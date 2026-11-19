import { haversineMeters } from './geo';
import type { LatLng, LineId, Shape } from './types';

/**
 * Vertices of a line's outbound and inbound shapes within this distance of each other are drawn
 * at one shared vertex, so a line's two directions form one strand even where they stop at the
 * opposite stops of a pair across a street (e.g. Câmara (asc)/(desc)).
 */
export const DIRECTION_MERGE_METERS = 75;

/** One drawable piece of a line: consecutive edges with the same sideways offset. */
export interface LineRun {
  /** The line drawn. A line lying wholly on a longer one is drawn as that line (see `bundleRoutes`). */
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

/** Shapes relabelled by `absorbSublines`: walked after the line's own, so its runs stay whole. */
const absorbed = new WeakSet<Shape>();
const absorbedOrder = (shape: Shape) => (absorbed.has(shape) ? 1 : 0);

/**
 * Splits every line's shapes into runs that can be drawn side by side: wherever several lines
 * share a stretch of road (identical consecutive vertices), each line gets its own sideways slot,
 * ordered by line id, centred on the road. A stretch used by one line has offset 0. Every edge of
 * a line is drawn once, whichever of the line's shapes (directions) it comes from. A line's
 * outbound and inbound vertices within `DIRECTION_MERGE_METERS` of each other are first merged
 * onto one vertex (the same one for every line passing there), so each line is one strand for
 * both directions, whichever way round the source labels them. Then a line whose route lies
 * wholly on a longer line's (a short-turn variant, e.g. U1 on S1) is drawn as that longer line,
 * so the map shows one strand per route, not per service.
 *
 * Deterministic: the same shapes give the same runs, in the same order.
 */
export function bundleRoutes(shapes: readonly Shape[]): LineRun[] {
  const merged = absorbSublines(mergeDirections(shapes));
  const latLngByKey = new Map<string, LatLng>();
  const colorByLine = new Map<LineId, string>();

  // 1. Each shape as a list of distinct consecutive vertex keys.
  const vertexPaths = new Map<Shape, string[]>();
  for (const shape of merged) {
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
    [...new Set(merged.map((s) => s.line))].sort(compare).map((line, i) => [line, i]),
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
      absorbedOrder(x) - absorbedOrder(y) ||
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
 * Relabels every shape of a line whose edges are a strict subset of another line's edges as that
 * other line (with its colour). Among several such lines, the one with the most edges wins, then
 * the smallest id; chains resolve to the outermost line. Lines with identical routes are kept
 * apart. Returns the shapes in input order; unchanged ones as-is, changed ones as copies.
 */
function absorbSublines(shapes: readonly Shape[]): Shape[] {
  const edgesByLine = new Map<LineId, Set<string>>();
  const colorByLine = new Map<LineId, string>();
  for (const shape of shapes) {
    if (!colorByLine.has(shape.line)) colorByLine.set(shape.line, shape.color);
    let edges = edgesByLine.get(shape.line);
    if (!edges) {
      edges = new Set();
      edgesByLine.set(shape.line, edges);
    }
    let prev: string | null = null;
    for (const point of shape.points) {
      const key = vertexKey(point);
      if (prev !== null && prev !== key) edges.add(edgeKey(prev, key));
      prev = key;
    }
  }

  const lines = [...edgesByLine.keys()].sort(compare);
  const parentOf = new Map<LineId, LineId>();
  for (const line of lines) {
    const own = edgesByLine.get(line)!;
    if (own.size === 0) continue;
    let best: LineId | null = null;
    for (const other of lines) {
      const theirs = edgesByLine.get(other)!;
      if (other === line || theirs.size <= own.size) continue;
      if (![...own].every((e) => theirs.has(e))) continue;
      if (best === null || theirs.size > edgesByLine.get(best)!.size) best = other;
    }
    if (best !== null) parentOf.set(line, best);
  }
  const rootOf = (line: LineId): LineId => {
    let root = line;
    while (parentOf.has(root)) root = parentOf.get(root)!;
    return root;
  };

  return shapes.map((shape) => {
    const root = rootOf(shape.line);
    if (root === shape.line) return shape;
    const copy = { ...shape, line: root, color: colorByLine.get(root)! };
    absorbed.add(copy);
    return copy;
  });
}

/**
 * Merges each line's two directions where they run within `DIRECTION_MERGE_METERS` of each other,
 * so both directions share edges.
 *
 * Two distinct vertices are linked when one lies on an outbound and the other on an inbound shape
 * of the **same line** within that distance. Linked vertices form groups (transitively, so lines
 * that share vertices end up in the same group), and every vertex of a group is drawn at one
 * representative: the vertex on the most outbound shapes, then on the most shapes, then the
 * smallest key. Choosing per group, not per line, keeps lines that share a road on the same
 * vertices even when the source labels their directions the other way round (e.g. U3's
 * outbound passing the `(asc)` stops while S2's and U2's pass the `(desc)` ones). Vertices of
 * different lines alone are never linked.
 *
 * Returns the shapes in input order; unchanged shapes are returned as-is, changed ones as copies.
 * Never mutates input. Independent of input order.
 */
function mergeDirections(shapes: readonly Shape[]): Shape[] {
  // Distinct vertices, with how many shapes (and outbound shapes) use each.
  interface Vertex {
    point: LatLng;
    shapes: number;
    outbound: number;
  }
  const vertices = new Map<string, Vertex>();
  // Per line and direction, the distinct vertex keys it passes.
  const byLine = new Map<LineId, { outbound: Set<string>; inbound: Set<string> }>();
  for (const shape of shapes) {
    let sides = byLine.get(shape.line);
    if (!sides) {
      sides = { outbound: new Set(), inbound: new Set() };
      byLine.set(shape.line, sides);
    }
    const own = new Set<string>();
    for (const point of shape.points) {
      const key = vertexKey(point);
      if (own.has(key)) continue;
      own.add(key);
      sides[shape.direction].add(key);
      let vertex = vertices.get(key);
      if (!vertex) {
        vertex = { point, shapes: 0, outbound: 0 };
        vertices.set(key, vertex);
      }
      vertex.shapes++;
      if (shape.direction === 'outbound') vertex.outbound++;
    }
  }

  // Union-find over vertex keys.
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    let root = k;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(k, root);
    return root;
  };
  for (const { outbound, inbound } of byLine.values()) {
    for (const o of outbound) {
      for (const i of inbound) {
        if (o === i) continue;
        if (
          haversineMeters(vertices.get(o)!.point, vertices.get(i)!.point) > DIRECTION_MERGE_METERS
        ) {
          continue;
        }
        const [ro, ri] = [find(o), find(i)];
        if (ro !== ri) parent.set(ro < ri ? ri : ro, ro < ri ? ro : ri);
      }
    }
  }

  // One representative per group.
  const better = (x: string, y: string) => {
    const [vx, vy] = [vertices.get(x)!, vertices.get(y)!];
    return (
      vx.outbound > vy.outbound ||
      (vx.outbound === vy.outbound && (vx.shapes > vy.shapes || (vx.shapes === vy.shapes && x < y)))
    );
  };
  const representative = new Map<string, string>();
  for (const key of parent.keys()) {
    const root = find(key);
    const current = representative.get(root);
    if (current === undefined || better(key, current)) representative.set(root, key);
  }

  return shapes.map((shape) => {
    let changed = false;
    const points = shape.points.map((p) => {
      const key = vertexKey(p);
      if (!parent.has(key)) return p;
      const target = representative.get(find(key))!;
      if (target === key) return p;
      changed = true;
      return vertices.get(target)!.point;
    });
    return changed ? { ...shape, points } : shape;
  });
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
