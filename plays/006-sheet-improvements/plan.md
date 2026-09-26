# Play 006 — Sheet improvements: implementation plan

## Context

On phones the bottom sheet takes too much of the map. The user asked for four changes (`plays/006-sheet-improvements/intent.md`):

1. Show only **4** buses in the "Heading to this stop" list.
2. Let the user **minimise** the sheet in the phone layout.
3. **Remove the label at the bottom** of the sheet: the "Estimated at HH:MM from the published timetable. Live data replaces these estimates…" note.
4. Fix a bug: **buses draw in front of the sheet**.

This play changes an existing screen and adds no new one, so there is no design folder. The decisions below come from the user's answers in the planning session.

**Repositories touched: `metro` only**, the single repository. All code is in `src/ui/` and `tests/e2e/`. No dependency, build, source-adapter or domain changes. The Developer must not edit anything under `documentation/`. The Planner documents what shipped after approval.

## Decisions (made by the user)

| Topic | Decision |
| --- | --- |
| Rows in the list | At most 4, on phone and desktop (it is one component). **The "+N more heading here" line is removed.** The map still shows every bus. |
| Minimised content (nearest-stop state) | Grab handle, the stop name with its distance, and one row for the **soonest** approaching bus with its countdown. |
| Minimise / restore | **Tap** the handle, which becomes a real button, **or swipe** on the sheet: down minimises, up restores. |
| Bottom note | Removed. **Only when the timetable is stale** (more than 24 h old, the existing `STALE_AFTER_MS` rule) a short line shows: `Timetable data from {date} may be out of date.` |

Defaults the plan sets (not asked):
- The sheet starts **expanded** on every load. The state is not persisted.
- Minimising is **phone only**. The desktop panel never collapses and shows no toggle.
- The minimised state applies to **every** sheet state. Non-nearest states keep only their title row (see step 4).
- Minimising does **not** reframe the map, because the user's panning is respected. The locate button's reframe already measures the sheet's current height (`sheetRef.current.offsetHeight` in `App.tsx`), so its padding follows the smaller sheet automatically.

## Implementation

### 1. Z-order bug (`src/ui/styles/app.css`)

**Cause:** `.map` is `position: absolute` with no `z-index`, so it creates no stacking context. `.marker-bus--approaching { z-index: 1 }` therefore competes in the root stacking context and paints above `.bottom-stack`, `.wordmark` and `.sheet--panel`, which all have `z-index: auto`.

**Fix:** add `z-index: 0;` to the `.map` rule. That turns the map into its own stacking context, so every marker z-index stays inside it. The chrome comes later in the DOM, so it then paints above the whole map. Leave `.marker-bus--approaching { z-index: 1 }` as it is: it must still lift approaching buses above the other buses.

### 2. Four rows, no "+N more" (`src/ui/sheet/ApproachingBuses.tsx`, `app.css`)

- `MAX_ROWS = 4`. Update its comment to say it keeps the sheet compact.
- Delete the `more` variable, the `bus-list__more` paragraph and the `.bus-list__more` CSS rule.
- **Extract the row** into an exported `BusRow` component in the same file, so the minimised sheet can reuse it. It takes `{ bus: BusPosition; color: string; badge?: boolean }` and renders the existing `<li className="bus-list__row">` markup: the `LineChip`, `to {destination}`, the `aria-hidden` countdown and the visually hidden spoken countdown. When `badge` is true it renders `<ScheduledBadge />` between the destination and the time. `ApproachingBuses` maps `shown` to `<BusRow key={bus.tripId} …/>` without a badge, because its header already has one.

### 3. Remove the estimate note, keep a stale warning (`src/ui/sheet/NearestStopContent.tsx`, `app.css`)

- Delete the `<p className="estimate-note">…</p>` block and the now-unused `formatLisbonHM` import. Keep `formatLisbonDate`.
- After the approaching section (or after the lines row when no bus is approaching), render this only when `stale`:
  `<p className="stale-note">Timetable data from {formatLisbonDate(fetched)} may be out of date.</p>`
- Rename the CSS rule `.estimate-note` to `.stale-note` with the same styles (12px, line-height 1.4, `--color-text-muted`).
- The stale line shows in both the expanded and the minimised sheet (tech.md: stale data is always flagged).

