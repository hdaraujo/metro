# Map screen

Metro has one screen: a full-viewport map with a content sheet over it. It shows where the user
is, their nearest Metrobus stop (or any stop they tap), every Metrobus bus in service, and a
countdown for each bus heading towards that stop. The approved
prototype (`documentation/design/001-project-structure-prototype.html`) is the visual
specification. Code lives in `src/ui/`.

## Layout

- **Phone** (below `min-width: 768px`): a "Metro" wordmark chip at the top left. At the bottom
  there is a stack of a controls row (the OSM attribution on the left, the locate button on the
  right) above a bottom sheet. The sheet's height follows its content, and it can be minimised
  (see [Minimising the phone sheet](#minimising-the-phone-sheet)).
- **Desktop** (768px and wider): a 380px floating panel at the top left, titled "Metro". It holds
  the same content as the phone sheet, always expanded: it has no handle and cannot be minimised.
  The locate button sits at the bottom right, with the attribution below it.
- **Stacking.** `.map` has `z-index: 0` so that it forms its own stacking context. Marker
  z-indexes (for example `.marker-bus--approaching`, which lifts approaching buses above the
  others) then stay inside the map, and the wordmark, sheet, panel and controls, which come later
  in the DOM, always paint over every marker. Removing that `z-index` makes buses draw in front
  of the sheet again.
- The page never scrolls (`100dvh`). All styling is plain CSS with custom properties
  (`src/ui/styles/tokens.css` and `app.css`). There is no CSS framework, and the Aptos fonts in the
  font stacks are not bundled, so they fall back to Segoe UI or the system font.

## The shown stop

At any moment the screen follows **one stop**, the *shown stop*. The sheet, the red stop marker,
the bus countdowns and dimming, the direction filter and smart zoom all follow it. It is the stop
the user tapped (the **selected stop**) if there is one, and otherwise the **nearest stop**
(`nearestStop(network.stops, position)`, which exists only while located). In `App.tsx`:

- `selectedStopId` holds the tapped stop by **id**, so a network refresh cannot leave a stale
  object behind. It is not persisted, just like `sheetCollapsed`.
- `selected` is that stop looked up in `stopsById`. It is `null` when the id is the nearest
  stop's id, so a selected stop that is (or becomes) the nearest one is shown as the nearest
  stop, with its "Nearest stop" labels. It is also `null` when a refresh drops the stop, and the
  app falls back to the nearest stop.
- `stop = selected ?? nearest?.stop ?? null`. With no location and nothing selected, no stop is
  shown.

### Selecting a stop

- **Hit test** (`stopIdAt` in `MapView.tsx`). A click or tap on the map canvas picks a stop whose
  white circle (the `stops` layer) is within **16 px** of the pointer (`STOP_HIT_RADIUS_PX`, a
  32 px target around a circle about 13 px across). The rendered-features query box is square, so
  candidates are also filtered by their projected pixel distance to keep the target round. When
  several stops are in range (for example an asc/desc pair), the one closest to the tapped point
  wins, through the domain `nearestStop` and its lower-id tie rule. Before the network has loaded,
  the `stops` layer does not exist and every tap counts as empty map.
- The DOM markers (user, stop, buses) have `pointer-events: none`, so taps on them fall through
  to the canvas. Tapping the red marker taps its own stop, and tapping a bus that sits on a stop
  selects that stop.
- MapLibre fires no `click` after a drag, so panning never selects or deselects anything.
- **Tapping a stop** selects it and frames the selected view. Tapping it again re-frames it,
  which helps after panning. Tapping the *nearest* stop clears the selection and frames the
  default view.
- **Tapping empty map** clears the selection and frames the default view. If nothing was
  selected, it does nothing at all. With no location there is no default view, so the camera
  stays where it is.
- The phone sheet's minimised state is left as it is.
- **Desktop cursor.** On `mousemove` the same hit test sets the canvas cursor to `pointer` over a
  stop.
- Selection works at any time, including while the location is off or still being found.
- **Accepted limitations.** Double-tapping or double-clicking empty map to zoom also counts as a
  tap-away while a stop is selected. Stops are canvas features, so they cannot be selected with
  the keyboard.

## What the sheet shows

The first matching rule decides the content. For the two stop states, the sheet region's
`aria-label` is given in brackets:

| Condition | Content |
| --- | --- |
| The stops are loaded and a stop is selected | The selected stop ("Selected stop") |
| Geolocation still locating | "Finding your location…", with a skeleton |
| Geolocation unavailable (denied, not supported, or timed out before a first fix) | "Location is off", with a **Try again** button that restarts the watch |
| Located, but the stops failed to load and no earlier data exists | "Couldn't load Metrobus stops", with **Try again** (not in the prototype) |
| Located, and the stops are still loading | "Finding your nearest stop…" |
| Located, and the stops are loaded | The nearest stop ("Nearest stop") |

Because a selection comes first, a selected stop replaces "Finding your location…" and "Location
is off", and clearing it brings those states back.

The **stop content** (`sheet/NearestStopContent.tsx`, used for both kinds, with `kind` set to
`nearest` or `selected`) shows the eyebrow `// NEAREST STOP` or `// SELECTED STOP`, the stop name
exactly as in the data (for example `República (desc)`), the distance ("180 m away" or "1.2 km
away"), and a chip for each line that serves the stop. Each chip uses the line's colour from the
data, with white or dark text chosen for contrast. The distance of a selected stop is measured
from the user's position; with no position, the distance is not rendered at all, in the expanded
and the minimised sheet alike. Everything else below is the same for both kinds.

If any bus is heading to the stop, a **"Heading to this stop"** section follows
(`sheet/ApproachingBuses.tsx`). Its buses are the stop's upcoming arrivals from the timetable
(`upcomingArrivals`, see `timetable-and-estimates.md`), not the buses on the map: a bus that has
not left its terminus yet is listed, though it has no marker until it departs, and a bus ending
its trip at the stop is not.
- A single **Scheduled** badge in the section header covers the whole list.
- Each bus gets one row, soonest first: its line chip, "to {destination}" (with an ellipsis if it
  is too long), and an `M:SS` countdown in large tabular figures. Minutes are not capped, so a bus
  63 minutes away shows `63:05`.
- At most **4** rows are shown (`MAX_ROWS`, on phone and desktop alike), to keep the sheet
  compact. Nothing says how many more there are.
- A row is the exported `BusRow` component, which the minimised sheet reuses. Its optional
  `badge` prop puts a Scheduled badge inside the row, for use where no header badge covers it.

If no bus is heading to the stop, the section is not shown, even if other buses are on the map.

### Direction filter

At a stop served both ways (for example Portagem), a **direction button** sits on its own row
under the section header, above the list (`sheet/DirectionButton.tsx`). Each press cycles the list
**both → outbound → inbound → both**. The logic is pure and lives in `src/domain/directions.ts`.

- **Served directions.** `directionsAtStop` scans every loaded trip, across all day types in
  `tripsByDayType` and not only today's. A stop is served in a direction when at least one trip of
  that direction calls there **at any stop but its last**, the same rule as the list: a bus
  departs from its first stop, so it can be boarded there, but it ends its run at its last. A
  terminus therefore counts as served in one direction only, the one departing from it. The button shows only when the stop is served in exactly both directions, and
  only in the expanded "Heading to this stop" section. Otherwise the filter is `both`.
- **Label.** `Both directions`, or `To ` followed by that direction's distinct trip destinations,
  most frequent first, with ties in alphabetical order (for example
  `To Vale das Flores, Serpins, Corvo`). If a direction has no destinations, the label falls back
  to `Outbound` or `Inbound`. A long label is cut with an ellipsis, and the full label is the
  button's `title`. The accessible name is `Direction: <label>`, where "Direction: " is visually
  hidden text.
- **Filtering.** Only the list is filtered. It stays soonest first, and the 4-row cap applies
  after filtering. The section still shows as long as a bus is approaching in *either* direction.
  If the filter leaves no bus, the list is replaced by "No buses in this direction right now."
  (`NO_BUSES_IN_DIRECTION`). The header, its Scheduled badge and the button stay, so the user can
  always cycle back.
- **State.** In `App.tsx` the choice is stored with the stop id it was made at. When the shown
  stop changes (a new nearest stop, a selection, or clearing one), it falls back to `both`, and
  no effect is needed for that. The choice is not
  persisted, just like `sheetCollapsed`. `directions` is memoised on the stop **id**, because
  `nearest` is a new object on every position update.
- **Not affected:** the map markers, their countdown tags and dimming, smart zoom and the locate
  reframe all keep using the unfiltered approaching buses in service.

There is no explanatory note under the list: the Scheduled badge and the dashed markers are the
only marks of an estimate. Only when the timetable was fetched more than 24 hours ago
(`STALE_AFTER_MS` in `NearestStopContent.tsx`) does one line close the content: "Timetable data
from {date} may be out of date." It shows whether or not any bus is approaching, and in the
minimised sheet too.

The sheet is an `aria-live="polite"` region, and its `aria-label` matches its current state. The
bus list inside it is `aria-live="off"`: without that, the countdowns, which tick every second,
would flood screen readers. Each row's visible time is `aria-hidden`, and a visually hidden text
such as "3 minutes 4 seconds away" takes its place (the `.visually-hidden` utility in `app.css`).

## Minimising the phone sheet

The phone sheet can be minimised to leave more of the map in view. It always starts expanded; the
state lives in `App.tsx` (`sheetCollapsed`), is not persisted, and is forced off on desktop.

- **Controls.** The grab handle is a real button (`.sheet__handle-button`) spanning the sheet's
  whole top strip. It is named "Minimise" or "Expand" and carries `aria-expanded`. A vertical
  **swipe** anywhere on the sheet also works: at least 40 px (`SWIPE_MIN_PX` in `Sheet.tsx`),
  more vertical than horizontal, down to minimise and up to restore. The sheet switches when the
  pointer is released; it does not follow the finger and does not animate. Shorter or sideways
  movements do nothing, so taps on the sheet's buttons still work as clicks.
- **Swipe mechanics.** `pointerdown` on the sheet adds `pointerup` and `pointercancel` listeners
  on the `window`, so a mouse released outside the sheet still counts. It deliberately does not
  use `setPointerCapture`, which would retarget the click of a button inside the sheet. The phone
  sheet has `touch-action: none` and `user-select: none`, so a swipe never scrolls, triggers
  pull-to-refresh or selects text; the phone sheet never needs to scroll.
- **Minimised content.** Each state keeps only its essentials:

  | State | Minimised content |
  | --- | --- |
  | Nearest or selected stop | The stop name and distance (if the location is known), one `BusRow` for the soonest approaching bus **in the chosen direction** **with its own Scheduled badge** (the header that normally carries the badge is gone, and an estimate must always be labelled), and the stale line if it applies. If the direction filter leaves no bus while one approaches the other way, the row becomes "No buses in this direction right now." The eyebrow, the lines row, the "Heading to this stop" header and the direction button are dropped, but the chosen direction is kept when the sheet is expanded again. |
  | Locating, finding the nearest stop | The spinner and title row |
  | Location off, stops failed to load | The icon and title row, with no text and no **Try again** button. On phones, the locate button still retries geolocation. |

- The `Sheet` component is collapsible only for the phone variant **and** when given
  `onCollapsedChange`; otherwise the handle stays a decorative `div`.
- Minimising never moves the camera. The locate button's reframe measures the sheet's current
  height, so its bottom padding follows the smaller sheet.

## Map

- The base map is MapLibre GL with OpenStreetMap raster tiles, muted (desaturated and brightened)
  so that route colours stand out. Rotation and pitch are disabled. Before a location is known,
  the map opens on Coimbra at zoom 13.
- Layers: every line shape in its line colour, and every stop as a small white circle. There are
  no map glyphs or sprites. The user dot, the stop marker (a red dot with a name pill) and the bus
  markers are DOM markers (`src/ui/map/markers.ts`).
- There is a single **stop marker**, on the shown stop. It looks the same for both kinds; its
  `aria-label` is `Nearest stop: {name}` or `Selected stop: {name}` (`StopKind`). While another
  stop is selected, the nearest stop has no marker of its own. `MapView` memoises the stop
  together with its kind, so a change of kind alone (the selected stop becoming the nearest one)
  still updates the label.
- **Every bus in service has a marker**: every line, both directions, whether or not the bus is
  heading to the user's stop. `useBusMarkers` in `MapView.tsx` keeps one MapLibre marker per
  `tripId`. On each tick it moves and updates the existing markers in place, adds markers for new
  trips and removes the markers of trips that have ended.
- A **bus marker** is a pill in the line colour with a dashed white border. The dashed border is
  how the design marks an estimated position; **no map marker carries the word "Scheduled"**. The
  only visible "Scheduled" label is the badge in the sheet's "Heading to this stop" header (or,
  in the minimised phone sheet, the badge in its single bus row). So
  while location is off or still being found (no sheet list), the buses on the map are marked as
  estimated only by their dashed border and their accessible names — an accepted trade-off for a
  less cluttered map. There are three variants:

  | The bus is… | Tag under the pill | Class |
  | --- | --- | --- |
  | heading to the shown stop | the countdown only, e.g. `3:04` | `marker-bus--approaching`, drawn above the others |
  | not heading there (going elsewhere, or already past it) | none | `marker-bus--dimmed` (55% opacity) |
  | on the map with no stop shown (no location and nothing selected) | none | none. Nothing is dimmed. |

  The `.marker-bus__tag` element always exists in the marker. With no countdown it is emptied and
  given the `hidden` attribute; `app.css` needs `.marker-bus__tag[hidden] { display: none; }`
  because the tag's `display: flex` would otherwise override `hidden` and draw an empty yellow
  box. Each marker is `role="img"` with an `aria-label` such as "Scheduled position of line U1 bus
  to Vale das Flores, 3 minutes 4 seconds from Portagem" — this label keeps "Scheduled" and must
  keep it, since it is what tells assistive technology the position is estimated. The tag is built
  from DOM nodes with `textContent`, never with `innerHTML`. On each tick only the time text is
  updated; the tag's children are replaced only when the bus starts or stops approaching.
- Two buses on the same line can be on the map at once, for example U1 in each direction. Tests
  must tell markers apart by destination as well as by line.
- MapLibre's own attribution control is turned off and replaced by an attribution element that is
  always visible: "© OpenStreetMap contributors".
- If WebGL is unavailable, the map fails to start and logs an error. The sheet still works.

## Smart zoom

The map is framed with `fitBounds` over one of two point sets:

- **Default view** (nothing selected): the user, the nearest stop and the soonest approaching buses
  described below. It needs a location.
- **Selected view**: the selected stop and its soonest approaching buses, **without the user**,
  even when their position is known. It is the framing the user would get standing at that stop,
  and it works with no location.

The buses framed are the **soonest approaching bus in each direction of travel** to the shown
stop (`soonestPerDirection` in `src/domain/buses.ts`): the next `outbound` bus and the next
`inbound` bus heading to the stop, so up to two buses. A stop served in one direction only (for
example `República (desc)`), or with buses approaching from one side only, frames one bus; with
none approaching, only the stop (and, in the default view, the user) is framed. It never frames
every bus in service, and it ignores the sheet's direction filter. Only buses in service are
framed, since only they are on the map, so the sheet's first row can be a bus that is not framed
yet because it has not left its terminus. The maximum zoom is 17. The
animation takes 800 ms, or is instant under `prefers-reduced-motion`. The padding keeps the points clear of the sheet or panel: on phones, the
bottom padding is the sheet's measured height.

- Framing happens **automatically once**, when both the location and the nearest stop are known.
  If the trips have not loaded within 3 seconds, the map is framed without the buses, and it is
  not reframed when they appear later. It does not run while a stop is selected, and any framing
  the user asks for (a selection or the locate button) counts as that first one, so a user who
  selects a stop while still being located keeps their camera when the location arrives.
- After that, the map is reframed only when the user selects or clears a stop, or presses the
  locate button. Position updates move the markers but never move the camera, so the user's
  panning is respected.
- **Framing is requested, not called.** A selection changes state, and the new stop's buses only
  exist in the next render. So the handlers bump a `fitRequest` counter and an effect runs `fit`
  once per request, in the render that already has the new buses. Calling `fit` directly from a
  handler would frame the previous stop's buses. If the trips are not loaded yet, whatever is
  known is framed (possibly the stop alone, at zoom 17), with no reframe later.

## Locate button

| Geolocation state | Button |
| --- | --- |
| Locating | Disabled and grey |
| Located | Blue crosshair. Pressing it clears any selection and frames the default view. |
| Unavailable | Crossed-out crosshair. Pressing it retries geolocation and keeps any selection. |

Its name stays "Centre on my location" in every state.

## Live behaviour

- Geolocation uses `watchPosition` with high accuracy, a maximum position age of 10 s and a 15 s
  timeout. A timeout that arrives after a first fix keeps the last known position rather than
  switching to "unavailable".
- A `now` value ticks **every second**. Every bus is re-estimated on each tick, with no network
  request, so the markers move along their routes and the sheet and map countdowns tick down
  together.
- Buses are shown even while the location is still being found, or when it is off. The sheet then
  shows its locating or "Location is off" state, and the map shows the buses with no countdowns,
  until the user selects a stop.

## Testing notes

Stops are canvas features, so the end-to-end tests (`tests/e2e/map.spec.ts`) cannot click them
by locator. They work out a stop's screen position instead: a Web Mercator projection (tile size
512) anchored on two DOM markers whose coordinates are known (`projectorFromAnchors`), or on the
map's initial camera when there is no location (`initialProjector`), with stop coordinates read
from `tests/fixtures/stops.json`. `emptyMapPoint` finds a point at least 48 px from every stop.
Parque is the usual click target, since no other stop is within 630 m of it. If a click misses,
fix the projection; never widen `STOP_HIT_RADIUS_PX` to make a test pass.
