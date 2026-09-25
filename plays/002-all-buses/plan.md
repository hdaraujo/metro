# Play 002 — All buses, with minutes and seconds away

## Context

Intent: *"Display all buses and the minutes and seconds away below them."*

Today the map screen draws **one** bus: `nearestApproachingBus` (`src/domain/nearestBus.ts`) returns
only the trip due soonest at the user's nearest stop. The time-to-arrival
(`arrivalAtStopSeconds`) is already calculated, but nothing shows it. The vision promises "the
position of every Metrobus bus" and how far away each approaching bus is. This play delivers
both.

Decisions confirmed with the user:
1. **Every bus in service** goes on the map: every trip currently running on any line or
   direction, across the whole network, not only the buses heading to the user's stop.
2. **Countdown under the marker.** A bus approaching the user's nearest stop shows an `M:SS`
   countdown under its marker, and the countdown updates every second. Every other bus (heading
   elsewhere, or already past the stop) keeps only its "Scheduled" tag and is visually
   de-emphasised.
3. **The sheet/panel** replaces the single "Nearest bus · U1" row with a **list of every bus
   approaching the stop**, soonest first. Each row shows the line chip, the destination and an
   `M:SS` countdown, and the list sits under one Scheduled badge.

The Architect agreed that seconds are a detail of this play, so `vision.md` and `tech.md` stay as
they are. Everything is still estimated from the timetable and must always be labelled
**Scheduled**. Nothing may look live.

No new screen is added, so there is no design folder. The existing map screen and its approved
prototype (`documentation/design/001-project-structure-prototype.html`) set the visual language.
Reuse its tokens and components.

## Repositories touched

- **`metro`**: the only repository. All changes are in `src/` and `tests/`. The Developer must
  **not** edit anything under `documentation/`. The Planner updates the module docs after
  approval.

No new dependencies.

---

## 1. Domain (`src/domain/`, pure, no React/DOM)

### 1.1 `types.ts`: change `BusPosition`

Replace `nextStopId` and redefine `arrivalAtStopSeconds`:

```ts
export interface BusPosition {
  tripId: string;
  line: LineId;
  direction: Direction;
  /** The trip's final destination, as in the data (e.g. 'Vale das Flores'). */
  destination: string;
  coords: LatLng;
  source: DataSource;
  /** When the position was estimated or observed, UTC ISO 8601. */
  at: string;
  /** The stop `arrivalAtStopSeconds` counts down to; null when the bus is not heading to the selected stop. */
  towardsStopId: string | null;
  /** Seconds until the bus is scheduled to reach `towardsStopId` (≥ 1); null alongside it. */
  arrivalAtStopSeconds: number | null;
}
```

### 1.2 New `buses.ts`: `busesInService`

Move the service-day logic out of `nearestBus.ts`: the `DAY_SECONDS` and
`PREVIOUS_SERVICE_DAY_UNTIL` constants, the list of service days (today's, plus yesterday's with
+86 400 s offset before 04:00), and `findShape`.

```ts
export interface BusesInput {
  /** The selected (nearest) stop, or null when none is known yet. */
  stop: Stop | null;
  clock: LisbonClock;
  tripsByDayType: ReadonlyMap<DayType, readonly Trip[]>;
  shapesById: ReadonlyMap<string, MeasuredShape>;
  stopsById: ReadonlyMap<string, Stop>;
  now: Date;
}

/** Every bus in service at `now`, estimated from the timetable. Approaching buses first, soonest first. */
export function busesInService(input: BusesInput): BusPosition[];
```

Rules:
- **In service:** for each service day `{dayType, offset}`, a trip is in service when
  `stopTimes[0].seconds <= offset <= stopTimes[last].seconds`. A trip that has not left its
  first stop is **not** shown. This is the same rule as today.
- **Position:** use `positionAt(trip, measured, stopDistancesForTrip(measured, trip, stopsById), offset)`.
  Skip the trip if its shape is missing or the position is null. If `stopDistancesForTrip` throws
  on an unknown stop, skip that trip too (wrap it in try/catch). One bad trip must never blank the
  map.
- **Countdown:** when `stop` is non-null, find the first `stopTimes` entry with
  `stopId === stop.id && seconds > offset`. If there is one, set `towardsStopId = stop.id` and
  `arrivalAtStopSeconds = call.seconds - offset`. Otherwise both are `null`.
