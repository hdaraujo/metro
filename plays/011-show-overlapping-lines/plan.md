# Play 011 — Show overlapping lines side by side

## Context

Intent: *"When lines overlap in the map only one is visible. Make it so if more than one line
overlap show them side by side so all are visible."*

Today `MapView.tsx` draws every shape (`network.shapes`, 10 of them: S1, S2, U1, U2, U3 × Ida/Volta)
as a plain 4 px line in its colour, all on the same layer. Most of the network is a shared trunk
(in the recorded fixture, S1/S2 overlap ~95 %, U1 lies entirely on S1, U2 on S2, etc.), so whichever
line is drawn last hides the others and the rider can't tell which lines run where.

Goal: wherever two or more **lines** share a stretch of road, draw them as parallel strands side by
side (metro-map style), each in its own colour, centred on the road. A stretch used by one line
looks exactly as today. Nothing else on the map changes. No new screen → no UI design was needed
(the design triage in session 002 confirmed this).

**Repositories touched: `metro` only** (code in `src/`). No other repository.

### Key facts from exploration (the algorithm relies on them)

- Shapes are coarse polylines (8–41 vertices) and overlapping shapes share **exactly identical
  vertices** (e.g. S1-0 and S2-0 share 35 identical edges; U1-0 shares all 14 of its edges with
  S1). So overlap is detected by matching edges (pairs of identical vertices), no geometric
  tolerance needed. If a future source has non-identical vertices, those stretches simply draw
  un-offset, as today (graceful fallback, never a crash).
- A line's Ida and Volta shapes run along the same edges in opposite order (U3 diverges on a few
  edges). Overlap is counted **per line**, not per shape: a line's two directions are one strand.
- MapLibre `line-offset` (paint, data-driven) shifts a line sideways in pixels, **positive = right
  of the line's drawing direction**. Because shapes are digitised in different directions, offsets
  must be computed per edge relative to a consistent edge orientation, then signed per run.

## Implementation

### 1. New pure domain module `src/domain/routeBundles.ts`

No DOM/React/MapLibre imports (domain layer rule in tech.md). Uses `LatLng`, `LineId`, `Shape` from
`./types`.

```ts
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

export function bundleRoutes(shapes: readonly Shape[]): LineRun[];
```

Algorithm (deterministic — same input → same output, order included):

1. **Vertex key**: `` `${lat.toFixed(6)},${lng.toFixed(6)}` ``. Within each shape drop consecutive
   points with the same key. Shapes with fewer than 2 distinct points contribute nothing.
2. **Line rank**: distinct `shape.line` values sorted with plain string comparison
   (`a < b ? -1 : …`, not locale) → `S1, S2, U1, U2, U3`. Rank is the left-to-right order of
   strands on every edge.
3. **Edges**: each pair of consecutive vertices is an undirected edge, key =
   `` `${minKey}|${maxKey}` `` (string comparison). For every edge record its two vertices
   (`LatLng`) and the **set of lines** using it (from any shape of the line, either direction).
4. **Edge orientation** (`orient: Map<edgeKey, [fromKey, toKey]>`) — a consistent "flow" so that
   strands keep their side along a corridor and through junctions where it continues. Build the
   adjacency (vertex key → incident edge keys). Then loop until every edge is oriented:
   - Among all pairs (oriented edge `e`, unoriented edge `f` sharing a vertex `v` with `e`), pick
     the pair with the **largest** `|lines(e) ∩ lines(f)|`; ties broken by `f`'s key (smallest),
     then `e`'s key (smallest). Orient `f` to continue `e`: if `e` points **into** `v`, `f`
     points **out of** `v`; if `e` points **out of** `v`, `f` points **into** `v`. (If `e` and `f`
     share both vertices — impossible, as keys are distinct — ignore.)
   - If no such pair exists (start, or a new disconnected component), seed: the unoriented edge
     with the **most lines**, ties by smallest key, oriented from its smaller vertex key to its
     larger.
   - The network is ~100 edges, so a straightforward O(E²) scan per step is fine; no heap needed.
5. **Edge slots**: on an edge with lines sorted by rank `l0 … l(n-1)`, line `li` gets
   `slot = i − (n − 1) / 2` (e.g. n=1 → 0; n=2 → −0.5, 0.5; n=3 → −1, 0, 1), meaning
   left (−) to right (+) **relative to the edge's orientation**.
6. **Runs**: process shapes sorted by line rank, then `outbound` before `inbound`, then `id`.
   Keep a per-line set of already-emitted edge keys. Walk each shape's edges `u → v` in order:
   - If the edge is already emitted for this line → close the current run (if any) and continue.
   - `signed = (orient[edge] is u→v) ? slot : −slot`.
   - If a current run exists with `offset === signed` and its last point is `u` → append `v`.
     Otherwise close the current run and start a new one `[u, v]` with `offset = signed`.
   - Mark the edge emitted for this line. At the end of the shape close the current run.
   - Normalise `-0` to `0`. Use the original `LatLng` of the vertices (first occurrence of the key).
   Result: each line's every edge is drawn exactly once, so a line's Ida and Volta no longer
   double-draw; where Volta diverges (U3), its own edges are drawn.
   Where a line's offset changes between consecutive edges (lines join/leave the bundle) the next
   run starts at the shared vertex; round caps cover the small step. That jog is accepted.