### 4. Minimisable phone sheet

**State (`src/ui/App.tsx`)**
- `const [sheetCollapsed, setSheetCollapsed] = useState(false);`
- `const collapsed = !desktop && sheetCollapsed;`
- Pass `collapsed` to every content component. Pass `collapsed` and `onCollapsedChange={setSheetCollapsed}` to the phone `<Sheet>` only. The panel `<Sheet>` gets neither.

**`src/ui/sheet/Sheet.tsx`**
- New optional props: `collapsed?: boolean` and `onCollapsedChange?: (collapsed: boolean) => void`.
- Class: `sheet sheet--${variant}`, plus `sheet--collapsed` when `collapsed`.
- Phone variant with `onCollapsedChange` set: replace the decorative handle `div` with
  ```tsx
  <button type="button" className="sheet__handle-button"
    aria-expanded={!collapsed}
    aria-label={collapsed ? 'Expand' : 'Minimise'}
    onClick={() => onCollapsedChange(!collapsed)}>
    <span className="sheet__handle" aria-hidden="true" />
  </button>
  ```
  The accessible name is short because the button sits inside the sheet region, whose name already gives the context. Without `onCollapsedChange`, keep today's decorative `div`. Update the comment, since the sheet is no longer "not draggable".
- **Swipe** (phone variant with `onCollapsedChange` only), handled on the `<section>`:
  - `onPointerDown`: store `{ x: e.clientX, y: e.clientY }` in a `useRef`. Ignore any button other than the primary one (`e.button !== 0`).
  - `onPointerUp`: compute `dx` and `dy` from the stored start, then clear the ref. If `Math.abs(dy) >= SWIPE_MIN_PX` (a constant, `40`) and `Math.abs(dy) > Math.abs(dx)`, then `dy > 0 && !collapsed` → `onCollapsedChange(true)`, and `dy < 0 && collapsed` → `onCollapsedChange(false)`. Anything else does nothing, so taps on "Try again" and the handle button still work as clicks.
  - `onPointerCancel`: clear the ref.
  - Do not use `setPointerCapture`, because it would retarget the child button's click. Touch pointers are implicitly captured by the browser, so `pointerup` still reaches the sheet when the finger leaves it.
  - The swipe does not follow the finger: the sheet switches state on release, with no animation.
- Keep `aria-live="polite"` and the `aria-label` handling as they are.

**CSS (`app.css`)**
- `.sheet--phone`: change the top padding from `10px` to `0` (the handle button now provides that space). Add `touch-action: none;` so a vertical swipe never triggers the browser's pull-to-refresh or scroll. The phone sheet never scrolls anyway.
- `.sheet__handle-button`: `display: flex; justify-content: center; align-items: flex-start; align-self: stretch; height: 30px; margin: 0 -20px -16px; padding: 10px 0 0; border: 0; background: transparent; cursor: pointer; flex-shrink: 0;`. The bar stays exactly where it is today: 10px from the top, with content starting at y = 30px. The whole top strip of the sheet is the tap target. The global `:focus-visible` outline applies. Give it `outline-offset: -2px` so the outline stays inside the rounded sheet.
- The `.sheet__handle` bar keeps its existing styles and is used inside the button.
- `.sheet--collapsed`: `gap: 10px; padding-bottom: calc(16px + env(safe-area-inset-bottom));`.

**Minimised content**, via a new `collapsed?: boolean` prop on each content component:
- `NearestStopContent` (collapsed):
  ```
  <div className="stop-heading__row"> <h1 className="stop-name">{name}</h1> <span className="stop-distance">… away</span> </div>
  {approaching[0] && <ul className="bus-list" aria-live="off"><BusRow bus={approaching[0]} color={colorOf(line)} badge /></ul>}
  {stale && <p className="stale-note">…</p>}
  ```
  This drops the `// NEAREST STOP` eyebrow, the lines row, the rule and the "Heading to this stop" header. The **Scheduled badge is kept inside the row** (`badge`), because vision.md requires a visible label wherever estimated times are shown. The stop name keeps its `h1`. The `aria-live="off"` on the list stays for the ticking countdown.