- **Fields:** `source: 'scheduled'`, `at: now.toISOString()`, `destination: trip.destination`.
- **De-duplicate** by `tripId`, keeping the first one found (today's service day is checked
  first).
- **Order:** approaching buses first, by `arrivalAtStopSeconds` ascending, with ties broken by
  `tripId`. Then the rest, by `line` and then `tripId`. The order must be deterministic.
- **Performance:** this runs every second over about 450 trips. Build a
  `Map<'line|direction', MeasuredShape>` once per `shapesById` (memoise it with a module-level
  `WeakMap` keyed on the `shapesById` map) instead of scanning the shapes for every trip.

Also export `approachingBuses(buses)`, which returns the buses whose `arrivalAtStopSeconds !== null`
(already in order).

### 1.3 Remove `nearestBus.ts` and `nearestBus.test.ts`

`nearestApproachingBus` is replaced by `busesInService(...)[0]`, filtered to approaching buses.
Move every existing test case from `nearestBus.test.ts` into `buses.test.ts`: soonest pick,
position between stops, passed trips excluded, not-started trips excluded, yesterday after
midnight, cut-off at 04:00, and null/empty cases. Adapt each case to the new function.

### 1.4 New `countdown.ts`

```ts
/** 184 → '3:04'; 45 → '0:45'; 3785 → '63:05'. Minutes are not capped at 59. Negative input clamps to 0. */
export function formatCountdown(seconds: number): string;
/** Screen-reader text: 184 → '3 minutes 4 seconds'; 61 → '1 minute 1 second'; 45 → '45 seconds'; 120 → '2 minutes'. */
export function spokenCountdown(seconds: number): string;
```

---

## 2. UI (`src/ui/`)

### 2.1 `App.tsx`

- Change `useNow(5000)` to **`useNow(1000)`**, so the countdowns tick every second. Positions are
  re-estimated on the same tick, which is cheap and needs no network. `useTimetable` already
  handles a fast `now`, because its effect exits early when nothing needs loading. Leave it as it
  is.
- Replace the `bus` memo with:
  ```ts
  const buses = useMemo(() => busesInService({ stop: nearest?.stop ?? null, clock: lisbonClock(now),
    tripsByDayType, shapesById, stopsById, now }), [nearest, now, tripsByDayType, shapesById, stopsById]);
  const approaching = useMemo(() => approachingBuses(buses), [buses]);
  ```
  Buses are shown even when there is no location, with no stop and so no countdowns.
- **Smart zoom is unchanged in behaviour:** frame the user, the nearest stop and
  `approaching[0]` if there is one. Never frame every bus. The "wait 3 s for trips" logic stays as
  it is.
- Pass `buses`, `stopName={nearest?.stop.name ?? null}` and `lineColors` to `MapView`. Pass
  `approaching` to `NearestStopContent` in place of `bus`.

### 2.2 `map/MapView.tsx`: many bus markers

- Replace the prop `bus: BusPosition | null` with `buses: readonly BusPosition[]` and add
  `stopName: string | null`.
- Replace the single bus `useMarker` with a new **`useBusMarkers(map, buses, lineColors, stopName)`**
  in the same file. It keeps a `Map<tripId, Marker>` in a ref. On each change it:
  - creates a marker for each new trip (`BUS_MARKER` options, `createBusMarker(view)`);
  - calls `setLngLat` and `updateBusMarker(el, view)` for each existing trip;
  - removes the markers whose trips are gone;
  - removes every marker on cleanup or when `map` becomes null.
- The existing `useMarker` stays for the user marker and the stop marker.
- `view` is built per bus with `busColor = lineColors[bus.line] ?? FALLBACK_LINE_COLOR`:
  `{ line, color, destination, secondsToStop: bus.arrivalAtStopSeconds, stopName, dimmed: stopName !== null && bus.arrivalAtStopSeconds === null }`.

### 2.3 `map/markers.ts`: bus marker with countdown

Define and export:

```ts
export interface BusMarkerView {
  line: string; color: string; destination: string;
  secondsToStop: number | null; stopName: string | null; dimmed: boolean;
}
export function createBusMarker(view: BusMarkerView): HTMLElement;
export function updateBusMarker(el: HTMLElement, view: BusMarkerView): void;
```

