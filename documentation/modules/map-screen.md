# Map screen

Metro has one screen: a full-viewport map with a content sheet over it. It shows where the user
is, their nearest Metrobus stop, and the nearest bus heading towards that stop. The approved
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
chosen for contrast. If a bus is approaching, a "Nearest bus · U1" row follows, with a
**Scheduled** badge and the note "Position estimated from the timetable at HH:MM". If there is no
approaching bus, that part is not shown.

The sheet is an `aria-live="polite"` region, and its `aria-label` matches its current state.

## Map

- The base map is MapLibre GL with OpenStreetMap raster tiles, muted (desaturated and brightened)
  so that route colours stand out. Rotation and pitch are disabled. Before a location is known,
  the map opens on Coimbra at zoom 13.
- Layers: every line shape in its line colour, and every stop as a small white circle. There are
  no map glyphs or sprites. The user dot, the nearest-stop marker (a red dot with a name pill) and
  the bus marker are DOM markers (`src/ui/map/markers.ts`).
- The **bus marker** is a pill in the line colour with a dashed white border. A "Scheduled" tag
  hangs under it. The dashed border is how the design marks an estimated position.
- MapLibre's own attribution control is turned off and replaced by an attribution element that is
  always visible: "© OpenStreetMap contributors".
- If WebGL is unavailable, the map fails to start and logs an error. The sheet still works.

## Smart zoom

The map is framed with `fitBounds` over the user, the nearest stop and, if there is one, the bus.
The maximum zoom is 17. The animation takes 800 ms, or is instant under
`prefers-reduced-motion`. The padding keeps the points clear of the sheet or panel: on phones, the
bottom padding is the sheet's measured height.

- Framing happens **automatically once**, when both the location and the nearest stop are known.
  If the trips have not loaded within 3 seconds, the map is framed without the bus, and it is not
  reframed when the bus appears later.
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
- A `now` value ticks every 5 seconds. The nearest bus is re-estimated on every tick with no
  network request, so the bus marker moves along its route between ticks.
