# Plan — Play 001 "project structure": base app + map with nearest stop and nearest bus

## Context

The `metro` repository currently holds only specifications (`documentation/`, `plays/`, `.claude/`,
`CLAUDE.md`, `.gitignore`). This play creates the product's code base and its first feature.
Per `intent.md`: "Create the base app, only feature is the map centered on the user location, smart
zoom to show the nearest stop (maybe nearest bus also). Create readme, .gitignore, import libs,
project scaffolding."

Decisions already taken with the user (earlier planning session on this play, not to be revisited):
- **The nearest scheduled bus is in scope.** It is shown as the dashed marker on the map and as a
  row in the sheet, always labelled "Scheduled".
- **Map base: OpenStreetMap raster tiles, visually muted.**
- **The approved prototype is the UI specification.** See `plays/001-project-structure/design/design.md`,
  the artboards in `plays/001-project-structure/design/canvas/project/*.dc.html`, and the review copy
  in `documentation/design/001-project-structure-prototype.html`. Do not redesign it.

The architecture follows `documentation/context/tech.md`: there is **no backend**. The app is one
static, client-side React PWA at the repo root. It fetches the Metro Mondego timetable JSON directly
from the browser (the source sends `Access-Control-Allow-Origin: *`, and I verified this), using
source adapters in `src/sources/`, pure logic in `src/domain/` and React in `src/ui/`.

## Repositories touched

- **`metro`**: the only repository. All code goes at the root of this repo, alongside the existing
  `documentation/`, `plays/`, `.claude/` and `CLAUDE.md`.
  - Do not modify `documentation/`, `plays/` (except this play's own files, which Building manages),
    `.claude/` or the root `CLAUDE.md`.
- **Note for DevOps:** the Architect's rewrite of `documentation/context/tech.md` (the no-backend
  architecture) is still an **uncommitted change on `main`** in the main clone. It must be committed
  to `main` before this play's branch is cut. Otherwise the branch carries the old backend-based
  tech stack.

## Tooling and dependency versions (latest stable, verified on npm on 2026-09-25)

Runtime dependencies:
- `react` 19.3.x
- `react-dom` 19.3.x
- `maplibre-gl` 6.11.x
- `workbox-window` 7.4.x (peer dependency of vite-plugin-pwa)

Dev dependencies:
- `typescript` 7.0.2
- `@typescript/typescript6` 6.0.2 (see the TS 7 note below)
- `vite` 8.3.x
- `@vitejs/plugin-react` 6.1.x
- `vite-plugin-pwa` 1.3.x
- `@vite-pwa/assets-generator` 2.0.x
- `vitest` 5.0.x
- `@playwright/test` 1.63.x
- `eslint` 10.11.x
- `@eslint/js` 10.x
- `typescript-eslint` 8.70.x
- `eslint-plugin-react-hooks` 7.x
- `eslint-plugin-react-refresh` 0.5.x
- `eslint-config-prettier` 10.x
- `globals` 17.x
- `prettier` 3.9.x
- `@types/react` 19.3.x
- `@types/react-dom` 19.3.x
- `@types/node` (latest; covers Node 24 APIs)

Install them with `npm install <pkg>@latest`. Commit `package-lock.json`. Do not add any other
runtime library: no state library, no date library and no CSS framework. Time zone handling uses
`Intl`.

**TypeScript 7 vs typescript-eslint:** `typescript-eslint` 8.70 declares the peer dependency
`typescript >=4.8.4 <6.1.0` and uses the TypeScript JS API. The `typescript@7` package does not
expose that API: its main export is only `lib/version.cjs`. Microsoft publishes
`@typescript/typescript6`, which re-exports the TS 6 API, for this situation. Resolve it in this
order, and keep the first option that works:
1. Keep `"typescript": "7.0.2"`, so that the `tsc` binary is TS 7. Add
   `"@typescript/typescript6": "6.0.2"`, and add npm `overrides` so that typescript-eslint's
   packages resolve `typescript` to `npm:@typescript/typescript6@6.0.2`. The overrides apply under
   `typescript-eslint`, `@typescript-eslint/parser`, `@typescript-eslint/typescript-estree`,
   `@typescript-eslint/project-service`, `@typescript-eslint/type-utils` and
   `@typescript-eslint/utils`.
   Acceptance: a plain `npm install`, with no `--force` and no `--legacy-peer-deps`, succeeds, and
   `npm run lint` parses `.ts` and `.tsx` files.
2. Fallback: `"typescript": "npm:@typescript/typescript6@6.0.2"`, which provides the API for
   typescript-eslint and has no `tsc` bin, plus `"typescript7": "npm:typescript@7.0.2"`, which
   provides the `tsc` bin. The `typecheck` script still runs `tsc`, which is TS 7.

In both cases **type checking is done by TS 7's `tsc`**. Vite and Vitest transpile on their own and
never need the `typescript` package. Record whichever option was used, and why, in the README's
"Tooling notes". Use only the non-type-aware typescript-eslint configs (`tseslint.configs.recommended`
and `stylistic`, not the `*TypeChecked` variants), so that ESLint never needs a TS program.