- The structure stays as it is: a `.marker-bus` column holding a `.marker-bus__pill` (bus icon and
  line, in the line colour, with a dashed white border) above a `.marker-bus__tag`.
- **Tag content**, built with `textContent` and elements, never `innerHTML` with data:
  - Approaching: `<span class="marker-bus__time">3:04</span><span>Scheduled</span>`. The time
    sits on the left, in bold tabular figures, and "Scheduled" stays on the right. The countdown
    is always inside the Scheduled tag, so it can never be read as live.
  - Otherwise: `Scheduled`. This is the same as today.
  - Rebuild the tag only when its content changes. Otherwise just update the time's
    `textContent`.
- **Modifier classes** are toggled on `.marker-bus`: `marker-bus--approaching` when
  `secondsToStop !== null`, and `marker-bus--dimmed` when `view.dimmed`.
- **`aria-label`** (the element keeps `role="img"`):
  - Approaching: `Scheduled position of line U1 bus to Vale das Flores, 3 minutes 4 seconds from Portagem`.
  - Otherwise: `Scheduled position of line U1 bus to Coimbra B`.
  - Use `spokenCountdown`.

### 2.4 `styles/app.css` (plain CSS, existing tokens only)

```css
.marker-bus--dimmed { opacity: 0.55; }
.marker-bus--approaching { z-index: 1; }          /* approaching buses draw above the others */
.marker-bus__tag { display: flex; align-items: baseline; gap: 5px; }
.marker-bus__time { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
```

Add the sheet list styles listed in 2.5, and add a standard `.visually-hidden` utility class
(clip/1px pattern). No such class exists yet.

### 2.5 Sheet: `sheet/ApproachingBuses.tsx` (new) replaces `sheet/NearestBusRow.tsx` (delete)

`NearestStopContent` gets `approaching: readonly BusPosition[]` in place of `bus`. When
`approaching.length > 0` it renders `<div className="rule" />`, then `<ApproachingBuses …/>`, then
the estimate note. When the list is empty, it renders none of them, as today.

```tsx
<section className="approaching" aria-labelledby="approaching-title">
  <div className="approaching__header">
    <h2 id="approaching-title" className="approaching__title">Heading to this stop</h2>
    <ScheduledBadge />
  </div>
  <ul className="bus-list" aria-live="off">
    <li className="bus-list__row">                        {/* one per bus, max 5 */}
      <LineChip line="U1" color={colorOf('U1')} />
      <span className="bus-list__destination">to Vale das Flores</span>
      <span className="bus-list__time" aria-hidden="true">3:04</span>
      <span className="visually-hidden">3 minutes 4 seconds away</span>
    </li>
  </ul>
  {/* when more than 5: */}
  <p className="bus-list__more">+2 more heading here</p>
</section>
```

- Show at most **5** rows, the soonest ones. The page must never scroll, and the phone sheet
  grows with its content. If there are more buses, show `+N more heading here`.
- Rows are keyed by `tripId`.
- `aria-live="off"` on the list stops the per-second countdown from flooding the sheet's
  `aria-live="polite"` region. The list keeps its accessible text for users who browse it.
- **Styles:**
  - `.approaching`: a flex column with a 10px gap.
  - `.approaching__header`: flex, space-between, centred.
  - `.approaching__title`: 16px, weight 600, margin 0, the same as the old `.bus-row__title`.
  - `.bus-list`: list-style none, margin 0, padding 0, a flex column with an 8px gap.
  - `.bus-list__row`: flex, centred, 12px gap, `min-height: 32px`.
  - `.bus-list__destination`: grows, `min-width: 0`, ellipsis, 14px,
    `--color-text-secondary`.
  - `.bus-list__time`: 20px, weight 700, `font-variant-numeric: tabular-nums`,
    `--color-text`.
  - `.bus-list__more`: 12px, `--color-text-muted`, margin 0.
  - Remove the now-unused `.bus-row*` rules.
- **Estimate note** copy: `Positions and times estimated from the timetable at {formatLisbonHM(new Date(approaching[0].at))}. Live data replaces them once a live feed is available.`
  Keep the stale-timetable sentence, unchanged.

---

## 3. Tests

### 3.1 Unit (Vitest, fixtures only)

The fixture sample on Wednesday 2026-09-23 at 10:44 Lisbon (`2026-09-23T09:44:00Z`) has exactly
three trips running:

