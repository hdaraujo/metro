<!--
  Tech Stack — maintained by the Autopilot Architect.
  Lives in the PROJECT ROOT and is loaded into every agent's context (like CLAUDE.md),
  so keep it CONCISE. A play may touch every repository or just a subset, so the
  per-repository section below must make it explicit which technology each repo uses —
  that is the Developer's source of truth for what to build with, where.
-->

# Tech Stack

## Architecture overview
- **One static, client-side React PWA** at the root of the `metro` repository. There is no
  backend, database, auth or accounts. The browser does everything: it fetches, parses, estimates
  and renders.
- **Code layers (in `src/`):**
  - `sources/`: source adapters. Each one fetches a third-party source and maps it into our own
    domain model (stops, shapes, trips). Only an adapter knows its source's format.
  - `domain/`: pure logic and types (geo, Lisbon time, holidays, nearest stop, interpolation,
    countdowns). No DOM or React code.
  - `ui/`: React, the MapLibre map, the sheet, hooks and plain CSS.
- **Data sources:**
  - **Timetable (current):** Horários Metrobus, the Metro Mondego planner app, fetched directly
    by the browser (the source allows CORS). It is undocumented static JSON with no stated
    licence, and it may change without notice:
    - `https://planearviagem.metromondego.pt/data/stops.json`: stops with id, code, name,
      coords and lines.
    - `…/data/route-shapes.json`: polylines per line and direction (S1, S2, U1, U2, U3 ×
      Ida/Volta), plus line colours.
    - `…/data/trips-{DU|Sab|Dom}.json`: trips with a time at each stop, per day type. Trips
      reference stops **by name**. Public holidays follow the Sunday timetable (`Dom`), using a
      Portuguese holiday calendar.

    The data is re-fetched every 6 hours while the app is open.
  - **Real time (later):** the Agit Planner API (`https://api.planner.agit.pt/docs/v1/`), dataset
    `metro-mondego`. It has `realtime/vehicles` and `realtime/trip-updates` endpoints (JSON and
    GTFS-RT), which return 503 "not-configured" until Metro Mondego connects a source. It also
    offers static NeTEx data under CC-BY 4.0, which requires attribution if we use it. When it is
    adopted, it becomes a new adapter. Whether the browser can call it directly (CORS) or it needs
    a proxy is a decision for that play.
- **Bus positions:** *estimated* for now, interpolated along the route shape between a trip's
  scheduled stop times, and recomputed in the browser every second with no network request. A live
  feed will take priority once available, and estimates stay as the fallback. Every position and
  ETA carries `source` (`scheduled` | `live`) and a timestamp, and the UI always shows which one it
  is.
- **Offline:** a Workbox service worker (`vite-plugin-pwa`) caches the app shell, the timetable
  (StaleWhileRevalidate) and the OSM tiles (CacheFirst), so the app opens and estimates with no
  network.
- **Deployment:** static files on GitHub Pages at `https://hdaraujo.github.io/metro/`, deployed by
  `.github/workflows/pages.yml` on every push to `main` (lint, unit tests, build, deploy). Every
  path is relative (`base: './'`), so nothing assumes a particular host or sub-path.

## Conventions
- **TypeScript 7** in `strict` mode, **Node 24** for tooling, ES modules only. Use the latest
  stable versions of all dependencies. Keep runtime dependencies minimal: React, MapLibre and
  `workbox-window` only, with no state, date or CSS libraries. Time zones use `Intl`.
- **ESLint + Prettier.** Code must be lint-clean and formatted before commit.
- **Testing:** Vitest unit tests sit next to their code (`src/**/*.test.ts`) and are required for
  adapters and domain logic. Playwright end-to-end tests (`tests/e2e/`, mobile and desktop
  projects) run against the production build. All tests use recorded fixtures
  (`tests/fixtures/`) and never hit live sources.
- **Errors:** if a source fails, keep the last good data and flag it as stale with its age. A
  source format change fails loudly (`SourceFormatError`). One bad trip must never blank the map.
  Never present stale or estimated data as live.
- **Git:** one branch per play (see the root CLAUDE.md). Commit messages are imperative and short.
- **Time zone:** schedules are Europe/Lisbon local time. Stored and exchanged timestamps are UTC
  ISO 8601.

## Per-repository tech stack

### metro
- **Purpose:** the whole product (a client-side web PWA) plus the product's specifications
  (`documentation/`, `plays/`).
- **Language / runtime:** TypeScript 7, running in the browser. Node 24 for the tooling.
- **Frameworks / key libraries:** React 19, Vite, `vite-plugin-pwa` (manifest and Workbox service
  worker), MapLibre GL JS on muted OpenStreetMap raster tiles, and the browser Geolocation API.
  Styling is plain CSS with custom properties (`src/ui/styles/`). Mobile-first, responsive to
  desktop.
- **Build / test / run:** `npm install`, then `npm run dev` (the Vite dev server, with the
  service worker off), `npm run build` (typecheck + build to `dist/`), `npm test` (Vitest),
  `npm run test:e2e` (Playwright, after `npx playwright install chromium` once), and `npm run lint`.
- **Notes:**
  - Type checking uses TS 7 via `npm run typecheck`, which calls
    `node ./node_modules/typescript7/bin/tsc`. The `typescript` package is aliased to TS 6 for
    typescript-eslint, so `npx tsc` runs TS 6, not TS 7.
  - Always show the "© OpenStreetMap contributors" attribution, plus data attribution wherever a
    licence requires it.
  - OSM's standard tiles are for light use only. Move to a dedicated tile provider before any
    wider launch.