## Files to create (repo root of `metro`)

### Project scaffolding

- **`package.json`**
  - Package fields: `"name": "metro"`, `"private": true`, `"type": "module"`,
    `"engines": { "node": ">=24" }`.
  - Scripts:
    - `dev`: `vite`
    - `build`: `npm run typecheck && vite build`
    - `preview`: `vite preview`
    - `typecheck`: `tsc --noEmit -p tsconfig.json`
    - `test`: `vitest run`
    - `test:watch`: `vitest`
    - `test:e2e`: `playwright test`
    - `lint`: `eslint . && prettier --check .`
    - `format`: `prettier --write .`
    - `icons`: `pwa-assets-generator`
- **`.nvmrc`**: `24`.
- **`.editorconfig`**: utf-8, LF, 2-space indent, final newline.
- **`.gitignore`**: keep the existing two lines (the Building comment and
  `.claude/settings.local.json`) exactly, and append:
  - `node_modules/`, `dist/`, `dev-dist/`, `coverage/`
  - `playwright-report/`, `test-results/`, `blob-report/`, `playwright/.cache/`
  - `*.log`, `.DS_Store`, `.env*.local`, `.vite/`
- **`tsconfig.json`**: one config.
  - Compiler options: `target` `ES2023`; `lib` `["ES2023","DOM","DOM.Iterable"]`; `module`
    `ESNext`; `moduleResolution` `bundler`; `jsx` `react-jsx`; `strict`; `noUncheckedIndexedAccess`;
    `noImplicitOverride`; `noFallthroughCasesInSwitch`; `verbatimModuleSyntax`; `isolatedModules`;
    `noEmit`; `skipLibCheck`; `resolveJsonModule`; `types`
    `["vite/client","vite-plugin-pwa/client","node"]`.
  - `include`: `src`, `tests`, `vite.config.ts`, `playwright.config.ts`, `pwa-assets.config.ts`.
  - Do not use options that TS 7 removed (`baseUrl`, `moduleResolution: node`/`node10`,
    `target: ES5`, `outFile`, and so on).
- **`eslint.config.js`** (flat config):
  - `@eslint/js` recommended, typescript-eslint recommended and stylistic, react-hooks
    recommended, react-refresh (`only-export-components`, warn), and `eslint-config-prettier` last.
  - `globals.browser` for `src/**`, and `globals.node` for config files and `tests/e2e/**`.
  - Ignores: `dist`, `dev-dist`, `coverage`, `playwright-report`, `test-results`, `documentation`,
    `plays`, `.claude`, `public`.
- **`.prettierrc.json`**: `{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }`.
- **`.prettierignore`**: the same folders as the ESLint ignores, plus `package-lock.json`,
  `tests/fixtures/` and `*.md` under `documentation/` and `plays/`. Those two folders are already
  ignored whole.
- **`index.html`**:
  - `lang="en"`.
  - `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`.
  - `<meta name="theme-color" content="#ffffff">`.
  - `<title>Metro — Coimbra Metrobus</title>`.
  - A short description meta, an apple-touch-icon link, `<div id="root">`, and
    `<script type="module" src="/src/main.tsx">`.
- **`vite.config.ts`**:
  - `base: './'`, so that the build does not assume a host or path.
  - Plugins: `react()` and `VitePWA({...})` (details under "PWA" below).
  - A Vitest `test` block: `{ include: ['src/**/*.test.ts'], environment: 'node' }`.
- **`playwright.config.ts`**:
  - `testDir: 'tests/e2e'`.
  - `webServer`: `npm run build && npm run preview -- --port 4173 --strictPort`, with
    `url: 'http://localhost:4173'` and `reuseExistingServer: !process.env.CI`.
  - `use`: `{ baseURL: 'http://localhost:4173', serviceWorkers: 'block', locale: 'en-GB', timezoneId: 'Europe/Lisbon' }`.
  - Two projects:
    - `mobile`: Chromium with a 390×844 viewport, `isMobile`, `hasTouch`.
    - `desktop`: Chromium at 1440×900.
  - If WebGL fails in headless mode, add `launchOptions.args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']`.
- **`pwa-assets.config.ts`**: `@vite-pwa/assets-generator` with the `minimal2023Preset`, source
  `public/icon.svg`.
- **`public/icon.svg`**: a simple app icon: a Critical Red (`#dc1a32`) rounded square with a
  white bus glyph (the same bus path the artboards use). Run `npm run icons` once and **commit** the
  generated PNGs in `public/` (`pwa-64x64.png`, `pwa-192x192.png`, `pwa-512x512.png`,
  `maskable-icon-512x512.png`, `apple-touch-icon-180x180.png`, `favicon.ico`).
