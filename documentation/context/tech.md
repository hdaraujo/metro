<!--
  Tech Stack — maintained by the Autopilot Architect.
  Lives in the PROJECT ROOT and is loaded into every agent's context (like CLAUDE.md),
  so keep it CONCISE. A play may touch every repository or just a subset, so the
  per-repository section below must make it explicit which technology each repo uses —
  that is the Developer's source of truth for what to build with, where.
-->

# Tech Stack

## Architecture overview
- **One repo (`metro`), npm-workspaces monorepo:** `apps/api` (Node backend), `apps/web`
  (React PWA), `packages/shared` (TypeScript types and pure logic shared by both).
- **Data flow:** data source → `api` (fetch, cache, normalise, compute) → small JSON API → `web`.
  The web app never calls third-party data sources directly.
- **Data sources, behind source adapters in `api`.** Each source is one adapter that maps into
  our own domain model (stops, line shapes, trips). Nothing outside an adapter knows a source's format.
  - **Timetable (current):** Horários Metrobus, the Metro Mondego planner app. Undocumented
    static JSON, no stated licence, and it may change without notice:
    - `https://planearviagem.metromondego.pt/data/stops.json`: stops with id, code, name,
      coords and lines.
    - `…/data/route-shapes.json`: polylines per line and direction (S1, S2, U1, U2, U3 ×
      Ida/Volta), plus line colours.
    - `…/data/trips-{DU|Sab|Dom}.json`: trips with a time at each stop, per day type. Trips
      reference stops **by name**. Public holidays follow the Sunday timetable (`Dom`), using a
      Portuguese holiday calendar.
  - **Real time (later):** the Agit Planner API (`https://api.planner.agit.pt/docs/v1/`), dataset
    `metro-mondego`. It has `realtime/vehicles` and `realtime/trip-updates` endpoints (JSON and
    GTFS-RT), which return 503 "not-configured" until Metro Mondego connects a source. It also
    offers static NeTEx data under CC-BY 4.0, which requires attribution if we use it.
- **Bus positions:** for now, *estimated* positions, interpolated along the route shape between a
  trip's scheduled stop times. Once a live feed is available it takes priority, and estimates
  remain the fallback. Every position and ETA carries a `source` field (`scheduled` | `live`)
  and a timestamp, and the UI always shows which one it is.
- **"Minutes away":** calculated in `api` for a given stop, for the approaching buses on each
  line and direction.
- **Updates:** `web` polls `api` every few seconds (the interval is configurable).
- **No database, no auth, no accounts.** State is an in-memory cache of source data, refreshed
  periodically.
- **Deployment:** not decided yet, and deliberately deferred. Local development only; nothing
  should assume a particular host.

## Conventions
- **TypeScript 7** everywhere, in `strict` mode. **Node 24.** Use the latest stable versions of all
  dependencies. ES modules only.
- **npm workspaces.** Root scripts run across all workspaces.
- **ESLint + Prettier.** Code must be lint-clean and formatted before commit.
- **Testing:** Vitest for unit tests (required for adapters, interpolation, ETA and nearest-stop
  logic). Playwright for end-to-end tests of key flows. Tests use recorded fixtures of source
  data and never hit live sources.
- **Errors:** if a source fails, keep serving the last good cached data, flagged as stale with its
  age. Never present stale or estimated data as live.
- **Git:** one branch per play (see the root CLAUDE.md). Commit messages are imperative and short.
- **Time zone:** schedules are in Europe/Lisbon local time. API timestamps are UTC ISO 8601.

## Per-repository tech stack

### metro
- **Purpose:** the whole product (backend API, web PWA, shared code) plus the product's
  specifications (`documentation/`, `plays/`).
- **Language / runtime:** TypeScript 7 / Node 24 (the API and tooling). Browser (the web app).
- **Frameworks / key libraries:**
  - `apps/web`: React, Vite, `vite-plugin-pwa` (installable PWA with manifest and service
    worker), MapLibre GL JS on OpenStreetMap tiles (with attribution), browser Geolocation API.
    Mobile-first, responsive to desktop.
  - `apps/api`: Node 24 HTTP server with a minimal framework (e.g. Fastify) and the built-in
    `fetch`. Holds the source adapters, cache, interpolation and ETA logic.
  - `packages/shared`: domain types (Stop, Line, Shape, Trip, BusPosition, Eta) and pure
    geo/time helpers.
- **Build / test / run:** from the repo root: `npm install`, then `npm run dev` (API and Vite
  dev server together; Vite proxies `/api` to the API), `npm run build`, `npm test` (Vitest),
  `npm run test:e2e` (Playwright), `npm run lint`.
- **Notes:** keep source-specific parsing inside `apps/api` adapters. Anything the web app
  needs goes through `packages/shared` types. Show attribution for map tiles, plus data
  attribution where a licence requires it.
