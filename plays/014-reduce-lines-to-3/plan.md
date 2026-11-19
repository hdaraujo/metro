# Play 014 — One strand per line for both directions ("reduce lines to 3")

## Context

Intent: *"Show only one line in the map for both directions."*

Play 011 draws lines side by side (`bundleRoutes` in `src/domain/routeBundles.ts`) and already
merges a line's outbound and inbound shapes wherever they share **identical** vertices. In the
real data (recorded fixture and today's live `route-shapes.json`, which are identical) that holds
everywhere except one stretch in the city centre: S2, U2 and U3 run outbound past the
`(desc)` stops and inbound past the `(asc)` stops, which are separate stops on opposite sides of
the same street:

| Stop pair | outbound (`desc`) vertex | inbound (`asc`) vertex | apart |
| --- | --- | --- | --- |
| Câmara | 40.211257, -8.429836 | 40.211255, -8.429770 | 5.6 m |
| Mercado | 40.211581, -8.424759 | 40.211565, -8.424820 | 5.5 m |
| República | 40.209825, -8.419701 | 40.209594, -8.420384 | 63.4 m |

Because the vertices differ, each of these three lines' outbound and inbound edges are treated
as different roads. Between the junction vertex `40.210350, -8.432479` and República, the map
therefore shows **6 strands** (S2, U2, U3 × 2 directions) stacked almost on top of each other,
where the rider expects **3**. Every other stretch is already one strand per line.

Goal: on the map, every line is drawn as **one strand for both directions**. On this stretch
that means 3 strands (S2, U2, U3) side by side. Nothing else changes: stop circles, bus
markers, the sheet and smart zoom stay as they are. The play adds no new screen, so no UI
design is needed.

**Repositories touched: `metro` only** (code in `src/domain/`). No other repository.

## Approach

Before building edges, `bundleRoutes` **snaps each inbound vertex onto the nearest vertex of the
same line's outbound shape(s)** when it lies within `DIRECTION_MERGE_METERS = 75`. The inbound
edges then become identical to the outbound edges, and the existing per-line edge dedup draws
them once. Because U2 and U3 already share S2's outbound vertices exactly, all three snapped
lines end up on the same edges and get the normal 3-line slots (−1, 0, +1).

The threshold is safe on real data. The closest distinct vertex pairs in the whole network are
5.5 m, 5.6 m and 63.4 m (the three asc/desc pairs above), then 103.8 m (two vertices of
*different* lines, which this rule never compares). Snapping is also limited to opposite
directions of the **same line**, so separate roads of different lines can never be merged.

## Implementation

### 1. `src/domain/routeBundles.ts`

- Add an exported constant:
  ```ts
  /**
   * An inbound vertex within this distance of a vertex of the same line's outbound shape is
   * drawn at that outbound vertex, so a line's two directions form one strand even where they
   * stop at the opposite stops of a pair across a street (e.g. Câmara (asc)/(desc)).
   */
  export const DIRECTION_MERGE_METERS = 75;
  ```
- Import `haversineMeters` from `./geo` (it is pure and already in the domain layer).
- Add a pure helper (not exported, or exported only if tests need it; the tests below use
  `bundleRoutes` only):
  ```ts
  function mergeDirections(shapes: readonly Shape[]): Shape[]
  ```
  It returns a new array in the **same order** as the input. Each element is the original
  `Shape` object unless that shape is changed, in which case it is a copy
  `{ ...shape, points: snapped }`. It never mutates its input.
  - Per line, the **anchors** are the points of that line's `outbound` shapes. Take those shapes
    in `id` order (plain string comparison, the `compare` helper), and their points in order.
  - For every `inbound` shape of a line that has anchors, map each point `p` to the anchor with
    the smallest `haversineMeters(p, anchor)`. If that distance is `<= DIRECTION_MERGE_METERS`,
    use the anchor's `LatLng`; otherwise keep `p`. Ties go to the earlier anchor (keep the first
    minimum found with `<`).
  - Outbound shapes and lines with no outbound shape are unchanged.
  - Scale: about 50 vertices, so a plain nested loop is fine.
- In `bundleRoutes`, call `const merged = mergeDirections(shapes);` at the top and use `merged`
  in place of `shapes` everywhere in the function: the colour map, `lineRank`, `vertexPaths` and
  the `ordered` sort. Shape identity is used as a `Map` key (`vertexPaths`), and `ordered` is
  built from `vertexPaths.keys()`, so it works on the merged copies unchanged. Snapping can make
  two consecutive inbound points equal; the existing "drop consecutive duplicate keys" step
  already handles that.
- Update the `bundleRoutes` doc comment. Add one sentence: inbound vertices within
  `DIRECTION_MERGE_METERS` of the same line's outbound vertices are snapped onto them first, so
  each line is one strand for both directions.