- `LocatingContent` (collapsed): only the `.locating__row` (spinner and title). No body text, no skeleton.
- `LocationOffContent` and `DataErrorContent` (collapsed): only the `.notice__row` (icon and title). No text or button. On phones the locate button still retries.
- When not collapsed, every component renders exactly what it renders today, minus the changes in steps 2 and 3.
- Row fit at 360px: chip, "to …" (ellipsis, as today), the badge, then the time. `.bus-list__destination` already has `min-width: 0` with an ellipsis, so it absorbs the squeeze. `ScheduledBadge` is already `flex-shrink: 0`.

### 5. End-to-end tests (`tests/e2e/map.spec.ts`)

Update:
- "shows the nearest stop and every scheduled bus": replace the `Estimated at 10:44…` assertion with `await expect(sheet.getByText(/Estimated at/)).toHaveCount(0);`. Also assert `sheet.getByText(/more heading here/)` has count 0. `Scheduled` still has count 1 when expanded.

Add (inside `located near Portagem`):
- **"phone: the sheet minimises and restores"** (skip on desktop). Click `sheet.getByRole('button', { name: 'Minimise' })`. Expect: the button's `aria-expanded` is `false`; the `Portagem` heading is visible; exactly one `listitem` containing `to Vale das Flores`; `Scheduled` has count 1; the `// NEAREST STOP` eyebrow and the "Heading to this stop" heading are gone; the sheet's height is smaller than before. Click `Expand` and expect 2 rows and the "Heading to this stop" heading again.
- **"phone: swiping the sheet minimises and restores it"** (skip on desktop). Get the sheet's box, then use `page.mouse.move` to a point in the sheet, `down()`, `move(x, y + 120, { steps: 5 })` and `up()`. Expect it to be collapsed (the "Expand" button is present). Swipe up by 120px from inside the collapsed sheet and expect it expanded.
- **"desktop: the panel has no minimise control"** (skip on phone): `panel.getByRole('button', { name: /Minimise|Expand/ })` has count 0.
- **"buses draw beneath the sheet"** (both projects). Load the page, wait for the approaching marker, then `page.clock.pauseAt(new Date('2026-09-23T09:45:00Z'))` so no tick moves markers. In `page.evaluate`: take the `.marker-bus--approaching` element, set `style.pointerEvents = 'auto'` (markers are `pointer-events: none`, which `elementFromPoint` would skip), and translate it so its centre sits at the centre of the `.sheet` element: set `style.transform` to a `translate(…px, …px)` computed from the two bounding rects relative to the marker's current position. Return `document.elementFromPoint(cx, cy)?.closest('.sheet') !== null`. Expect `true`. This fails before the fix (the marker wins) and passes after it.

The existing "phone: renders in the bottom sheet" test (the sheet's bottom edge sits at the viewport bottom) and the "default view" framing test must still pass unchanged.

No new Vitest tests: no `domain/` or `sources/` code changes.

## Files

- `src/ui/styles/app.css`: `.map` z-index; handle button, collapsed sheet and `touch-action`; `.estimate-note` → `.stale-note`; remove `.bus-list__more`.
- `src/ui/sheet/Sheet.tsx`: collapse props, handle button, swipe.
- `src/ui/sheet/ApproachingBuses.tsx`: `MAX_ROWS = 4`, no "+N more", exported `BusRow`.
- `src/ui/sheet/NearestStopContent.tsx`: note removed, stale line, collapsed layout.
- `src/ui/sheet/LocatingContent.tsx`, `LocationOffContent.tsx`, `DataErrorContent.tsx`: `collapsed` prop.
- `src/ui/App.tsx`: collapsed state wiring.
- `tests/e2e/map.spec.ts`: updated and new tests.

## Verification

1. `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all pass.
2. `npm run test:e2e` passes on both the `mobile` and `desktop` projects.
3. Manually, with `npm run dev` and a phone-sized viewport (DevTools device mode with touch), located near a stop:
   - The list shows at most 4 rows, with no "+N more" line and no "Estimated at…" note.
   - Tapping the handle and swiping down both minimise the sheet to the stop name, distance and next bus (with its Scheduled badge). Tapping and swiping up both restore it. Tapping "Try again" in the "Location is off" state still works, and swiping there minimises the sheet to its title row.
   - Pan the map so an approaching bus passes behind the sheet or the wordmark: the bus is hidden beneath them. On desktop the same holds for the panel.
   - The desktop panel has no handle and no toggle.