- **`README.md`**: sections in this order:
  1. **What Metro is**: one paragraph, taken from the vision.
  2. **Requirements**: Node 24.
  3. **Getting started**: `npm install`, `npm run dev`.
  4. **Scripts**: a table of every script above.
  5. **Project layout**: `src/sources`, `src/domain`, `src/ui`, `tests/`, and a pointer to
     `documentation/` and `plays/` with a link to the root `CLAUDE.md` for how specs and plays work.
  6. **Data sources**: the three Metro Mondego JSON URLs. State that the data is undocumented, has
     no stated licence and may change without notice, and that bus positions are *estimated from
     the timetable* and labelled "Scheduled".
  7. **Map and attribution**: OSM tiles, and the OSM tile usage policy (fine for personal and light
     use; switch to a dedicated tile provider before any wider launch).
  8. **Tooling notes**: TS 7 plus the typescript-eslint arrangement actually used.
  9. **Deployment**: a static `dist/` folder, host deliberately undecided.

### Source layout

```
src/
  main.tsx                      createRoot + registerSW (virtual:pwa-register, immediate: true)
  sources/
    metrobusTimetable.ts        fetch + parse adapters for stops, shapes, trips
    metrobusTimetable.test.ts
  domain/
    types.ts                    domain types (below)
    geo.ts / geo.test.ts        haversine, local metric projection, formatDistance
    nearestStop.ts / .test.ts
    shape.ts / shape.test.ts    cumulative lengths, projectOnShape, pointAtDistance
    lisbonTime.ts / .test.ts    Lisbon wall-clock parts, parse "HH:MM:SS" (incl. ≥24h)
    holidays.ts / .test.ts      Portuguese national holidays, dayTypeFor(date)
    interpolation.ts / .test.ts bus position along shape at a service-day time
    nearestBus.ts / .test.ts    choose the approaching bus for a stop
    color.ts / color.test.ts    readableTextColor(hex)
  ui/
    App.tsx
    styles/tokens.css           CSS custom properties (colours, radii, spacing, fonts)
    styles/app.css              layout + component classes
    icons.tsx                   inline SVG icons copied from the artboards
    hooks/useGeolocation.ts
    hooks/useNetwork.ts         stops + shapes (+ fetchedAt, error, retry)
    hooks/useTimetable.ts       trips per day type, loaded on demand
    hooks/useNow.ts             Date that ticks every 5 s
    hooks/useMediaQuery.ts
    map/MapView.tsx             MapLibre map, layers, DOM markers, imperative fitTo()
    map/mapStyle.ts             style object (muted OSM raster)
    map/markers.ts              DOM builders: user dot, nearest-stop marker+label, bus marker
    chrome/Wordmark.tsx, LocateButton.tsx, Attribution.tsx
    sheet/Sheet.tsx             bottom sheet (mobile) / floating panel (desktop)
    sheet/NearestStopContent.tsx, NearestBusRow.tsx, LocatingContent.tsx,
    sheet/LocationOffContent.tsx, DataErrorContent.tsx, LineChip.tsx, ScheduledBadge.tsx
tests/
  fixtures/                     recorded source JSON (see Testing)
  e2e/map.spec.ts
```

## Domain model (`src/domain/types.ts`)

Coordinates are always `{ lat: number; lng: number }` (`LatLng`) inside the domain. The conversion
to MapLibre's `[lng, lat]` happens only in `src/ui/map/`. The source's shape points are `[lat, lng]`
arrays, and the adapter converts them.

```ts
type LineId = string;                        // 'S1' | 'S2' | 'U1' | 'U2' | 'U3' in current data
type Direction = 'outbound' | 'inbound';     // source: trips 'P-S' / shapes 'Ida' → outbound; 'S-P' / 'Volta' → inbound
type DayType = 'DU' | 'Sab' | 'Dom';
interface Stop  { id: string; code: string; name: string; lines: LineId[]; coords: LatLng; suburbanOnly: boolean }
interface Shape { id: string; line: LineId; direction: Direction; color: string; points: LatLng[] }
interface StopTime { stopId: string; seconds: number }   // seconds since service-day midnight, may exceed 86400
interface Trip  { id: string; line: LineId; direction: Direction; dayType: DayType; destination: string; stopTimes: StopTime[] }
type DataSource = 'scheduled' | 'live';
interface BusPosition { tripId: string; line: LineId; direction: Direction; coords: LatLng;
                        source: DataSource; at: string /* UTC ISO 8601 */;
                        nextStopId: string; arrivalAtStopSeconds: number }
interface Network { stops: Stop[]; shapes: Shape[]; lineColors: Record<LineId, string>; fetchedAt: string }
```

## Source adapter (`src/sources/metrobusTimetable.ts`)

The base URL is `https://planearviagem.metromondego.pt/data/`. The formats below were verified live
on 2026-09-25.
- **`stops.json`**: an array of 39 items of the form
  `{id, code, name, lines: string[], isSuburbanOnly, coords: {lat, lng}}`. Names are unique.
  Six names carry the suffix `(asc)` or `(desc)`: Câmara, Mercado and República are each two
  distinct stops, one per direction.
