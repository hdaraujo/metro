# Timetable data and bus estimates

There is no backend. The browser fetches the Metro Mondego timetable ("Horários Metrobus")
directly, because the source allows cross-origin requests. Bus positions are **estimated from the
timetable**. Every estimate carries `source: 'scheduled'`, and the UI always marks it as estimated (see
`map-screen.md` for how).
There is no live feed yet.

The code is split in two:
- `src/sources/metrobusTimetable.ts` is the only code that knows the source's format.
- `src/domain/` holds pure logic with no DOM or React code.

## Source adapter

The files are fetched from `https://planearviagem.metromondego.pt/data/`. The data is
undocumented, has no stated licence, and may change without notice.

| File | Becomes | Notes |
| --- | --- | --- |
| `stops.json` | `Stop[]` | 39 stops. Names are unique. Câmara, Mercado and República each exist twice, as `(asc)` and `(desc)` stops, one per direction. |
| `route-shapes.json` | `Shape[]`, and the colour of each line | One shape per line and direction. Points are `[lat, lng]` in the source and `{lat, lng}` in the domain. |
| `trips-{DU,Sab,Dom}.json` | `Trip[]` | About 600 KB each. Trips reference stops **by name**. Times can run past `24:00` for trips after midnight. |

Things to know about the adapter:
- **Direction codes.** In the domain, `outbound` comes from `Ida` in the shapes and `P-S` in the
  trips, and `inbound` comes from `Volta` and `S-P`. A shape is looked up by `(line, direction)`,
  never by parsing its id.
- **Format errors.** A required field that is missing or has the wrong type throws
  `SourceFormatError`, which fails loudly when the source format changes. The exception is a trip
  with an unknown stop name or an unknown direction: that trip is skipped, with one
  `console.warn` for each distinct problem.
- **Load order.** Stops and shapes (together, the `Network`) are fetched first, so the nearest
  stop never waits for the trips. The trips load afterwards, one day type at a time, and only the
  day types needed right now are fetched.
- **Refreshing.** The network and the trips are re-fetched every 6 hours while the app is open.
  If a refresh fails, the last good data is kept. If a day type's trips fail to load, that day type
  is retried after 60 s.
- **`fetchedAt` is usually "now".** It is meant to come from the response's `Date` header. That
  header is not CORS-safelisted, so browsers usually hide it, and the adapter falls back to the
  current time. As a result, the "Timetable data from … may be out of date" note, which appears
  after 24 hours, rarely shows.

## Time and day types

- Timetable times are Europe/Lisbon wall-clock time, counted in seconds since the service day's
  midnight (`lisbonTime.ts`, which uses `Intl` with no date library).
- `dayTypeFor(date)` picks the timetable. Portuguese national public holidays and Sundays use
  `Dom`, Saturdays use `Sab`, and every other day uses `DU`. The holidays are the ten fixed dates,
  plus Good Friday, Easter Sunday and Corpus Christi, which are computed from Easter.
- The Coimbra municipal holiday (4 July) is deliberately **not** treated as a holiday. It is an
  open question whether Metrobus runs its Sunday timetable that day.
- Before 04:00 in Lisbon, yesterday's service day is also considered, with its times offset by
  24 h, so that trips running after midnight are found.

## Nearest stop

The nearest stop is the one with the smallest straight-line (haversine) distance from the user.
Every stop is considered, including suburban-only ones. Ties go to the lower `id`. There is no
walking-distance or routing logic, which the vision rules out.

## Buses in service

`busesInService` in `buses.ts` estimates **every bus running right now** across the whole
network. It takes the nearest stop, or `null` when none is known yet, and returns one
`BusPosition` per trip:

1. **In service.** A trip is in service, on today's service day (or on yesterday's before 04:00),
   when it **has left its first stop** and **has not reached its last**. A trip that has not left
   its first stop is not shown, even if it would reach the stop sooner than any bus already
   running. If the same `tripId` turns up on both service days, today's is kept.
2. **Position.** The bus is placed along its line's shape. Each of the trip's stops is projected
   onto the shape in order, and each projection only searches the shape from the previous stop's
   segment onwards, so the distances never decrease. This keeps stops that sit beside the line,
   such as the asc/desc pairs, on the correct stretch. The distance along the shape is then
   interpolated linearly in time between the scheduled stop times on either side of now. Stop
   distances are memoised for each shape and stop sequence. The `(line, direction)` → shape
   lookup is built once for each shapes map (in a module-level `WeakMap`), because the function
   runs every second over about 450 weekday trips.
3. **Robustness.** A trip is silently skipped if it has no shape, if no position can be
   estimated, or if it references a stop that is not known. One bad trip must never blank the map.
4. **Countdown.** When a stop is given, a bus is *approaching* if its trip has a call at that stop
   **later than now**. The countdown uses the first such call. That bus gets `towardsStopId` and
   `arrivalAtStopSeconds`, the whole seconds until the scheduled call, always at least 1. Every
   other bus has `null` in both fields. That covers buses that have passed the stop, buses that
   never call there, and every bus when there is no stop.
5. **Order (deterministic).** Approaching buses come first, soonest first. The rest follow,
   ordered by line. Ties are broken by `tripId`. `approachingBuses()` keeps only the approaching
   buses, in the same order. `soonestPerDirection()` takes that list and keeps the first bus of
   each `direction` (so at most two, soonest first); those are the buses smart zoom frames.

Each bus also carries the trip's `destination` as it appears in the data, `source: 'scheduled'`,
and `at`, the time of the estimate.

`countdown.ts` formats the countdowns:
- `formatCountdown` gives `M:SS` with uncapped minutes: `184` → `3:04`, `3785` → `63:05`. Negative
  values clamp to `0:00`.
- `spokenCountdown` gives the screen-reader text: `184` → "3 minutes 4 seconds", `61` → "1 minute
  1 second", `120` → "2 minutes".

## Line colours

Line colours come from the data (S1 `#0080FF`, S2 `#FF0000`, U1 `#2B6CC4`, U2 `#FF5349`,
U3 `#00FF40`). `readableTextColor` chooses white or `#14161a` text, whichever has the higher
WCAG contrast ratio. With the current colours, **only U1 gets white text**. S1, S2, U2 and U3
all get dark text, which is correct by contrast even though it may look unexpected on the red and
blue lines.
