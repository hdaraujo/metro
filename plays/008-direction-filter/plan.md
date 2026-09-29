# Play 008 — Direction filter

## Context

The sheet's "Heading to this stop" list mixes buses from both directions. At a stop served both
ways (e.g. Portagem) a rider usually only cares about one of them. This play adds a button to the
sheet that cycles the list through **both directions → one direction → the other → both**. The
default, and the behaviour whenever the button is not shown, is **both directions** — exactly
today's behaviour.

Decisions agreed with the user:
- **Scope: the sheet list only.** The map (every marker, its countdown tag, dimming) and smart
  zoom (`soonestPerDirection` over *all* approaching buses) do not change.
- **Labels by destination:** "Both directions" → "To Vale das Flores, Serpins, Corvo" →
  "To Coimbra B" — the destinations of that direction's trips at this stop.
- **Minimised phone sheet:** the filter applies to its single row, but the button is not shown
  there.
- No new screen, so there is no design folder; follow the existing sheet styling.

## Repositories

This play touches **one repository: `metro`** (`C:\Dev\metro`) — it holds both the code and the
specs. No other repository is involved. The Developer must **not** edit anything under
`documentation/` (the Planner documents what shipped after approval).

## Behaviour (the specification)

1. **Directions at the stop.** A stop "is served in" a direction when at least one loaded trip
   (any day type currently in `tripsByDayType`) of that direction calls at the stop **at a
   position other than its first stop** (a bus can never be "approaching" its own first stop,
   because only trips that have left their first stop are in service).
   For each served direction, its **destinations** are the distinct `trip.destination` values of
   those trips, ordered by number of such trips (most first), ties alphabetical
   (`localeCompare`). Directions are returned `outbound` first, then `inbound`.
2. **When the button shows.** Only in the expanded nearest-stop content, only when the "Heading to
   this stop" section is shown (unchanged rule: at least one approaching bus in *either*
   direction), and only when the stop is served in **both** directions. Otherwise there is no
   button and the effective filter is `both`.
3. **Cycling.** Each press: `both` → `outbound` → `inbound` → `both`. Not persisted (like
   `sheetCollapsed`). It **resets to `both` whenever the nearest stop changes** (by stop id).
4. **Label.** `both` → `Both directions`. A single direction → `To ` + its destinations joined
   with `, ` (e.g. `To Vale das Flores, Serpins, Corvo`). Long labels are cut with an ellipsis by
   CSS; the full label is the button's `title`.
5. **Filtered list.** The rows are the approaching buses whose `direction` matches the filter
   (all of them for `both`), still soonest first and still capped at `MAX_ROWS` (4) — the cap
   applies after filtering. If the filter leaves no bus, the list is replaced by one line:
   **"No buses in this direction right now."** The section header (title + Scheduled badge) and
   the button stay, so the user can always cycle back.
6. **Minimised phone sheet.** The single `BusRow` is the soonest bus of the **filtered** list
   (with its own Scheduled badge, as today). If the filter leaves no bus while some bus is
   approaching in the other direction, show the same "No buses in this direction right now."
   line instead of the row. No button when minimised.
7. **Unchanged:** map markers (all buses, approaching tags and dimming based on the unfiltered
   data), smart zoom / locate reframe, the stale note, the sheet's aria-live and aria-label.

## Implementation

### 1. Domain — new `src/domain/directions.ts` (pure, no DOM/React)

```ts
import type { BusPosition, Direction, Trip } from './types';

/** Which buses the sheet lists: every approaching bus, or only one direction's. */
export type DirectionFilter = 'both' | Direction;

export interface DirectionAtStop {
  direction: Direction;
  /** Distinct trip destinations, most frequent first, ties alphabetical. */
  destinations: string[];
}

/** The directions trips arrive at `stopId` from (a call at a trip's first stop does not count), outbound first. */
export function directionsAtStop(stopId: string, trips: Iterable<Trip>): DirectionAtStop[];

/** `both` → `outbound` → `inbound` → `both`. */
export function nextDirectionFilter(filter: DirectionFilter): DirectionFilter;

/** Keeps the buses of the filtered direction, in their original order. */
export function busesInDirection(buses: readonly BusPosition[], filter: DirectionFilter): BusPosition[];

/**
 * "Both directions", or "To A, B" from that direction's destinations. If the direction is not in
 * `directions` (or has no destinations), fall back to "Outbound" / "Inbound" — never "To ".
 */
export function directionLabel(filter: DirectionFilter, directions: readonly DirectionAtStop[]): string;
```

Follow the style of `src/domain/buses.ts` (doc comments, `readonly` params). `stopTimes[i].stopId`
with `i >= 1` identifies a call.

### 2. Domain tests — new `src/domain/directions.test.ts` (Vitest)

Build small `Trip` literals inline (as `buses.test.ts` does). Cover:
- both directions served → two entries, outbound first even if inbound trips come first in input;
- destination ordering by frequency, ties alphabetical, duplicates removed;
- a trip whose only call at the stop is its first stop is ignored (so a terminus served only as
  the start of one direction reports only the other direction);
- one-direction stop → one entry; no trips / stop not called → `[]`;
- `nextDirectionFilter` full cycle; `busesInDirection` for all three filters keeps order;
- `directionLabel`: `both`, single and multiple destinations.

### 3. Icon — `src/ui/icons.tsx`

Add `SwapIcon` in the same `Icon` wrapper style (24×24, stroked): two opposing arrows, e.g.
paths `M7 4 3 8l4 4`, `M3 8h14`, `M17 12l4 4-4 4`, `M21 16H7`.

### 4. Button — new `src/ui/sheet/DirectionButton.tsx`