- **`route-shapes.json`**: an array of 10 items of the form
  `{id: 'S1-0', line, direction: 'Ida'|'Volta', color: '#0080FF', points: [[lat, lng], …]}`.
  The real colours are: S1 `#0080FF`, S2 `#FF0000`, U1 `#2B6CC4`, U2 `#FF5349`, U3 `#00FF40`.
- **`trips-{DU|Sab|Dom}.json`**: an array of trips (452, 302 and 225 of them) of the form
  `{id, line, lineType, dayType, direction: 'P-S'|'S-P', finalDestination, stops: [{name, time: 'HH:MM:SS'}]}`.
  - Stops are referenced **by name**. Every name matches `stops.json` exactly.
  - Times can go past 24:00 (up to about `25:29:28`) for trips after midnight.
  - Short-turn trips exist, for example Coimbra B → Corvo. Their stops are a subset of the full
    shape.
- The responses are sent with `cache-control: public, max-age=300` and a weak ETag.

Exports:
- `parseStops(json): Stop[]`, `parseShapes(json): Shape[]`, and
  `parseTrips(json, stopIdByName: Map<string,string>, dayType): Trip[]`. These are pure functions.
  They validate the fields they use and throw `SourceFormatError` (exported) when a required field
  is missing or has the wrong type. In `parseTrips`, a trip with an unknown stop name or direction
  is **skipped** with one `console.warn` for each distinct problem, not thrown.
- `fetchNetwork(): Promise<Network>` fetches stops and shapes in parallel. `lineColors` comes from
  the shapes. `fetchedAt` is taken from the response `Date` header (converted to UTC ISO), falling
  back to now.
- `fetchTrips(dayType, stopIdByName): Promise<Trip[]>`.
- Uses a plain `fetch(url)`. The HTTP cache and the service worker handle revalidation. A non-2xx
  status throws an `Error` carrying the URL and the status.

Nothing outside this file may know the source's field names, the `Ida`/`Volta`/`P-S`/`S-P` codes or
the `[lat, lng]` ordering.

## Domain logic (all pure, no DOM, no React)

- **geo.ts**
  - `haversineMeters(a, b)`.
  - `toLocalMeters(p, originLat)`: an equirectangular projection for segment math.
  - `formatDistance(m)`: below 1000 m, round to the nearest 10 m (`"180 m"`); from 1000 m, one
    decimal (`"1.2 km"`).
- **nearestStop.ts**
  - `nearestStop(stops, point): { stop, distanceMeters } | null`, using haversine over all stops,
    including suburban-only ones.
  - Ties are broken by the lower `id`, compared as a string.
- **shape.ts**
  - `measureShape(shape)`: cumulative lengths in metres.
  - `projectOnShape(measured, point, fromSegment = 0): { distance, segment }`: the nearest point
    on the polyline, searching segments from `fromSegment` onwards.
  - `pointAtDistance(measured, d)`: clamped to `[0, length]`.
  - `stopDistancesForTrip(measured, trip, stopsById)`: projects each stop time's stop in order,
    passing the previous `segment` as `fromSegment` so that distances are monotonic. This handles
    stops that are not exactly on a vertex, such as the S2 asc/desc stops.
  - Results are memoised in a `Map` keyed by `shapeId + '|' + stopId sequence`.
- **lisbonTime.ts**
  - `lisbonClock(now: Date): { date: 'YYYY-MM-DD'; weekday: 0..6; seconds: number }`, using
    `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hourCycle: 'h23', … }).formatToParts`.
  - `previousDate(date)`.
  - `parseServiceTime('25:12:28') → 90748`.
  - `formatLisbonHM(now) → '10:42'`.
- **holidays.ts**
  - `portugueseHolidays(year): Set<'YYYY-MM-DD'>`. It contains the fixed national holidays (01-01,
    04-25, 05-01, 06-10, 08-15, 10-05, 11-01, 12-01, 12-08, 12-25) and the moveable ones: Good
    Friday (Easter −2), Easter Sunday, and Corpus Christi (Easter +60). Easter uses the anonymous
    Gregorian algorithm.
  - `dayTypeFor(date: 'YYYY-MM-DD'): DayType`: a holiday or a Sunday gives `Dom`, a Saturday gives
    `Sab`, and anything else gives `DU`.
  - The Coimbra municipal holiday (4 July) is **not** included. Add a code comment saying that it
    is an open question whether Metrobus runs the Sunday timetable that day.
- **interpolation.ts**
  - `positionAt(trip, measured, stopDistances, seconds): LatLng | null`.
  - It returns null if `seconds` is before the first stop time or after the last.
  - Otherwise it finds the stop times i and i+1 with `t_i ≤ seconds ≤ t_{i+1}` and linearly
    interpolates the distance along the shape between `d_i` and `d_{i+1}` by time. When
    `t_i === t_{i+1}`, it uses `d_i`.
