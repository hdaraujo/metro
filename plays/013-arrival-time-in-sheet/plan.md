# Play 013 — Arrival time in the sheet

## Context

The sheet's "Heading to this stop" list shows up to 4 upcoming buses, each with only an `M:SS`
countdown. Riders also want the clock time each bus is due. Intent (verbatim): *"In the 4 sheet
next arrivals, also show the arrival time, remaining time is still the most relevant info. Show
arrival time first in gray hh:mm 24h time. Above the times show icons, clock for arrival time and
hourglass for remaining time."*

Outcome: every bus row shows `HH:MM` (Europe/Lisbon, 24 h, gray, smaller) **before** the
countdown, which keeps its current large, bold look as the dominant figure. A small header row
above the expanded list shows a clock icon above the arrival-time column and an hourglass icon
above the countdown column. Decision taken with the user: the minimised phone sheet's single row
**also shows the gray arrival time, with no icons** (the icon header exists only above the
expanded list).

No new screen; no design folder exists for this play. This is an extension of the existing sheet.

## Repositories touched

- **`metro`** — the only repository. All changes are in `src/` and `tests/e2e/` on the play's
  branch. No other repository is involved.

## Concepts

`documentation/ontologies/` contains no ontology yet (only `.gitkeep`), so there are no prefixed
names to cite. The play depends on these existing domain concepts, by their code names:
- `StopArrival` (an upcoming scheduled call of a trip at a stop — `src/domain/types.ts`), which this play extends with its arrival instant.
- `Stop`, `Trip`, `LineId`, `DataSource` (`scheduled`) — used unchanged.

## Ontology changes

None proposed: there is no project ontology file to extend, and creating one is out of scope.
For the record, the one new domain property is `StopArrival.arrivalAt` — "the instant the bus is
scheduled to call at the stop, UTC ISO 8601" (domain `StopArrival`, range timestamp).

## Implementation

### 1. Domain — `src/domain/types.ts`

Add to `interface StopArrival`, right after `arrivalAtStopSeconds`:

```ts
/** When the bus is scheduled to call at the stop, UTC ISO 8601. `formatLisbonHM` shows it. */
arrivalAt: string;
```

### 2. Domain — `src/domain/buses.ts`, `upcomingArrivals`

Compute `arrivalAt` from the same number the countdown uses, so the two can never disagree:

- Before the loops: `const nowSecondMs = Math.floor(now.getTime() / 1000) * 1000;`
  (`clock.seconds` is whole seconds, so the countdown is measured from `now` floored to the
  second; flooring here keeps a `now` with milliseconds from shifting the instant.)
- In the pushed object, after `arrivalAtStopSeconds`:
  `arrivalAt: new Date(nowSecondMs + (call.seconds - offset) * 1000).toISOString(),`
  (reuse one `const seconds = call.seconds - offset;` for both fields).

Do not touch `busesInService` / `BusPosition` — map markers are out of scope.

### 3. Icons — `src/ui/icons.tsx`

Add two icons using the existing `Icon` wrapper (24×24, stroked `currentColor`, `aria-hidden`),
Lucide paths, same style as the rest of the file:

```tsx
export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </Icon>
  );
}

export function HourglassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </Icon>
  );
}
```

### 4. Row — `src/ui/sheet/ApproachingBuses.tsx`, `BusRow`

New row order: line chip · "to {destination}" · (optional Scheduled badge) · **arrival time** ·
countdown · hidden spoken text.

```tsx
<span className="bus-list__arrival" aria-hidden="true">
  {formatLisbonHM(new Date(bus.arrivalAt))}
</span>
<span className="bus-list__time" aria-hidden="true">{formatCountdown(seconds)}</span>
<span className="visually-hidden">
  arrives at {arrival}, {spokenCountdown(seconds)} away
</span>
```

- Import `formatLisbonHM` from `../../domain/lisbonTime` (existing; returns `HH:MM`, 24 h,
  zero-padded, Europe/Lisbon). Compute `const arrival = formatLisbonHM(new Date(bus.arrivalAt));`
  once and use it in both spans.
- `BusRow` is shared, so the minimised sheet (`NearestStopContent.tsx:83`) gets the arrival time
  automatically — no change needed there. It gets **no** icon header.
- Update the `BusRow` doc comment: "its line, destination, arrival time and countdown".

### 5. Icon header — `src/ui/sheet/ApproachingBuses.tsx`, `ApproachingBuses`

Only when `shown.length > 0`, render directly above the `<ul className="bus-list">` (after the
direction button), **outside** the `<ul>` so it is never a `listitem` (e2e tests count rows):

```tsx
<div className="bus-list__legend" aria-hidden="true">
  <span className="bus-list__legend-cell bus-list__legend-cell--arrival"><ClockIcon size={16} /></span>
  <span className="bus-list__legend-cell bus-list__legend-cell--time"><HourglassIcon size={16} /></span>
</div>
```

