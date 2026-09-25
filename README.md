# Metro

## What Metro is

Metro is a mobile-first web app for Coimbra Metrobus riders. It opens straight onto a map showing
where you are, your nearest Metrobus stop and the bus heading towards it, so you can glance at it
and decide when to leave. Until a live feed exists, bus positions are estimated from the timetable
and always labelled "Scheduled"; estimated data is never shown as live. There are no accounts and
nothing to set up.

## Requirements

- Node.js 24 (see `.nvmrc`) and the npm that comes with it.

## Getting started

```sh
npm install
npm run dev
```

Open the URL Vite prints (normally `http://localhost:5173`) and allow location access when asked.
To try it away from Coimbra, override the location in the browser's developer tools, e.g. near
Portagem: `40.2075, -8.4307`.

## Scripts

| Script               | What it does                                                        |
| -------------------- | ------------------------------------------------------------------- |
| `npm run dev`        | Vite dev server with hot reload (the service worker is off in dev). |
| `npm run build`      | Type-checks, then builds the static app into `dist/`.               |
| `npm run preview`    | Serves the built `dist/` locally.                                   |
| `npm run typecheck`  | Type-checks with TypeScript 7 (`tsc --noEmit`).                     |
| `npm test`           | Runs the Vitest unit tests once.                                    |
| `npm run test:watch` | Runs Vitest in watch mode.                                          |
| `npm run test:e2e`   | Builds, serves and runs the Playwright tests (mobile and desktop).  |
| `npm run lint`       | ESLint, then a Prettier formatting check.                           |
| `npm run format`     | Formats everything with Prettier.                                   |
| `npm run icons`      | Regenerates the PWA icons in `public/` from `public/icon.svg`.      |

Before the first `npm run test:e2e`, install the browser once with `npx playwright install chromium`.

## Project layout

```
src/
  main.tsx        entry point: renders the app and registers the service worker
  sources/        source adapters: fetch and parse third-party data into our domain model
  domain/         pure logic and types (geometry, time, holidays, nearest stop, bus estimates)
  ui/             React: the app, map (MapLibre), sheet, hooks and styles
tests/
  fixtures/       recorded source data used by every test (see its README)
  e2e/            Playwright end-to-end tests
public/           icon source and generated PWA icons
```

Only `src/sources/` knows the data sources' formats; `src/domain/` has no DOM or React code.

This repository also holds the product's specifications: `documentation/` (the vision, the tech
stack and what has shipped) and `plays/` (one folder per unit of work). See [CLAUDE.md](CLAUDE.md)
for how specifications and plays work.

## Data sources

The app has no backend. The browser fetches the Metro Mondego timetable ("Horários Metrobus")
directly; the source allows cross-origin requests.

- `https://planearviagem.metromondego.pt/data/stops.json`: stops, with their lines and coordinates.
- `https://planearviagem.metromondego.pt/data/route-shapes.json`: route polylines per line and
  direction, and the line colours.
- `https://planearviagem.metromondego.pt/data/trips-{DU|Sab|Dom}.json`: the trips and their stop
  times for weekdays, Saturdays and Sundays. Portuguese public holidays use the Sunday timetable.

This data is **undocumented, has no stated licence and may change without notice**. The parser
validates what it uses and fails loudly on a format change.

Bus positions are **estimated from the timetable**: a bus is placed along its route by
interpolating between the scheduled times of the stops before and after it. They are always
labelled "Scheduled". Real-time positions will replace them once Metro Mondego publishes a live
feed.

## Map and attribution

The base map uses OpenStreetMap's standard raster tiles (`tile.openstreetmap.org`), muted so the
routes stand out, and credits "© OpenStreetMap contributors" on screen at all times. The
[OSM tile usage policy](https://operations.osmfoundation.org/policies/tiles/) allows personal and
light use like this. **Switch to a dedicated tile provider before any wider launch.** The service
worker caches the tiles it has shown for a week.

## Tooling notes

- **TypeScript 7 and typescript-eslint.** Type checking uses TypeScript 7. typescript-eslint 8.70
  needs the TypeScript JS API with `typescript >=4.8.4 <6.1.0`, which the `typescript@7` package no
  longer exposes. The first arrangement tried was to keep `typescript@7` and use npm `overrides` to
  point typescript-eslint's `typescript` at `@typescript/typescript6`. It does not work, because
  that dependency is a _peer_ dependency and resolves against the root `typescript@7`, so a plain
  `npm install` fails with `ERESOLVE`. The fallback is used instead:
  - `"typescript": "npm:@typescript/typescript6@6.0.2"` provides the TS 6 API for typescript-eslint.
  - `"typescript7": "npm:typescript@7.0.2"` provides the TS 7 compiler.
  - `@typescript/typescript6` pulls in `typescript@6.0.3` (as `@typescript/old`), whose `tsc` wins
    the `node_modules/.bin/tsc` link. So `npm run typecheck` calls TS 7's binary by path
    (`node ./node_modules/typescript7/bin/tsc`). Running `npx tsc` gives you TS 6.
  - ESLint uses only the non-type-aware typescript-eslint configs, so it never builds a TS program.
    Vite and Vitest transpile on their own and don't use the `typescript` package.
- **`@vite-pwa/assets-generator` is on 1.x.** `vite-plugin-pwa` 1.3 declares an optional peer
  dependency on `^1.0.0`, so 2.0 cannot be installed without `--force`.
- **MapLibre's worker.** MapLibre GL 6 loads its web worker from a file next to its own module,
  which a bundle doesn't have. `src/ui/map/MapView.tsx` imports the worker with Vite's
  `?worker&url` and passes the URL to `setWorkerUrl`.

## Deployment

`npm run build` produces a static `dist/` folder (the app, a web manifest and a service worker)
with relative paths, so any static host or sub-path works. The host is deliberately undecided.