- **nearestBus.ts**
  - `nearestApproachingBus({ stop, clock, tripsByDayType, shapesById, stopsById, now }): BusPosition | null`.
  - It considers two service days:
    - **today**: `dayTypeFor(clock.date)`, with `offset = clock.seconds`.
    - **yesterday**: `dayTypeFor(previousDate(clock.date))`, with `offset = clock.seconds + 86400`.
      This day is only considered when `clock.seconds < 4 * 3600`.
  - For each trip of that day type that calls at `stop.id` at index k, the trip is a candidate if
    `stopTimes[0].seconds ≤ offset < stopTimes[k].seconds`. In other words, the bus has started and
    has not yet reached the stop.
  - It picks the candidate with the smallest `stopTimes[k].seconds − offset`, meaning the soonest
    arrival.
  - The shape is `${line}` plus the direction: outbound is shape index 0 and inbound is index 1.
    The adapter keeps the source's shape id in `Shape.id`, and `nearestBus` looks the shape up by
    `(line, direction)`, never by parsing the id.
  - It returns a `BusPosition` with `source: 'scheduled'`, `at: now.toISOString()`,
    `nextStopId: stop.id` and `arrivalAtStopSeconds`.
  - It returns null when there is no candidate: late at night, or at a terminus with no trip in
    progress.
- **color.ts**
  - `readableTextColor(hex)`: returns `#ffffff` or `#14161a`, whichever has the higher WCAG
    contrast ratio against `hex`. U3's `#00FF40` gets dark text; the other line colours get white.

## UI

The UI follows the artboards exactly. The values below are taken from them and from
`documentation/design/001-project-structure-prototype.html`. The Aptos fonts are **not** bundled:
use the artboards' font stacks as written, which fall back to Segoe UI or the system font.
- sans: `'Aptos','Segoe UI',system-ui,-apple-system,sans-serif`
- narrow: `'Aptos Narrow','Aptos','Segoe UI',system-ui,sans-serif`
- mono: `'Aptos Mono',ui-monospace,'SF Mono',Menlo,Consolas,monospace`

**`tokens.css`**:
- Text: text `#14161a`, secondary `#474d58`, muted `#656c78`, disabled icon `#8a909c`.
- Surfaces: hairline `#e5e7ec`, grab handle `#d8dbe1`, skeleton `#eeeff2`, surface `#ffffff`,
  map land `#f1f0eb`.
- Accents: red `#dc1a32` (hover `#b31329`), blue `#1f5fa8`, stop stroke `#2c313a`.
- Warning: background `#fbf1de`, text `#7a4e05`, dot `#b97608`.
- Radii: 4px controls, 8px floating buttons and wordmark, 16px sheet, 12px desktop panel.
- Shadows as in the artboards:
  - small: `0 1px 3px rgba(20,22,26,.08),0 1px 2px rgba(20,22,26,.04)`
  - button: `0 4px 12px rgba(20,22,26,.08),0 2px 4px rgba(20,22,26,.04)`
  - sheet: `0 -4px 24px rgba(20,22,26,.10)`
  - desktop panel: `0 12px 32px rgba(20,22,26,.12),0 4px 8px rgba(20,22,26,.05)`

**Layout.** `html`, `body` and `#root` are full height (`100dvh`) and do not scroll. The map fills
the viewport. The breakpoint is `min-width: 768px`. Below it is the "phone" layout; at or above it
is the "desktop" layout.

**Phone layout** (Main, Locating and LocationOff artboards):
- **Wordmark**: absolute at 16px/16px, height 40px, padding `0 14px`, white, radius 8px, small
  shadow. The text "Metro" is in the narrow font, 20px/700, letter-spacing -0.02em.
- **Bottom stack**: absolute at bottom 0, left 0, right 0, a column containing:
  - A **controls row**:
    - The attribution at left 8px, sitting 8px above the sheet.
    - The locate button at right 16px, sitting 20px above the sheet.
  - The **sheet**: white, radius `16px 16px 0 0`, sheet shadow, padding
    `10px 20px calc(24px + env(safe-area-inset-bottom))`, a column with 16px gap, and a height
    driven by its content.
  - The sheet's first child is the decorative grab handle: 36×4px, radius 999px, `#d8dbe1`,
    centred. The sheet is **not** draggable.
- **Locate button**: 48×48px, white, 1px `#e5e7ec` border, radius 8px, button shadow, 22px icon.
  - Located: blue icon, crosshair, `aria-label="Centre on my location"`.
  - Locating: `disabled`, icon `#8a909c`, `aria-label="Centre on my location (waiting for location)"`.
  - Unavailable: icon `#656c78`, the crossed-out crosshair (the `m5 5 14 14` path),
    `aria-label="Try to find my location"`, and clicking it retries.
- **Attribution**: padding `2px 6px`, `rgba(255,255,255,.85)`, radius 2px, 11px, `#474d58`. It
  reads "© OpenStreetMap contributors", where "OpenStreetMap" links to
  `https://www.openstreetmap.org/copyright`. MapLibre's own attribution control is disabled
  (`attributionControl: false`) and replaced by this element, which is always visible.

