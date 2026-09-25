# Test fixtures

Recorded source data for the Metro Mondego timetable ("Horários Metrobus"). Tests use only these
files and never call the live sources.

All files were recorded on **2026-09-25 at 19:00 UTC** from
`https://planearviagem.metromondego.pt/data/` (the response had
`Last-Modified: Fri, 25 Sep 2026 18:00:33 GMT`).

| File                    | Source                  | How it was trimmed                          |
| ----------------------- | ----------------------- | ------------------------------------------- |
| `stops.json`            | `data/stops.json`       | Not trimmed: the full file, byte for byte.  |
| `route-shapes.json`     | `data/route-shapes.json` | Not trimmed: the full file, byte for byte. |
| `trips-DU.sample.json`  | `data/trips-DU.json`    | A subset of the weekday trips (see below). The trips themselves are unchanged. |

`trips-DU.sample.json` keeps 96 of the 452 weekday trips:

- every U1 trip in both directions (49 `P-S`, 44 `S-P`);
- `s1-DU-0-633`: S1 short-turn trip Coimbra B → Corvo at 07:40;
- `s2-DU-0-701`: S2 trip from República (desc) at 10:20, which passes the `(desc)` stops;
- `s1-DU-0-726`: S1 trip Coimbra B → Serpins, with stop times past 24:00 (up to `25:29:28`).

The end-to-end test fixes the clock at a weekday 10:44 in Lisbon. At that time exactly three buses
are running in this sample: U1 trip `u1-DU-0-852` to Vale das Flores (Coimbra B 10:41 → Portagem
10:47:04) is the soonest bus approaching Portagem, U1 trip `u1-DU-1-823` to Coimbra B reaches it at
10:53:18, and S2 trip `s2-DU-0-701` to Serpins already passed it at 10:25:35.

To re-record, download the files again with `curl` and re-apply the same filter by trip `id` and
`line`.