Wrap the legend and the `<ul>` in a fragment inside the existing ternary. When the direction
filter leaves no bus, neither the legend nor the list renders (the "No buses in this direction
right now." text stays as today). The legend is decorative (`aria-hidden`) because each row's
hidden text already says "arrives at … , … away".

### 6. Styles — `src/ui/styles/app.css` (next to the `.bus-list*` rules, ~line 519)

Fixed column widths so the icons sit exactly over their columns in every row. The width custom
properties are defined on both `.bus-list` and `.bus-list__legend`, so the expanded list, its
legend and the minimised sheet's one-row list all share them:

```css
.bus-list,
.bus-list__legend {
  --bus-col-arrival: 44px;   /* "10:47" at 14px tabular */
  --bus-col-time: 64px;      /* up to "90:00" at 20px bold tabular (horizon is 90 min) */
}

.bus-list__arrival {
  flex-shrink: 0;
  width: var(--bus-col-arrival);
  text-align: right;
  font-size: 14px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-muted);
}

.bus-list__time {            /* existing rule: add these three lines, keep the rest */
  flex-shrink: 0;
  width: var(--bus-col-time);
  text-align: right;
}

.bus-list__legend {
  display: flex;
  justify-content: flex-end;
  gap: 12px;                 /* same as .bus-list__row gap */
  margin-bottom: 4px;
  color: var(--color-text-muted);
}

.bus-list__legend-cell {
  display: flex;
  justify-content: flex-end; /* icons right-aligned, flush with the right-aligned figures */
}
.bus-list__legend-cell--arrival { width: var(--bus-col-arrival); }
.bus-list__legend-cell--time { width: var(--bus-col-time); }
```

Keep `.bus-list__destination` as is (`flex-grow: 1; min-width: 0;` + ellipsis) — it absorbs the
lost width. Check at 360 px wide that rows (and the minimised row with its Scheduled badge) don't
overflow; the destination ellipsis is the expected give. Countdown styling (20px/700/`--color-text`)
is unchanged — it stays the most prominent figure.

### Out of scope

Map marker tags, `BusPosition`, smart zoom, the direction filter logic, docs under
`documentation/` (the Planner documents what shipped after approval).

## Tests

**Unit — `src/domain/buses.test.ts` (`describe('upcomingArrivals')`)**
- In "lists trips that have not left their first stop yet" (now `2026-09-23T09:40:30Z`), assert the
  first arrival's `arrivalAt` is `'2026-09-23T09:47:04.000Z'` (u1-DU-0-852 at 10:47:04 Lisbon) and
  the second's is `'2026-09-23T09:53:18.000Z'`.
- New case: with `now = 2026-09-23T09:40:30.900Z` the same first arrival still has `arrivalAt`
  `'2026-09-23T09:47:04.000Z'` (milliseconds don't shift it).
- New case: for every arrival, `Date.parse(arrivalAt) === floor(now to second) + arrivalAtStopSeconds * 1000`.
- If a before-04:00 (previous service day) case exists in this file, assert `arrivalAt` there
  lands on the correct UTC instant (after midnight), not 24 h off.

**E2E — `tests/e2e/map.spec.ts`**
- Extend "countdown ticks every second": after `pauseAt(2026-09-23T09:45:00Z)`, the first row's
  `.bus-list__arrival` has text `10:47` alongside `2:04`; after `runFor(1000)` it is still `10:47`
  while the countdown is `2:03`.
- New test "sheet shows arrival times under a clock and hourglass header": in the Nearest stop
  region, `.bus-list__legend` exists exactly once and contains 2 `svg`; rows still `toHaveCount(4)`;
  every row's `.bus-list__arrival` matches `/^\d{2}:\d{2}$/`; the legend's bounding box is above
  the first row; the legend's hourglass cell and the first row's `.bus-list__time` share the same
  right edge (±1 px), and likewise the clock cell and `.bus-list__arrival`.
- Extend "phone: the minimised sheet follows the direction filter": the single minimised row
  contains a `.bus-list__arrival` matching `/^\d{2}:\d{2}$/`, and the sheet has no
  `.bus-list__legend`.
- Existing assertions (4 listitems, one "Scheduled" in the expanded sheet, `toContainText('to …')`)
  must keep passing unchanged.

## Verification

1. `npm run lint`, `npm run typecheck`, `npm test` — all clean/green.
2. `npm run build`, then `npm run test:e2e` (mobile and desktop projects) — green.
3. `npm run dev`, open on a phone-width viewport (360×780) and on desktop: the list shows a
   clock and hourglass above the two time columns; each row reads e.g. `U1 to Vale das Flores 10:47 2:04`
   with `10:47` gray and smaller; the countdown ticks every second while the arrival time stays
   fixed; minimise the phone sheet — the one row shows the gray time and no icons; cycle the
   direction filter to an empty direction — no legend, just the empty message.