**Desktop layout** (Desktop artboard):
- **Panel**: absolute at 24px/24px, width 380px, white, radius 12px, panel shadow, padding
  `20px 24px 24px`, column with 16px gap. It contains, in order: "Metro" (narrow font, 22px/700),
  a 1px `#e5e7ec` rule, then the same content component as the phone sheet. The stop name is 32px.
  There is no grab handle and no separate wordmark chip.
- **Locate button**: absolute at right 24px, bottom 52px.
- **Attribution**: absolute at right 8px, bottom 8px.
- The Locating and LocationOff contents also render inside this panel on desktop. They were not
  drawn at desktop width, and reusing the panel is the intended behaviour.

**Sheet contents** (the same components in both layouts):
- **NearestStopContent** (Main):
  - Eyebrow `// NEAREST STOP`: mono 12px/700, letter-spacing .14em, `#dc1a32`.
  - A row, baseline-aligned with space-between:
    - An `h1` with the stop name: narrow font, 30px (32px on desktop), line-height 1.1, 700,
      letter-spacing -0.02em. The name is shown exactly as in the data, e.g. `República (desc)`.
    - A muted 14px span, `"{formatDistance} away"`.
  - A row with 8px gap: the muted 13px label "Lines", then one `LineChip` per `stop.lines`, in the
    data's order. A `LineChip` is at least 36px wide, 24px high, padding `0 8px`, radius 4px,
    13px/700, with the background set to the line colour from `network.lineColors` and the text
    from `readableTextColor`.
  - If there is a nearest bus, after a 1px rule:
    - The **NearestBusRow**: a 40×40 radius-8 square in the line colour with a white 20px bus icon,
      then the text "Nearest bus · {line}" (16px/600) over "Heading towards this stop" (13px muted),
      then the **ScheduledBadge** on the right. The badge is inline-flex with a 6px gap, padding
      `3px 8px`, radius 4px, background `#fbf1de`, text `#7a4e05`, 12px/600, with a 6px dot
      `#b97608` before the text "Scheduled".
    - A 12px muted paragraph: "Position estimated from the timetable at {HH:MM Lisbon}. Live
      positions replace it once a live feed is available." When `network.fetchedAt` is more than
      24h old, append " Timetable data from {D Mon YYYY} may be out of date."
  - Without a nearest bus, the rule, the row and the paragraph are not rendered, matching the
    design's `showBus = false`.
- **LocatingContent** (Locating): `aria-busy="true"`.
  - A row with 10px gap in blue: a spinning 20px arc icon (CSS rotate animation, disabled under
    `prefers-reduced-motion`), then an `h1` "Finding your location…" (18px/600, `#14161a`).
  - The paragraph "When your browser asks, allow location access so Metro can find the stop
    nearest to you." (14px, `#474d58`, line-height 1.45).
  - Then an `aria-hidden` skeleton: the `// NEAREST STOP` eyebrow in `#656c78`, a 168×28 bar, and
    two 36×24 chips, all `#eeeff2` with radius 4.
- **LocationOffContent** (LocationOff):
  - A row with 12px gap: a 40×40 radius-8 square in `#fbf1de`/`#7a4e05` holding the map-pin-off
    icon, then an `h1` "Location is off" (narrow font, 24px/700).
  - The paragraph "Metro uses your location to find your nearest stop. Allow location for this
    site in your browser, then try again. You can still explore the map." (14px, `#474d58`,
    line-height 1.5).
  - A full-width primary button "Try again": height 48px, radius 4px, `#dc1a32` (hover `#b31329`),
    white 16px/600 text, a visible focus ring.
- **DataErrorContent**: this is not in the design. It uses the same structure as LocationOff with
  the heading "Couldn't load Metrobus stops", the paragraph "Check your connection and try again."
  and a "Try again" button that re-runs the network fetch.
