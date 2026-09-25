# Timetable data and bus estimates

There is no backend. The browser fetches the Metro Mondego timetable ("Horários Metrobus")
directly, because the source allows cross-origin requests. Bus positions are **estimated from the
timetable**. Every estimate carries `source: 'scheduled'`, and the UI always labels it "Scheduled".
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

## Nearest approaching bus

`nearestApproachingBus` in `nearestBus.ts` works as follows:

1. **Candidates.** A candidate is a trip, on today's service day (or on yesterday's before
   04:00), that **has already started** and **has not yet reached** the nearest stop. Trips that
   have not left their first stop are ignored, even if they would arrive sooner than any bus
   already running.
2. **Choice.** The candidate with the soonest scheduled arrival at the stop wins.
3. **Position.** The bus is placed along its line's shape. Each of the trip's stops is projected
   onto the shape in order, and each projection only searches the shape from the previous stop's
   segment onwards, so the distances never decrease. This keeps stops that sit beside the line,
   such as the asc/desc pairs, on the correct stretch. The distance along the shape is then
   interpolated linearly in time between the scheduled stop times on either side of now. Stop
   distances are memoised for each shape and stop sequence.
4. **No bus.** The result is `null` when there is no candidate, for example late at night or at a
   terminus with no trip in progress.

The result is a `BusPosition` that includes `arrivalAtStopSeconds`, the time until the scheduled
arrival. This is the basis for a future "minutes away" display, which the UI does not show yet.

## Line colours

Line colours come from the data (S1 `#0080FF`, S2 `#FF0000`, U1 `#2B6CC4`, U2 `#FF5349`,
U3 `#00FF40`). `readableTextColor` chooses white or `#14161a` text, whichever has the higher
WCAG contrast ratio. With the current colours, **only U1 gets white text**. S1, S2, U2 and U3
all get dark text, which is correct by contrast even though it may look unexpected on the red and
blue lines.