- Nothing else in the algorithm changes: orientation, slots, runs, colours and determinism.
  Determinism and input-order independence still hold, because anchors are chosen by line and
  sorted by shape id, not by input order.

### 2. `src/domain/routeBundles.test.ts`

New synthetic cases. Use the existing `shape`, `P` and `slotsByLineEdge` helpers. Build the
offsets from `corridor`-style points about 0.00005° apart (≈ 5 m) for "near" and about 0.002°
(≈ 200 m) for "far".
- **Near-parallel directions merge.** Line A outbound over `[p0, p1, p2, p3]`, inbound over
  `[p3, p2', p1', p0]`, where `p1'` and `p2'` are about 5 m from `p1` and `p2`. Expect exactly
  one run: `offset 0`, covering `p0…p3` with the **outbound** coordinates, and no point equal to
  `p1'` or `p2'`.
- **Far divergence is kept.** The same setup with `p1'` and `p2'` about 200 m away. Expect
  outbound and inbound edges both to be drawn: the inbound-only edges appear in some run of
  line A. This is the U3-style real divergence and the fallback.
- **Merged lines bundle together.** Lines A and B, each with an outbound shape on the same
  `p0…p3` and an inbound shape on the same near-offset points. On each of the three edges there
  are exactly 2 strands, with slots −0.5 and +0.5, and nothing else.
- **No cross-line snapping.** Line A outbound on `p0…p3`, line B outbound only, on points about
  5 m from A's. B's run keeps B's own coordinates. Snapping happens only within a line.
- **Input is not mutated.** Deep-clone the input before the call, then check that the input
  still deep-equals the clone afterwards.

Update the fixture block (`describe('on the recorded network')`):
- The test `covers every edge of every shape exactly once per line` currently checks
  *original* shape edges, which fails for the 3 snapped inbound edges. Change it to check every
  **outbound** shape edge exactly as today. For inbound shapes, check every edge whose two
  endpoints both lie more than `DIRECTION_MERGE_METERS` from every outbound vertex of that line.
  Import the constant. (On the fixture, every inbound vertex is either identical to an
  outbound vertex or within 63.4 m of one, so in practice every edge is covered through the
  outbound check.)
- Add `draws S2, U2 and U3 as three strands between Câmara and República`. Take the outbound
  edges `40.210350,-8.432479 → 40.211257,-8.429836 → 40.211581,-8.424759 →
  40.209825,-8.419701`. For each edge, expect exactly the lines `{S2, U2, U3}` in `slots`.
  Also expect that no run contains the inbound-only vertices `40.211255,-8.429770`,
  `40.211565,-8.424820` or `40.209594,-8.420384`.
- Add `draws each line at most once on every edge`. This is already enforced by
  `slotsByLineEdge`. Also add the explicit check that the maximum number of lines on any edge is
  still 4 (`S1+S2+U1+U2`) and that no edge carries the same line twice. This replaces nothing; it
  sits beside the existing `maxLines >= 4` check.
- The existing tests `gives the lines on every edge distinct, centred slots` and `is
  deterministic and independent of input order` must still pass unchanged.

### 3. No other code changes

- `src/ui/map/MapView.tsx` is untouched. `routesGeoJson` already renders whatever
  `bundleRoutes` returns.
- Bus markers are still interpolated on the **original**, un-snapped shapes
  (`network.shapes`), so ETAs and positions do not change. An inbound bus on this stretch sits
  at most about 63 m from the drawn strand, at República (asc). Elsewhere it is about 5 m or
  less. Bus pills are wider than a bundle, so this reads fine.
- Stop circles stay at their real coordinates. The `(asc)` stops sit next to the strand rather
  than on it, by about 5 m at Câmara and Mercado and about 63 m at República.
- No change to the data adapter, the `Network`/`Shape` types, CSS, the sheet or the e2e tests.
- **No documentation edits.** The Planner updates `documentation/modules/map-screen.md` § Route
  lines (the "Per line, not per shape" bullet and the U3 note) from the real diff after
  approval. The Developer must not edit `documentation/`.

## Verification

1. `npm run lint`, `npm run typecheck` and `npm test`: all clean and green, including the new
   and updated `routeBundles.test.ts` cases.
2. `npm run build`, then `npm run test:e2e`: the existing Playwright suite still passes, since
   nothing it asserts changes.
3. Manual check with `npm run dev` on a phone-sized viewport. Zoom to the Câmara–Mercado–República
   stretch (around 40.2110, -8.4260). Expect exactly three touching strands (red S2, salmon U2,
   green U3), no doubled bundle, and the white stop circles of both the asc and desc stops beside
   or on it. Elsewhere, the network looks the same as before: the S1/S2/U1/U2 trunk as 4 strands,
   and U3's own branch.