```tsx
<button type="button" className="direction-button" onClick={onCycle} title={label}>
  <SwapIcon size={16} />
  <span className="visually-hidden">Direction: </span>
  <span className="direction-button__label">{label}</span>
</button>
```
Accessible name is therefore `Direction: <label>` (e.g. `Direction: Both directions`).
Props: `{ label: string; onCycle: () => void }`.

### 5. `src/ui/sheet/ApproachingBuses.tsx`

- New optional prop `direction?: { label: string; onCycle: () => void }`. When present, render
  `<DirectionButton>` on its own row directly under `.approaching__header`, above the list.
- `buses` is now the already-filtered list. If it is empty, render
  `<p className="approaching__empty">No buses in this direction right now.</p>` instead of the
  `<ul>`. `MAX_ROWS` slicing stays as is (it now applies to the filtered list).
- Export the empty-message text as a constant (e.g. `NO_BUSES_IN_DIRECTION`) so the minimised
  view reuses it.

### 6. `src/ui/sheet/NearestStopContent.tsx`

New props:
```ts
/** Directions this stop is served in (see directionsAtStop). */
directions: readonly DirectionAtStop[];
/** The effective filter; always 'both' when the stop is not served in both directions. */
directionFilter: DirectionFilter;
onCycleDirection: () => void;
```
- `approaching` stays the **unfiltered** list; compute
  `const shown = busesInDirection(approaching, directionFilter)`.
- Section visibility stays `approaching[0]` (unfiltered). Pass `buses={shown}` and, when
  `directions.length === 2`, `direction={{ label: directionLabel(directionFilter, directions), onCycle: onCycleDirection }}`.
- Collapsed: soonest = `shown[0]`; if present render the `BusRow` with `badge` as today; else if
  `approaching[0]` exists render the `approaching__empty` line (outside any `<ul>`); else nothing.

### 7. `src/ui/App.tsx`

- `const stopId = nearest?.stop.id ?? null;`
- `const directions = useMemo(() => stopId ? directionsAtStop(stopId, [...tripsByDayType.values()].flat()) : [], [stopId, tripsByDayType]);`
  (keyed on the id, since `nearest` is a new object on every position update).
- State tied to the stop, so it resets with no effect:
  `const [directionChoice, setDirectionChoice] = useState<{ stopId: string; filter: DirectionFilter } | null>(null);`
  `const directionFilter: DirectionFilter = directions.length === 2 && directionChoice?.stopId === stopId ? directionChoice.filter : 'both';`
  `const cycleDirection = useCallback(() => { if (stopId) setDirectionChoice({ stopId, filter: nextDirectionFilter(directionFilter) }); }, [stopId, directionFilter]);`
- Pass `directions`, `directionFilter`, `onCycleDirection={cycleDirection}` to
  `NearestStopContent`. Do **not** change `approaching`, `framedBuses`, `fit` or the `MapView` props.

### 8. CSS — `src/ui/styles/app.css` (next to the `.approaching` rules; tokens only)

- `.direction-button`: `align-self: flex-start; max-width: 100%; display: inline-flex;
  align-items: center; gap: 8px; height: 36px; padding: 0 12px; border: 1px solid
  var(--color-hairline); border-radius: var(--radius-control); background: var(--color-surface);
  color: var(--color-text-secondary); font-size: 14px; font-weight: 600; cursor: pointer;`
  plus `:hover { border-color: var(--color-grab-handle); color: var(--color-text); }` and
  `:focus-visible { outline: 2px solid var(--color-blue); outline-offset: 2px; }`.
- `.direction-button svg { flex-shrink: 0; }`
- `.direction-button__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }`
- `.approaching__empty { margin: 0; font-size: 14px; color: var(--color-text-muted); }`

Taps on the button are already safe with the sheet's swipe handling (under 40 px of movement is a
click; no pointer capture), as with the **Try again** buttons — no change to `Sheet.tsx`.

### 9. End-to-end — `tests/e2e/map.spec.ts`, inside `located near Portagem`

Fixture facts at 10:44 (see the file's header comment): approaching Portagem are U1 to Vale das
Flores (outbound, 3:04) and U1 to Coimbra B (inbound, 9:18); S2 to Serpins has passed. Add:
- **"cycles the direction filter"** (both projects): button `Direction: Both directions`, 2 rows.
  Click → name matches `/^Direction: To Vale das Flores/` (full label from the sample fixture is
  expected to be `To Vale das Flores, Serpins, Corvo`; assert the prefix), 1 row containing
  "to Vale das Flores". Click → `Direction: To Coimbra B`, 1 row "to Coimbra B". Click → back to
  `Both directions`, 2 rows. While filtered, still 3 `Scheduled position of line` markers, and the
  U1-to-Coimbra-B marker still shows its countdown tag.
- **"phone: the minimised sheet follows the direction filter"** (mobile only, skip on desktop like
  the existing phone tests): cycle to `To Coimbra B`, press **Minimise** → 1 row "to Coimbra B"
  with a Scheduled badge, and no `Direction:` button in the sheet. Expand → button still reads
  `Direction: To Coimbra B`.
- Existing tests must keep passing unchanged (default is `both`).

## Verification

1. `npm run lint`, `npm run typecheck`, `npm test` (new `directions.test.ts` passes, all others
   unchanged), `npm run build`.
2. `npm run test:e2e` — both `mobile` and `desktop` projects green, including the two new tests.
3. Manual check with `npm run dev`: at a two-way stop the button appears under "Heading to this
   stop" and cycles the list; the map and locate reframe do not change; minimising shows the
   filtered soonest bus; a long label ellipsises without widening the sheet at 390 px.