### 2. Unit tests `src/domain/routeBundles.test.ts` (Vitest, next to the code)

Small synthetic shapes built with a local `shape(id, line, direction, points)` helper (colour
`#000000` unless the test checks colour) plus the recorded fixture (`parseShapes` from
`../sources/metrobusTimetable` on `../../tests/fixtures/route-shapes.json`, as `buses.test.ts`
does). A helper `geoSlot(run, i)` = the run's offset made relative to the edge's *lexicographic*
direction: for edge `points[i] → points[i+1]`, `+offset` if the first vertex key < second, else
`−offset` — tests use this so they don't depend on the internal orientation choice.

Cases:
- A single line (Ida + Volta over the same points, reversed) → exactly one run, `offset 0`,
  covering every edge once; colour taken from the first shape.
- Two lines sharing a whole corridor, both digitised the same way → each one run, offsets
  `−0.5` (lower rank) and `+0.5`.
- Two lines sharing a corridor but digitised in **opposite** directions → their `geoSlot`s on
  each shared edge are different (one −0.5, one +0.5): they sit on opposite physical sides.
- Two lines sharing the middle of a route and diverging at both ends (Y shapes) → on the shared
  edges offsets ±0.5; on the edges used by one line offset 0; the runs split at the junction
  vertices; and on the shared stretch each line's `geoSlot` stays the same on every edge (no side
  swap along a corridor).
- Duplicate consecutive points and a 1-point shape are tolerated (no zero-length edges, no throw).
- Determinism: calling twice on the same input gives deep-equal output; shuffling the input
  shapes' order does not change any edge's geographic slot assignment per line.
- Fixture: for every edge, the `geoSlot`s of the lines covering it are distinct and equal the set
  `{i − (n−1)/2}`; every edge of every fixture shape is covered by exactly one run of that shape's
  line; at least one edge carries ≥ 4 lines (sanity that overlap is detected on real data).

### 3. Render the runs in `src/ui/map/MapView.tsx`

- Add `const ROUTE_WIDTH_PX = 4;` next to the other constants.
- Rewrite `routesGeoJson(network)` to map `bundleRoutes(network.shapes)` into features:
  `properties: { line: run.line, color: run.color, offset: run.offset }`,
  `geometry: { type: 'LineString', coordinates: run.points.map(toLngLat) }`.
- In `showNetwork`, the `routes` layer paint becomes:
  ```ts
  paint: {
    'line-color': ['get', 'color'],
    'line-width': ROUTE_WIDTH_PX,
    'line-offset': ['*', ['get', 'offset'], ROUTE_WIDTH_PX],
  },
  ```
  Layout stays `{ 'line-cap': 'round', 'line-join': 'round' }`. Layer and source ids stay
  `routes`; the `setData` refresh path is unchanged (it calls the new `routesGeoJson`). Strands
  touch with no gap (spacing = width), at every zoom.
- Nothing else changes: the `stops` layer (white circles, drawn above routes, still centred on the
  road and so in the middle of a bundle), the stop hit test, DOM markers, bus positions (still
  interpolated on the un-offset shape, i.e. at the bundle's centre — bus pills are wider than a
  bundle), smart zoom, sheet.

### Out of scope

Offsetting bus markers onto their own strand; zoom-dependent widths; changes to the data adapter or
`Network` type; any documentation edit (the Planner updates `documentation/modules/map-screen.md`'s
**Map → Layers** bullet from the real diff after approval — the Developer does not touch
`documentation/`).

## Files

- **New** `src/domain/routeBundles.ts`, `src/domain/routeBundles.test.ts`
- **Modified** `src/ui/map/MapView.tsx` (`routesGeoJson`, `routes` layer paint, constant)
- Reused: `Shape`/`LatLng`/`LineId` (`src/domain/types.ts`), `parseShapes`
  (`src/sources/metrobusTimetable.ts`), fixture `tests/fixtures/route-shapes.json`.

## Verification

1. `npm run lint`, `npm run typecheck`, `npm test` (new tests pass, existing ones unchanged),
   `npm run build`.
2. `npx playwright install chromium` (once) then `npm run test:e2e` — existing map tests must still
   pass (stop hit testing and markers are untouched).
3. Manual: `npm run dev`, open the app, zoom into central Coimbra (the S1/S2/U1/U2 trunk): the
   blue (S1), red (S2), darker blue (U1), coral (U2) and green (U3) strands appear side by side
   wherever they share a road, each visible; where only one line runs it is a single centred line
   as before; white stop circles sit in the middle of bundles; no console errors. Check on a phone
   viewport and desktop.
