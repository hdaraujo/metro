# Play 004 — Default view: fewer map labels, and a first frame that shows both directions

## Context

The user asked for two changes to the map screen (`plays/004-default-view/intent.md`):

1. **Remove the "Scheduled" label below the buses.** Today every bus marker has a yellow tag
   hanging under it that says `Scheduled`, or `3:04 Scheduled` for a bus heading to the user's
   stop. With several buses on the map, those tags make it cluttered.
2. **The default zoom should show the nearest stop and the nearest bus arriving from each side.**
   Today the first automatic framing covers the user, the nearest stop and only the *single
   soonest* approaching bus. The user wants to see the next bus in each direction of travel.

The product vision (`documentation/context/vision.md`, "Real time, honestly labelled") now allows
this: scheduled data must be covered by a visible label, and a scheduled bus must always look
different from a live one, *but it need not carry its own label*. The dashed white border on the
bus pill is still what marks an estimated position. The single **Scheduled** badge in the sheet's
"Heading to this stop" header still covers the list.

The user decided the following:
- **Bus tag:** a bus heading to the nearest stop keeps its countdown tag, which now shows only
  the time (`3:04`). Every other bus has no tag at all.
- **No new map-level label.** The Scheduled badge in the sheet is enough. No chip is added to the
  map, the wordmark or the desktop panel. (This means that while location is off or still being
  found, the map's buses have no visible Scheduled label. Only their dashed border and their
  accessible names mark them as estimated. The user accepted this.)
- **"Each side" means each direction of travel.** The default framing includes the soonest
  approaching bus in the `outbound` direction and the soonest in the `inbound` direction. That is
  up to two buses. A stop served in one direction only (for example `República (desc)`) frames
  one bus.

## Repositories touched

- **`metro`**: the only repository. It holds both the code and the specs. No other repository
  is involved.

Note: `tech.md` describes an `apps/web` / `apps/api` / `packages/shared` monorepo, but the code
that actually exists is a single Vite app at the repo root: `src/domain/` (pure logic),
`src/sources/` (source adapters) and `src/ui/` (React). Use those real paths. Do not restructure
anything.

Do **not** edit anything under `documentation/`. The Planner updates
`documentation/modules/map-screen.md` from the real diff after the play is approved.

## Changes

### 1. Pure logic: soonest approaching bus per direction (`src/domain/buses.ts`)

Add, next to `approachingBuses` and exported from the same file:

```ts
/**
 * The soonest approaching bus in each direction of travel, so that the default framing shows the
 * next bus arriving from each side of the stop. At most one bus per direction, soonest first.
 */
export function soonestPerDirection(approaching: readonly BusPosition[]): BusPosition[]
```

- Input: the list returned by `approachingBuses(...)`, which is already sorted soonest first
  (see `compareBuses`).
- Walk the list once. Skip any bus whose `arrivalAtStopSeconds` is `null` (a defensive check).
  Keep the first bus seen for each `direction` value.
- Return them in input order, so the result is soonest first. Length: 0, 1 or 2.
- Do not re-sort, and do not change `busesInService` or `approachingBuses`.

### 2. Default framing uses both directions (`src/ui/App.tsx`)

- Import `soonestPerDirection` next to `approachingBuses`.
- Replace `const soonest = approaching[0] ?? null;` with
  `const framedBuses = useMemo(() => soonestPerDirection(approaching), [approaching]);`.
- In `fit`: build `points` as `[position, nearest.stop.coords, ...framedBuses.map((b) => b.coords)]`.
  Update the comment to say that the soonest approaching bus in each direction is framed, never
  every bus in service. Replace `soonest` with `framedBuses` in the `useCallback` dependency list.
- Leave everything else unchanged: the padding values, the one-time automatic fit
  (`autoFitted`), the 3 s `BUS_WAIT_MS` fallback, the locate button calling the same `fit`,
  `maxZoom: 17` and the 800 ms or reduced-motion animation in `MapView.fitTo`. The user's
  position stays in the frame.

### 3. Remove the "Scheduled" word from the map markers (`src/ui/map/markers.ts`)

Rewrite the tag handling in `updateBusMarker`:
- **Approaching** (`secondsToStop !== null`): the `.marker-bus__tag` element contains exactly one
  child, `<span class="marker-bus__time">` with `formatCountdown(secondsToStop)`, and the tag is
  visible (`tag.hidden = false`). If the time span already exists, update only its `textContent`,
  as the code does today. Otherwise `tag.replaceChildren(newTime)`. Keep building the nodes with
  `createElement` and `textContent`, never with `innerHTML`.