| Trip | Line and direction | Destination | Portagem | Countdown at 10:44:00 |
| --- | --- | --- | --- | --- |
| `u1-DU-0-852` | U1, outbound | Vale das Flores | 10:47:04 | 184 s |
| `u1-DU-1-823` | U1, inbound | Coimbra B | 10:53:18 | 558 s |
| `s2-DU-0-701` | S2, outbound | Serpins | passed at 10:25:35 | null |

**`buses.test.ts`** must cover:
- All three buses are returned with Portagem as the stop, in the order above, with those
  `arrivalAtStopSeconds` values and `towardsStopId`.
- With `stop: null`, all three are returned and every countdown is null.
- Every bus has `source: 'scheduled'`, `at` equal to `now`, and `destination`.
- Plus all the cases moved from `nearestBus.test.ts` (§1.3).
- A trip with an unknown shape is skipped without throwing.

**`countdown.test.ts`** covers the examples in §1.4, plus 0 and negative input.

### 3.2 End-to-end (`tests/e2e/map.spec.ts`)

- Update "shows the nearest stop and the nearest scheduled bus":
  - Inside the sheet, expect "Heading to this stop", two rows ("to Vale das Flores" first, then
    "to Coimbra B"), one "Scheduled" badge, and the new estimate note ending "at 10:44.".
  - On the map, expect three bus markers (`getByRole('img', { name: /^Scheduled position of line/ })`
    has a count of 3).
  - The U1 marker to Vale das Flores has a countdown and the class `marker-bus--approaching`.
  - The S2 marker (`… line S2 bus to Serpins`) has no countdown, carries the class
    `marker-bus--dimmed` and still contains "Scheduled".
  - Remove the old `'Nearest bus · U1'` assertions, including the one in the locate-button test.
    Give the marker locators unique names, because there are now two U1 buses.
- New test, **"countdown ticks every second"**:
  - `page.clock.install({ time: 10:44 })`, then `goto`, then wait for the sheet.
  - `page.clock.pauseAt(10:44:02)`, then expect the first row's time to be `3:02`.
  - `page.clock.runFor(1000)`, then expect `3:01`. Expect the U1 marker to show the same value.
- The phone and desktop layout tests stay as they are and must still pass. They confirm that the
  taller sheet still ends at the bottom of the viewport and the panel stays 380px wide.
- Update the scenario sentence in `tests/fixtures/README.md` to mention the three running buses.
  Do not change the fixture data.

---

## Critical files

- **New:** `src/domain/buses.ts`, `src/domain/buses.test.ts`, `src/domain/countdown.ts`,
  `src/domain/countdown.test.ts`, `src/ui/sheet/ApproachingBuses.tsx`.
- **Modified:** `src/domain/types.ts`, `src/ui/App.tsx`, `src/ui/map/MapView.tsx`,
  `src/ui/map/markers.ts`, `src/ui/sheet/NearestStopContent.tsx`, `src/ui/styles/app.css`,
  `tests/e2e/map.spec.ts`, `tests/fixtures/README.md`.
- **Deleted:** `src/domain/nearestBus.ts`, `src/domain/nearestBus.test.ts`,
  `src/ui/sheet/NearestBusRow.tsx`.
- **Reused unchanged:** `positionAt` (`interpolation.ts`), `stopDistancesForTrip` and
  `measureShape` (`shape.ts`), `dayTypeFor` (`holidays.ts`), `lisbonClock`, `previousDate` and
  `formatLisbonHM` (`lisbonTime.ts`), `readableTextColor` (`color.ts`), `LineChip`,
  `ScheduledBadge`, and `useMarker` (for the user and stop markers).

## Verification

From the `metro` worktree root:
1. `npm run lint`, `npm run typecheck` and `npm test` must all be clean and green.
2. `npm run build`, then `npm run test:e2e` must pass in both the mobile and desktop projects.
3. Manual check with `npm run dev` on a phone-sized viewport, allowing location, ideally at a
   daytime hour:
   - every running bus appears on the map and moves;
   - the buses approaching the nearest stop show a ticking `M:SS` in their Scheduled tag and are
     listed soonest first in the sheet;
   - the other buses are faded, with "Scheduled" only;
   - the page never scrolls.
4. With location denied, the buses still appear, with no countdowns and no fading.
