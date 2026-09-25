# App platform

Metro is one static, client-side React PWA at the root of the `metro` repository. It has no
server, no database and no accounts. The code is organised as follows:
- `src/sources/`: data source adapters.
- `src/domain/`: pure logic and types.
- `src/ui/`: React, MapLibre and CSS.
- `tests/`: fixtures and Playwright end-to-end tests.

`README.md` lists the scripts and how to run the app.

## Build and hosting

- Vite builds the app into `dist/` with `base: './'`, so every path is relative and the build
  works on any static host or under any sub-path.
- It is hosted on GitHub Pages, at `https://hdaraujo.github.io/metro/`. The
  `.github/workflows/pages.yml` workflow runs on every push to `main` and on demand: `npm ci`,
  `npm run lint`, `npm test`, `npm run build`, then it uploads `dist/` and deploys it. The
  repository's Pages source must be set to "GitHub Actions". The Playwright tests are not part
  of the workflow.
- The build is a single bundle. MapLibre alone is about 1 MB, and the chunk-size warning limit is
  raised to allow it.
- MapLibre GL 6 loads its web worker from a file next to its own module, and a bundle has no such
  file. `MapView.tsx` builds the worker with Vite's `?worker&url` and passes the result to
  `setWorkerUrl`. Keep this if MapLibre is upgraded or moved.

## PWA and offline caching

`vite-plugin-pwa` produces the manifest and a Workbox service worker with
`registerType: 'autoUpdate'`. The worker is registered immediately in `main.tsx`, and it is off in
`npm run dev`.

| Cache | Matches | Strategy | Limits |
| --- | --- | --- | --- |
| `metrobus-timetable` | `planearviagem.metromondego.pt/data/*` | StaleWhileRevalidate | 10 entries, 30 days |
| `osm-tiles` | `tile.openstreetmap.org` | CacheFirst | 800 tiles, 7 days |

With these caches, the app still opens and estimates buses with no network, using the last
timetable it saw. The estimates stay labelled "Scheduled", because they are never live anyway.

The icons are generated from `public/icon.svg` by `npm run icons`, and the generated PNGs are
committed.

## Map tiles

The app uses OpenStreetMap's standard tile servers. Their usage policy allows personal and light
use only. **Move to a dedicated tile provider before any wider launch.** The attribution must stay
visible on screen.

## Tooling constraints

- **TypeScript 7 does the type checking, but ESLint needs the TypeScript 6 API.**
  typescript-eslint requires the TypeScript JS API, which the `typescript@7` package no longer
  exposes. npm overrides cannot fix this, because it is a peer dependency. The arrangement is:
  - `typescript` is aliased to `@typescript/typescript6`, which serves ESLint.
  - `typescript7` is aliased to `typescript@7`, which serves `npm run typecheck`. That script calls
    `node ./node_modules/typescript7/bin/tsc` by path.
  - `npx tsc` runs TS 6, not TS 7.
  - ESLint uses only the non-type-aware typescript-eslint configs.
- `@vite-pwa/assets-generator` stays on 1.x, because `vite-plugin-pwa` 1.3 declares a peer
  dependency on `^1.0.0`.
- There are no runtime libraries beyond React, MapLibre and `workbox-window`: no state library, no
  date library and no CSS framework. Time zones are handled with `Intl`.

## Testing

- **Unit tests (Vitest).** They sit next to their code as `src/**/*.test.ts` and cover the adapter
  and every domain module.
- **End-to-end tests (Playwright).** They are in `tests/e2e/`. They run against the production
  build (`npm run build` followed by `preview` on port 4173), in a `mobile` project (390×844,
  touch) and a `desktop` project (1440×900). The service worker is blocked during these tests.
  - Source requests are answered from `tests/fixtures/`.
  - Tile requests are answered with a 1×1 PNG.
  - The clock is fixed at a weekday, 10:44 in Lisbon.
- **Fixtures.** `tests/fixtures/` holds recordings of the live source. `stops.json` and
  `route-shapes.json` are full copies. `trips-DU.sample.json` is a trimmed weekday sample. At the
  e2e scenario's time, the sample has exactly three buses running, and the e2e tests depend on all
  three: U1 `u1-DU-0-852` to Vale das Flores (Portagem in 3:04), U1 `u1-DU-1-823` to Coimbra B
  (Portagem in 9:18), and S2 `s2-DU-0-701` to Serpins, which has already passed Portagem. The
  fixtures `README.md`
  explains how to re-record them. Tests never call the live source.