- **Not approaching:** empty the tag (`tag.replaceChildren()`, only if it has children) and hide
  it (`tag.hidden = true`), so that no empty yellow box is drawn.
- Keep the `.marker-bus__tag` element permanently in the marker (it is still created in
  `createBusMarker`), so the approaching and not-approaching variants toggle cleanly.
- **Keep the `aria-label` text unchanged** ("Scheduled position of line U1 bus to …, 3 minutes 4
  seconds from Portagem"). It is the accessible label that marks the position as estimated.
- Update the JSDoc on `createBusMarker`: the dashed pill marks the position as estimated, and a
  bus heading to the selected stop shows its countdown in a tag under the pill. Drop the mention
  of a "Scheduled" tag.

In `src/ui/map/MapView.tsx`, update only the comment above `BUS_MARKER` (line 137) so that it
says a countdown tag hangs below the pill, not a "Scheduled" tag. The anchor and offset values
stay as they are.

In `src/ui/styles/app.css`, add `.marker-bus__tag[hidden] { display: none; }`, because the
tag's `display: flex` would otherwise override the `hidden` attribute. Leave the tag's existing
colours and sizes as they are.

The following stay unchanged: `ScheduledBadge`, `ApproachingBuses` (the single sheet badge and
the "estimated from the timetable" note), the dashed pill border, the dimmed variant and the
z-index of approaching markers.

## Tests

### Unit tests: `src/domain/buses.test.ts` (Vitest)

Add a `describe('soonestPerDirection')` block, building `BusPosition` objects the way the file
already does:
- An empty list returns `[]`.
- Two outbound buses (120 s and 300 s) and one inbound bus (200 s), given in soonest-first
  order, return `[outbound 120 s, inbound 200 s]`.
- Buses in only one direction return just the soonest one.
- A bus with `arrivalAtStopSeconds: null` is ignored.

### End-to-end: `tests/e2e/map.spec.ts` (Playwright)

Update the "shows the nearest stop and every scheduled bus" test:
- Line 82: replace `toContainText('Scheduled')` with an expectation that the approaching
  marker's `.marker-bus__tag` has the text `/^\d+:\d{2}$/` (only the countdown), plus
  `expect(approachingMarker).not.toContainText('Scheduled')`.
- Line 87: replace the `Scheduled` text check on the passed marker with
  `await expect(passedMarker.locator('.marker-bus__tag')).toBeHidden()` and
  `await expect(passedMarker).not.toContainText('Scheduled')`.
- Add: `await expect(page.locator('.marker-bus').getByText('Scheduled')).toHaveCount(0)`.
- Keep `sheet.getByText('Scheduled', { exact: true })` at count 1, because the sheet badge
  remains.

Add a new test inside `located near Portagem`: **"default view frames the stop and the soonest
bus in each direction"**.
- `test.use({ reducedMotion: 'reduce' })`, in a nested `describe` if needed, so `fitBounds` is
  instant.
- At the fixture clock (10:44), U1 to Vale das Flores (outbound, at Portagem at 10:47:04) and U1
  to Coimbra B (inbound, at 10:53:18) are both approaching Portagem.
- After the "Nearest stop" region and both markers are visible, use `expect(...).toPass()` or
  `expect.poll` to assert that the bounding-box centres of the stop marker
  (`Nearest stop: Portagem`) and of both U1 markers (tell them apart by destination:
  `/^Scheduled position of line U1 bus to Vale das Flores, /` and
  `/^Scheduled position of line U1 bus to Coimbra B, /`) lie inside the viewport. On the
  `mobile` project they must also lie above the top of the sheet (the sheet's
  `boundingBox().y`). On `desktop` they must also lie to the right of the panel
  (`x > 24 + 380`).

## Verification

From the repo root:
1. `npm run lint`: clean (ESLint and Prettier).
2. `npm run typecheck` and `npm run build`: pass.
3. `npm test`: all Vitest suites pass, including the new `soonestPerDirection` cases.
4. `npm run test:e2e`: all Playwright tests pass on both the `mobile` and `desktop` projects.
5. Manual check with `npm run dev` on a phone-sized viewport, near a stop served in both
   directions (for example Portagem, using browser geolocation override):
   - No bus on the map shows the word "Scheduled".
   - Buses heading to the stop show only a `M:SS` countdown under a dashed pill. Other buses have
     no tag.
   - The sheet still shows one Scheduled badge in "Heading to this stop".
   - The first frame shows you, the stop, and the next bus in each direction, all clear of the
     sheet. Pressing the locate button reproduces the same frame.
