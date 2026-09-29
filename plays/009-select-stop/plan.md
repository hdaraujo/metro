# Play 009 — Select a stop on the map

## Context

Today the map screen always shows the stop **nearest the user**: the sheet, the bus countdowns,
the dimming of the bus markers and the smart zoom all follow it. Riders cannot check any other stop,
for example the one near work, or any stop at all while their location is off.

This play lets the user **tap any stop on the map** to look at it instead. **Tapping empty map goes
back to the nearest stop.** Selecting a stop frames the map on that stop and the soonest
approaching bus in each direction. That is the same framing the default view gives when the user
is standing at the stop, so the user's own position is not framed.

The Architect has already updated `documentation/context/vision.md` for this play ("your nearest
Metrobus stop (or any stop you tap)"; "The user can tap any other stop to look at it instead;
tapping away goes back to the nearest one."). `tech.md` needs no change. The Planner checked the UI:
this play adds no new screen, so there is no design folder. It changes the existing map screen
only, and all visuals reuse what is already there.

**Decisions the user made:**
1. **Stops can be selected at any time**, including while the location is off or still being
   found. The sheet then shows the selected stop, with no distance, instead of "Location is off" or
   "Finding your location…". Tapping away returns to whatever the sheet would otherwise show.
2. **Tapping away reframes the map** to the default view: the user, the nearest stop and the
   soonest bus in each direction. If no stop was selected, tapping empty map does nothing.
3. **The locate button, while a stop is selected, clears the selection** and reframes on the
   default view. Its name stays "Centre on my location".

## Repositories touched

- **`metro`** (`C:\Dev\metro`): the only repository. It holds both the code and the specs. All
  the changes are in `src/ui/` and `tests/e2e/`. No domain, source adapter, dependency or config
  changes are needed.

Do **not** edit anything under `documentation/`. The Planner documents what shipped after approval.

## Behaviour specification

### Terms
- **Nearest stop**: as today, `nearestStop(network.stops, position)`. It exists only while located.
- **Selected stop**: a stop the user tapped, held in `App` state as a stop **id**
  (`selectedStopId: string | null`). It is not persisted, just like `sheetCollapsed`.
- **Effective selection** (`selected: Stop | null`):
  `selectedStopId !== null && selectedStopId !== nearest?.stop.id ? stopsById.get(selectedStopId) ?? null : null`.
  - If the selected stop is the nearest stop, it is shown as the nearest stop, with the
    `// NEAREST STOP` eyebrow and the "Nearest stop" labels.
  - If a network refresh drops the stop, `selected` becomes `null` and the app falls back to the
    nearest stop.
- **Shown stop** (`stop`): `selected ?? nearest?.stop ?? null`. Everything that follows the nearest
  stop today follows the **shown stop** instead: `busesInService({ stop })`, `approaching`,
  `framedBuses` (`soonestPerDirection`), `directions`, the direction filter (already keyed by stop
  id, so it resets to `both` when the shown stop changes), the stop marker, the bus-marker
  countdowns and dimming (`stopName`), and the sheet content.

### Tapping the map
- **Hit test.** A click or tap on the map canvas picks the stop whose white circle (the `stops`
  layer) is within **16 px** of the pointer (`STOP_HIT_RADIUS_PX = 16`, a 32 px target, since the
  drawn circle is only about 13 px across). If several stops are within range (for example an
  asc/desc pair), the one closest to the tapped point wins. Use the existing domain
  `nearestStop(candidates, e.lngLat)`, whose tie rule is the lower id.
- DOM markers (user, stop, buses) already have `pointer-events: none`, so taps on them reach the
  canvas. Tapping the red stop marker therefore taps that stop's circle, and tapping a bus that sits
  on a stop selects that stop.
- MapLibre only fires `click` for a tap or click without a drag, so panning never selects or
  deselects anything.
- **Tapped a stop** (`onSelectStop(id)`):
  - If `id` is the nearest stop's id, set `selectedStopId = null` and frame the default view.
  - Otherwise set `selectedStopId = id` and frame the **selected view**. This includes tapping the
    currently selected stop again, which re-frames it after panning.
  - The phone sheet's minimised state is left as it is.
- **Tapped empty map** (`onSelectStop(null)`):
  - If `selected === null`, do nothing: no state change and no camera move.
  - Otherwise set `selectedStopId = null`. If the nearest stop exists, frame the default view. With
    no location, leave the camera where it is.
- **Cursor (desktop).** On `mousemove`, run the same hit test and set
  `map.getCanvas().style.cursor` to `'pointer'` over a stop and to `''` elsewhere.
- **Known limitation, accepted:** double-tapping or double-clicking empty map to zoom also counts
  as a tap-away when a stop is selected. Stops are canvas features, so they cannot be selected with
  the keyboard. Both are out of scope for this play.

### Framing (smart zoom)
Generalise `fit` in `App.tsx`. Padding, `maxZoom` 17, the 800 ms animation and reduced motion stay
exactly as today.
- **Default view** (no selection): `[position, nearest.stop.coords, ...framedBuses]`, as today.
  It requires `position` and `nearest`.
- **Selected view**: `[selected.coords, ...framedBuses]`. The user's position is **not** included,
  even when it is known. It works without a location.
- `framedBuses` is always the soonest approaching bus in each direction **for the shown stop**, and
  it ignores the direction filter, as today.
- **Framing must use the new stop's buses.** A selection changes state, and the buses for the new
  stop only exist after the next render. So framing is *requested*, not called directly from the
  handlers:
  - `const [fitRequest, setFitRequest] = useState(0);` and `const handledFit = useRef(0);`
  - `useEffect(() => { if (fitRequest === handledFit.current) return; handledFit.current = fitRequest; fit(); }, [fitRequest, fit]);`
  - The selection handlers and the locate button call `setFitRequest((n) => n + 1)` together with
    their state change.
- If the trips have not loaded yet when a stop is selected, frame whatever buses are known at that
  moment. That may be the stop alone, which gives zoom 17. Do not reframe when the trips arrive
  later.
- **Automatic first framing:** unchanged ("once, when location and nearest stop are known, waiting
  up to 3 s for trips"), with two additions:
  - It does not run while `selected !== null`.
  - Any framing requested by a selection also sets `autoFitted.current = true`, because the
    user's own framing counts as the first one. A user who selects a stop while still locating
    therefore never has the camera taken away from them when the location arrives.
- Position updates still never move the camera.

### Locate button
- **Located:** `onRecentre` sets `selectedStopId = null` and requests a fit, which gives the
  default view. With no selection this is exactly today's behaviour.
- **Locating / unavailable:** unchanged. "Try to find my location" retries and keeps any selection.

### Sheet content
The rules are checked in order. The first match decides the content.

| Condition | Content | Sheet `label` (its region name) |
| --- | --- | --- |
| **`network` loaded and `selected !== null`** (new, first) | The stop content for `selected`, with the `// SELECTED STOP` eyebrow | `Selected stop` |
| Locating | as today | as today |
| Unavailable | as today | as today |
| Stops failed to load, with no earlier data | as today | as today |
| Stops still loading or no nearest stop | as today | as today |
| Nearest stop | as today, with `// NEAREST STOP` | `Nearest stop` |

- **Distance** on the selected stop: `formatDistance(haversineMeters(position, selected.coords))`,
  shown as "… away" when `position` is known. With no position, the distance `<span>` is **not
  rendered**, in both the expanded and the minimised sheet.
- Everything else in the stop content is the same for both kinds: the name, the lines row, the
  "Heading to this stop" section with its Scheduled badge, the direction button (at a stop served
  both ways), the 4-row cap, the minimised layout and the stale note. If no bus is heading to the
  selected stop, the section is not shown, as today.

### Map markers
- The single red stop marker (`createStopMarker` / `updateStopMarker`) marks the **shown stop**.
  Its visual stays the same. Its `aria-label` is `Nearest stop: {name}` or
  `Selected stop: {name}`. No marker is added for the nearest stop while another stop is selected.
- The bus markers follow the shown stop: its name goes into the aria-labels, approaching buses get
  countdown tags and every other bus is dimmed. This works with no location too, because a stop is
  now shown.

## Implementation

### `src/ui/App.tsx`
1. Add the `selectedStopId` state and derive `selected` and `stop` as specified above. Rename the
   local `stopId` to `stop?.id ?? null` and keep the direction-filter code otherwise untouched.
2. Pass `stop` to `busesInService` in place of `nearest?.stop`.
3. Compute `distanceMeters`: `nearest.distanceMeters` for the nearest stop; for a selected stop,
   `position ? haversineMeters(position, selected.coords) : null` (from `src/domain/geo.ts`).
   Memoise it on `[selected, position]` or compute it inline. It is cheap.
4. Rewrite `fit` to build the point list according to the Framing section. It returns early when
   there is nothing to frame: no stop, or the default view without a position.
5. Add `fitRequest` / `handledFit` and the effect. Keep the auto-fit effect, but gate it on
   `selected === null`. Set `autoFitted.current = true` inside the selection and locate handlers.
6. Add `selectStop = useCallback((id: string | null) => …)` with the behaviour in "Tapping the
   map". It depends on `nearest?.stop.id`, `selected` and `position`, which are primitives or
   stable objects, so the callback stays stable across ticks. Add `recentre` for the locate button
   (it clears the selection and requests a fit) and pass it as `onRecentre`.
7. Sheet content: add the new first branch (`network && selected`) that renders the stop content
   with `kind="selected"` and label `'Selected stop'`. The existing nearest branch passes
   `kind="nearest"`.
8. `MapView` props: pass `stop={stop}`,
   `stopKind={selected ? 'selected' : 'nearest'}`, `stopName={stop?.name ?? null}` and
   `onSelectStop={selectStop}`.

### `src/ui/sheet/NearestStopContent.tsx`
- Add the prop `kind: 'nearest' | 'selected'`. The eyebrow is `// NEAREST STOP` or
  `// SELECTED STOP`.
- Change `distanceMeters` to `number | null`. When it is `null`, do not render the
  `.stop-distance` span.
- Keep the file and component name, since other docs reference it. Update the doc comments.

### `src/ui/map/markers.ts`
- Add a `kind` parameter to `createStopMarker(name, kind)` and `updateStopMarker(el, name, kind)`,
  of type `'nearest' | 'selected'` (export a `StopKind` type from here or from `MapView`). The
  aria-label is `${kind === 'selected' ? 'Selected stop' : 'Nearest stop'}: ${name}`. Update the doc
  comment: "the stop shown in the sheet".

### `src/ui/map/MapView.tsx`
- Props: rename `nearestStop` to `stop: Stop | null`, and add `stopKind: 'nearest' | 'selected'` and
  `onSelectStop: (stopId: string | null) => void`.
- The stop marker: memoise `const shownStop = useMemo(() => (stop ? { stop, kind: stopKind } : null), [stop, stopKind]);`
  and feed it to `useMarker`, with `coords = stop?.coords ?? null`. This way, a change of kind with
  the same stop (the selected stop becoming the nearest) still updates the label.
- Add a helper `stopIdAt(map, network, point): string | null`:
  - If `!map.getLayer('stops')`, return `null`. This avoids MapLibre's "layer does not exist"
    console error before the network loads.
  - `map.queryRenderedFeatures([[x - R, y - R], [x + R, y + R]], { layers: ['stops'] })` with
    `R = STOP_HIT_RADIUS_PX`.
  - Map the feature `properties.id` values to `Stop`s from `network.stops`, then return
    `nearestStop(candidates, map.unproject(point))?.stop.id ?? null`. Convert MapLibre's `LngLat`
    to the domain `{ lat, lng }`.
  - Keep a strict pixel radius. The bbox is a square, so also drop candidates whose projected
    pixel distance (`map.project`) is more than `R`.
- Add an effect on `[map, network, onSelectStop]` that registers
  `map.on('click', e => onSelectStop(stopIdAt(map, network, e.point)))` and
  `map.on('mousemove', e => { map.getCanvas().style.cursor = stopIdAt(...) ? 'pointer' : ''; })`,
  and removes both with `map.off` in its cleanup. When `network` is undefined, a click calls
  `onSelectStop(null)`, which is harmless.

### `src/ui/styles/app.css`
- No change is required. Do not change the stop circle's size or colour.

### Unit tests
- There is no new domain logic: the hit test reuses `nearestStop`, which is already tested. Add no
  new unit tests unless you extract a pure helper. If you do extract one (for example the
  point-list builder for `fit`), put it in `src/domain/` with a `*.test.ts` next to it.

### End-to-end tests (`tests/e2e/map.spec.ts`)
Keep every existing test passing unchanged. Their region names stay `Nearest stop` and the marker
stays `Nearest stop: Portagem`.

Add a helper that works out where a stop is on screen, since stops are canvas features:
- `worldPx(coords, worldSize)`: the Web Mercator projection that MapLibre uses (tile size 512).
  `x = (lng + 180) / 360 * W` and `y = (1 - ln(tan(φ) + sec(φ)) / π) / 2 * W`, where
  `W = 512 * 2^zoom`.
- `projectorFromAnchors(a, b)`: given two `{ coords, pixel }` anchors (the DOM markers' bounding-box
  centres), derive the scale from their pixel distance divided by their normalised Mercator
  distance, then project any coordinate linearly from anchor `a`. Rotation is disabled, so there
  is no rotation term.
- `initialProjector(viewport)`: the map's initial camera, with centre `[-8.4196, 40.2056]`, zoom 13,
  no padding, and the viewport centre as the pixel of the centre.
- The stop coordinates come from `tests/fixtures/stops.json`, read by name. Useful ones:
  Parque (`234`, 40.203753 / -8.425116) is at least 630 m from any other stop, which makes it a
  reliable click target. Portagem is `233`.
- `emptyMapPoint(project, avoid)`: scan a 20 px grid over the visible map area (below 80 px, above
  the phone sheet's top, and to the right of the desktop panel) and return the first point at least
  48 px from every projected fixture stop.
- Use `page.mouse.click(x, y)` in both projects.

New tests:
1. **`describe('selecting a stop')`**, with geolocation `SOUTH_OF_PORTAGEM = { latitude: 40.2057, longitude: -8.4307 }`
   (about 200 m south of Portagem, which is still its nearest stop; the next nearest is 520 m
   away), permission granted, and `reducedMotion: 'reduce'`.
   - **Selects a stop and frames it.** After the default framing, build the projector from the
     `Your location` marker and the `Nearest stop: Portagem` marker, then click Parque. Expect:
     - the region is `Selected stop`, with `// SELECTED STOP`, an h1 `Parque`, and `/\d+(\.\d)? (m|km) away/`;
     - two rows, `to Vale das Flores` then `to Coimbra B` (at 10:44, u1-DU-0-852 reaches Parque at
       10:48:28 and u1-DU-1-823 at 10:51:43);
     - the `Selected stop: Parque` marker, and no `Nearest stop: …` marker;
     - the approaching U1 marker labels end with `from Parque`, and the S2 marker is dimmed;
     - within `toPass()`: the Parque marker and both U1 markers are inside the visible map area,
       using the same bounds as the existing "default view" test.
   - **Tapping away returns to the nearest stop.** Select Parque as above, then click
     `emptyMapPoint`, using a projector rebuilt from the `Selected stop: Parque` marker and the
     `Your location` marker. Expect the region `Nearest stop`, the h1 `Portagem`, the
     `Nearest stop: Portagem` marker, and (in `toPass`) the user, Portagem and both U1 markers
     inside the visible area.
   - **Tapping empty map with nothing selected changes nothing.** Click an empty point. The region
     stays `Nearest stop` with the h1 `Portagem`.
   - **The locate button clears the selection.** Select Parque, then press
     `Centre on my location`. Expect the region `Nearest stop` with the h1 `Portagem`.
   - **Tapping the nearest stop keeps "Nearest stop".** Select Parque, then click Portagem's
     projected point. Expect the region `Nearest stop` and the `// NEAREST STOP` eyebrow.
2. **Inside the existing `describe('location denied')`**, add **"selects a stop without a
   location"**. Use `initialProjector` and click Parque. Expect the region `Selected stop`, the h1
   `Parque`, no `away` text, two rows, and the `Selected stop: Parque` marker. Then click an empty
   point and expect the region `Location unavailable` again.
3. **Desktop only:** hovering over Parque's point makes `.maplibregl-canvas` have
   `cursor: pointer`, and hovering over an empty point makes it `''`/`auto`.

If a click lands off-target because the projection is imprecise, fix the helper. Do not widen
`STOP_HIT_RADIUS_PX` to make a test pass.

## Files to change (all in `metro`)
- `src/ui/App.tsx`: the selection state, the shown stop, framing requests, the handlers and the
  sheet branch.
- `src/ui/map/MapView.tsx`: the props, the stop marker kind, the hit test, and the click and hover
  handlers.
- `src/ui/map/markers.ts`: the stop-marker kind in its aria-label.
- `src/ui/sheet/NearestStopContent.tsx`: the `kind` eyebrow and the optional distance.
- `tests/e2e/map.spec.ts`: the projection helpers and the new tests.

Reuse these: `nearestStop` (`src/domain/nearestStop.ts`), `haversineMeters` and `formatDistance`
(`src/domain/geo.ts`), `soonestPerDirection` and `approachingBuses` (`src/domain/buses.ts`),
`directionsAtStop` (`src/domain/directions.ts`), and `useMarker` and `fitTo` (`MapView.tsx`).

## Verification
1. `npm run lint`, `npm run typecheck` and `npm test` all pass.
2. `npm run build`, then `npm run test:e2e`: every existing test and every new test passes in both
   the `mobile` and `desktop` projects.
3. Check by hand with `npm run dev`, first on a phone-sized viewport and then on desktop:
   - Tap a far stop: the sheet reads `// SELECTED STOP` with its distance, and the map animates to
     the stop and its soonest bus each way.
   - Pan and tap empty map: the app goes back to the nearest stop and the default framing.
   - Panning never selects anything.
   - With location blocked, tap a stop: its buses and countdowns show, with no distance. Tapping
     away brings back "Location is off".
   - Select a stop at Portagem (served both ways), cycle the direction, then select another stop:
     the direction resets to "Both directions".
   - The locate button returns to the nearest stop.