- The sheet `section` gets an `aria-label` that matches its content ("Nearest stop", "Finding your
  location", "Location unavailable") and `aria-live="polite"`.

**Which content is shown:**
1. geolocation `locating` → LocatingContent.
2. geolocation `unavailable` → LocationOffContent.
3. located and the network failed with no data → DataErrorContent.
4. located and the network is still loading → LocatingContent, with the heading changed to
   "Finding your nearest stop…".
5. located and the network is loaded → NearestStopContent.

## Map (`src/ui/map/`)

- **mapStyle.ts**: MapLibre style v8 with:
  - A `background` layer filled with `#f1f0eb`.
  - A raster source `osm`: tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png`, `tileSize` 256,
    `maxzoom` 19.
  - A raster layer with the muting paint: `raster-saturation: -0.75`, `raster-contrast: -0.15`,
    `raster-brightness-min: 0.15`, `raster-brightness-max: 1`. Tune visually towards the design's
    calm base (`#f1f0eb` land, white roads, `#cad9e5` water), keeping the map readable.
  - No glyphs or sprites are needed, because all labels are DOM markers.
- **MapView.tsx**:
  - Creates one `maplibregl.Map` on mount and removes it on unmount. It imports
    `maplibre-gl/dist/maplibre-gl.css`.
  - Initial view: centre `[-8.4196, 40.2056]` (Coimbra), zoom 13, `attributionControl: false`,
    `dragRotate: false`, touch pitch disabled.
  - After `load`, it adds:
    - The `routes` GeoJSON source and line layer: all 10 shapes, `line-color: ['get','color']`,
      `line-width: 4`, round caps and joins.
    - The `stops` source and circle layer: every stop, radius 4.5, white fill, stroke `#2c313a`
      width 2.
  - Props: `network`, `user: LatLng | null`, `nearestStop: Stop | null`, `bus: BusPosition | null`,
    `lineColors`.
  - DOM markers (`maplibregl.Marker` with custom elements from `markers.ts`) are created, updated
    or removed as the props change:
    - **User**: a 68px halo circle in `#1f5fa8` at .12 opacity with a 1px stroke at .35 opacity,
      around an 18px dot in `#1f5fa8` with a 3px white border.
    - **Nearest stop**: a 36px halo in `#dc1a32` at .16 opacity, an 18px red dot with a 3px white
      border, and a 6px white centre. Above it sits a white label pill with padding `4px 8px`,
      radius 4, small shadow, 13px/600 and the stop name. The pill's bottom edge is about 28px
      above the dot's centre.
    - **Bus**: a column with 3px gap:
      - A pill with padding `3px 8px 3px 6px`, a background in the line colour, text from
        `readableTextColor`, a `2px dashed #fff` border, radius 6, and the shadow
        `0 4px 12px rgba(20,22,26,.12),0 2px 4px rgba(20,22,26,.06)`. It holds a 14px bus icon and
        the line id at 13px/700.
      - Under it, a tag with padding `1px 6px`, `#fbf1de`/`#7a4e05`, radius 2, 11px/600,
        "Scheduled".
      - The bus marker gets `aria-label="Scheduled position of line {line} bus"`.
  - It exposes `fitTo(points: LatLng[], padding)` through `forwardRef`/`useImperativeHandle`. This
    calls `map.fitBounds` over the points with `maxZoom: 17` and `duration: 800`, or 0 when
    `prefers-reduced-motion` is set.
- **Smart zoom** (in `App.tsx`):
  - Points: the user, the nearest stop, and the nearest bus if there is one.
  - Padding:
    - Phone: `{ top: 72, left: 40, right: 80, bottom: sheetHeight + 48 }`. The sheet height is
      measured with a `ResizeObserver` on the bottom stack.
    - Desktop: `{ top: 64, right: 96, bottom: 64, left: 24 + 380 + 48 }`.
  - When it runs:
    1. Once, automatically, the first time the user's location, the nearest stop and the timetable
       evaluation are all available. If the trips are still loading after 3 s, it fits without the
       bus. It does not refit when the bus appears later.
    2. Whenever the locate button is pressed in the located state.
  - Position updates never refit on their own. The user's panning is respected, and the markers
    simply move.

## Hooks and state flow (`App.tsx`)

- **useGeolocation()** returns `{ status: 'locating' | 'located' | 'unavailable', position?: LatLng, accuracy?: number, retry() }`.
  - It uses `navigator.geolocation.watchPosition` with
    `{ enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }`.
  - Any error, or missing `navigator.geolocation`, sets the status to `unavailable`. This covers a
    denied permission, an unavailable position and a timeout.
  - A TIMEOUT that arrives after a fix has been obtained keeps the status at `located` with the
    last position.
  - `retry()` clears the watch, sets the status to `locating`, and starts watching again.
  - The watch is cleared on unmount.
- **useNetwork()** returns `{ network?, error?, retry() }`. It calls `fetchNetwork()` on mount, and
  again every 6 hours while the app is open. A later failure keeps the previous `network`.
- **useNow(5000)** returns a `Date` that updates every 5 s.
- **useTimetable(network, now)**:
  - Computes the Lisbon clock and the needed day types: today, plus yesterday while before 04:00.
  - Lazily calls `fetchTrips` for any day type it has not loaded yet and keeps the results in
    state as `Map<DayType, Trip[]>`.
  - Clears the map every 6 hours, alongside the network refresh.
  - Returns `{ tripsByDayType, loading }`.
- **Derived with `useMemo`**:
  - The nearest stop comes from `network.stops` and the geolocation position.
  - The nearest bus comes from `nearestApproachingBus(...)` and is recomputed on every `now` tick.
    A position is therefore re-estimated every 5 s without any network call.
- The `trips` files are about 600 KB each. They load after stops and shapes, so the nearest stop
  never waits for them.

## PWA (`vite-plugin-pwa`)

- `registerType: 'autoUpdate'`. `includeAssets`: favicon and apple-touch-icon.
- Manifest:
  - `name`: "Metro — Coimbra Metrobus"; `short_name`: "Metro"; `description` taken from the vision.
  - `theme_color`: `#ffffff`; `background_color`: `#f1f0eb`; `display`: `standalone`.
  - `start_url`: `.`; `scope`: `.`.
  - `icons`: the generated set, including the maskable icon.
- `workbox.runtimeCaching`:
  1. `url.origin === 'https://planearviagem.metromondego.pt' && url.pathname.startsWith('/data/')`
     → `StaleWhileRevalidate`, cache `metrobus-timetable`, `expiration { maxEntries: 10, maxAgeSeconds: 30 days }`,
     `cacheableResponse { statuses: [0, 200] }`.
  2. `url.origin === 'https://tile.openstreetmap.org'` → `CacheFirst`, cache `osm-tiles`,
     `expiration { maxEntries: 800, maxAgeSeconds: 7 days }`, `cacheableResponse { statuses: [0, 200] }`.
- `devOptions: { enabled: false }`.

## Testing

- **Fixtures** (`tests/fixtures/`), recorded once from the live URLs:
  - The full `stops.json` and `route-shapes.json`, which are small.
  - `trips-DU.sample.json`: a trimmed subset of `trips-DU.json`. It contains all U1 trips in both
    directions, one S1 Corvo short-turn trip, one S2 trip (which passes the asc/desc stops) and at
    least one trip with times past 24:00.
  - Add a `tests/fixtures/README.md` saying where each file came from, the date recorded, and how
    it was trimmed.
  - Tests never hit the live sources.
- **Vitest unit tests** (colocated `*.test.ts`), which are required:
  - Adapters:
    - Parse the fixtures.
    - Check the direction mapping (P-S and Ida map to outbound).
    - Check the `[lat, lng]` → `LatLng` conversion.
    - Check that a trip with an unknown stop name is skipped.
    - Check that a malformed stops file throws `SourceFormatError`.
  - geo: haversine against known distances, and `formatDistance` edge cases (995 m, 1000 m).
  - nearestStop: the nearest point, the tie-break, and an empty list returning null.
  - shape: the projection is monotonic, a stop that is not on a vertex projects correctly, and
    `pointAtDistance` clamps.
  - lisbonTime: summer and winter offsets (UTC+1 and UTC+0), a DST changeover date, and
    `parseServiceTime('25:12:28')`.
  - holidays: Easter 2026 (5 April) and 2027 (28 March), Good Friday, Corpus Christi, fixed dates,
    and Saturday/Sunday/weekday mapping.
  - interpolation: before the first stop gives null, exactly at a stop, midway between two stops,
    and equal consecutive times.
  - nearestBus:
    - Picks the soonest approaching trip.
    - Excludes trips that have passed the stop and trips that have not started.
    - After midnight, uses yesterday's day type with times past 24:00.
    - Returns null when there are no candidates.
  - color: U3 gets dark text, and U1 and S2 get white text.
- **Playwright e2e** (`tests/e2e/map.spec.ts`):
  - `page.route` serves the fixtures for `https://planearviagem.metromondego.pt/data/*.json`.
    `trips-*.json` gets the DU sample.
  - `page.route` answers `https://tile.openstreetmap.org/**` with a 1×1 transparent PNG.
  - `page.clock.install` sets a fixed weekday in Lisbon at 10:40, a time at which the fixture has a
    U1 trip heading to the chosen stop.
  - Scenarios:
    1. **Located** (context `geolocation` near Portagem, `permissions: ['geolocation']`): the sheet
       shows `// NEAREST STOP`, the h1 "Portagem", "m away", the line chips, and the "Nearest bus ·
       U1" row with its "Scheduled" badge. The locate button is enabled, and the bus marker with
       "Scheduled" is visible.
    2. **Denied** (no geolocation permission granted): "Location is off" and a "Try again" button
       are visible. The locate button has the label "Try to find my location". The map canvas is
       present.
    3. **Desktop project**: the located scenario renders inside the 380px panel, with "Metro"
       inside the panel.
    4. **Attribution**: "OpenStreetMap" links to the copyright page in both layouts.
  - Run both projects: mobile and desktop.

## Verification (the Developer runs all of these before handing over)

1. `npm install` with no flags succeeds on Node 24.
2. `npm run lint` is clean (ESLint and a Prettier check).
3. `npm run typecheck` (TS 7 `tsc`) is clean.
4. `npm test`: all Vitest suites pass.
5. `npx playwright install chromium`, then `npm run test:e2e`: all scenarios pass in both projects.
6. `npm run build` produces `dist/` with `manifest.webmanifest`, `sw.js` and the icons.
   `npm run preview` serves it.
7. Manual check in `npm run dev`, using Chrome DevTools device mode at 390×844 with a location
   override near Portagem (40.2075, -8.4307):
   - The map centres on the blue dot and fits the red Portagem marker, and a dashed "Scheduled" bus
     when one is in service.
   - The sheet matches the Main artboard.
   - Setting the location to "blocked" shows the LocationOff sheet, and "Try again" re-prompts.
   - At 1440×900, the layout matches the Desktop artboard.
   - The locate button refits.
8. The existing `.gitignore` lines are still present. Nothing under `documentation/`, `.claude/`
   or the root `CLAUDE.md` was modified.
