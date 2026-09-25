# Map screen

Metro has one screen: a full-viewport map with a content sheet over it. It shows where the user
is, their nearest Metrobus stop, every Metrobus bus in service, and a countdown for each bus
heading towards that stop. The approved
prototype (`documentation/design/001-project-structure-prototype.html`) is the visual
specification. Code lives in `src/ui/`.

## Layout

- **Phone** (below `min-width: 768px`): a "Metro" wordmark chip at the top left. At the bottom
  there is a stack of a controls row (the OSM attribution on the left, the locate button on the
  right) above a bottom sheet. The sheet's height follows its content. Its grab handle is
  decorative, and the sheet cannot be dragged.
- **Desktop** (768px and wider): a 380px floating panel at the top left, titled "Metro". It holds
  the same content as the phone sheet. The locate button sits at the bottom right, with the
  attribution below it.
- The page never scrolls (`100dvh`). All styling is plain CSS with custom properties
  (`src/ui/styles/tokens.css` and `app.css`). There is no CSS framework, and the Aptos fonts in the
  font stacks are not bundled, so they fall back to Segoe UI or the system font.

## What the sheet shows

The first matching rule decides the content:

| Condition | Content |
| --- | --- |
| Geolocation still locating | "Finding your location…", with a skeleton |
| Geolocation unavailable (denied, not supported, or timed out before a first fix) | "Location is off", with a **Try again** button that restarts the watch |
| Located, but the stops failed to load and no earlier data exists | "Couldn't load Metrobus stops", with **Try again** (not in the prototype) |
| Located, and the stops are still loading | "Finding your nearest stop…" |
| Located, and the stops are loaded | The nearest stop |

The **nearest stop** content shows `// NEAREST STOP`, the stop name exactly as in the data (for
example `República (desc)`), the distance ("180 m away" or "1.2 km away"), and a chip for each
line that serves the stop. Each chip uses the line's colour from the data, with white or dark text
chosen for contrast.

If any bus is heading to the stop, a **"Heading to this stop"** section follows
(`sheet/ApproachingBuses.tsx`):
- A single **Scheduled** badge in the section header covers the whole list.
- Each bus gets one row, soonest first: its line chip, "to {destination}" (with an ellipsis if it
  is too long), and an `M:SS` countdown in large tabular figures. Minutes are not capped, so a bus
  63 minutes away shows `63:05`.
- At most **5** rows are shown, so that the phone sheet never grows enough to make the page
  scroll. Any others appear as "+N more heading here". The map still shows every one of them.
- A note follows the list: "Estimated at HH:MM from the published timetable. Live data replaces
  these estimates once a live feed is available." HH:MM is when the estimate was computed (it
  follows the clock), not when the timetable was fetched. The stale-timetable sentence is added to
  it when it applies.

If no bus is heading to the stop, the section is not shown, even if other buses are on the map.

The sheet is an `aria-live="polite"` region, and its `aria-label` matches its current state. The
bus list inside it is `aria-live="off"`: without that, the countdowns, which tick every second,
would flood screen readers. Each row's visible time is `aria-hidden`, and a visually hidden text
such as "3 minutes 4 seconds away" takes its place (the `.visually-hidden` utility in `app.css`).

## Map

- The base map is MapLibre GL with OpenStreetMap raster tiles, muted (desaturated and brightened)
  so that route colours stand out. Rotation and pitch are disabled. Before a location is known,
  the map opens on Coimbra at zoom 13.
- Layers: every line shape in its line colour, and every stop as a small white circle. There are
  no map glyphs or sprites. The user dot, the nearest-stop marker (a red dot with a name pill) and
  the bus markers are DOM markers (`src/ui/map/markers.ts`).
- **Every bus in service has a marker**: every line, both directions, whether or not the bus is
  heading to the user's stop. `useBusMarkers` in `MapView.tsx` keeps one MapLibre marker per
  `tripId`. On each tick it moves and updates the existing markers in place, adds markers for new
  trips and removes the markers of trips that have ended.
- A **bus marker** is a pill in the line colour with a dashed white border. The dashed border is
  how the design marks an estimated position; **no map marker carries the word "Scheduled"**. The
  only visible "Scheduled" label is the badge in the sheet's "Heading to this stop" header. So
  while location is off or still being found (no sheet list), the buses on the map are marked as
  estimated only by their dashed border and their accessible names — an accepted trade-off for a
  less cluttered map. There are three variants:

  | The bus is… | Tag under the pill | Class |
  | --- | --- | --- |
  | heading to the nearest stop | the countdown only, e.g. `3:04` | `marker-bus--approaching`, drawn above the others |
  | not heading there (going elsewhere, or already past it) | none | `marker-bus--dimmed` (55% opacity) |
  | on the map with no known location, so no stop | none | none. Nothing is dimmed. |

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

The map is framed with `fitBounds` over the user, the nearest stop and the **soonest approaching
bus in each direction of travel** (`soonestPerDirection` in `src/domain/buses.ts`): the next
`outbound` bus and the next `inbound` bus heading to the stop, so up to two buses. A stop served in
one direction only (for example `República (desc)`), or with buses approaching from one side only,
frames one bus; with none approaching, only the user and the stop are framed. It never frames every
bus in service. The maximum zoom is 17. The animation takes 800 ms, or is instant under
`prefers-reduced-motion`. The padding keeps the points clear of the sheet or panel: on phones, the
bottom padding is the sheet's measured height.

- Framing happens **automatically once**, when both the location and the nearest stop are known.
  If the trips have not loaded within 3 seconds, the map is framed without the buses, and it is
  not reframed when they appear later.
- After that, the map is reframed only when the user presses the locate button. Position updates
  move the markers but never move the camera, so the user's panning is respected.

## Locate button

| Geolocation state | Button |
| --- | --- |
| Locating | Disabled and grey |
| Located | Blue crosshair. Pressing it reframes the map. |
| Unavailable | Crossed-out crosshair. Pressing it retries geolocation. |

## Live behaviour

- Geolocation uses `watchPosition` with high accuracy, a maximum position age of 10 s and a 15 s
  timeout. A timeout that arrives after a first fix keeps the last known position rather than
  switching to "unavailable".
- A `now` value ticks **every second**. Every bus is re-estimated on each tick, with no network
  request, so the markers move along their routes and the sheet and map countdowns tick down
  together.
- Buses are shown even while the location is still being found, or when it is off. The sheet then
  shows its locating or "Location is off" state, and the map shows the buses with no countdowns.
