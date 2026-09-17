# QA: Place & address search (Plan Route panel)

Hand-off test plan for the search overhaul. Run every section, record results in
the table at the bottom, then fix what fails (see **Fixing** at the end).

## What changed

| Area | File |
| --- | --- |
| Server proxy: Philly-first Photon pass + nationwide widening, Nominatim blend, caching, Nominatim pacing (~1 req/s), timeouts | `app/api/geocode/route.ts` |
| Pure logic: result mapping, unit stripping, street normalisation, Philly-first ranking, dedupe | `lib/search-results.ts` |
| Client fetch: `near` bias, abort signal, in-memory cache | `lib/nominatim-service.ts` |
| UI: 250 ms debounce, stale-request abort, ↑/↓/Enter, "no matches" hint, richer rows | `components/map/RoutePlanningPanel.tsx` |
| Types: `kind`, `category`, `houseNumber`, `street` on `GeocodingResult` | `types/speedbumps.ts` |
| Unit tests | `tests/search-results.test.ts`, `tests/geocode-route.test.ts` |

How search works: every query goes to **Photon** (finds stores and partial text),
searching greater Philly first — Photon's `bbox` is a hard filter, so the metro
pass is re-run nationwide only when it finds fewer than 2 results, or is skipped
when the query spells out another state ("..., washington dc"). Queries that
start with a house number also go to **Nominatim** (exact addresses). If Photon
already has the typed house number on the typed street, Nominatim gets a 400 ms
grace period. Otherwise the server waits up to 8 s for it. Results are deduped
within 75 m.

**Ranking (Philly first)** — `mergeSearchResults`, in order:

1. results matching the street or the words typed, above anything that is merely nearby;
2. the city the user typed, when they typed one ("..., norristown pa");
3. greater-Philly results, unless the query names a locality in another state;
4. match quality (1234 South Street before 1234 South 21st Street);
5. distance from the user — **or from City Hall when location is unavailable**;
6. provider order (Photon, then Nominatim).

## Setup

1. `npm install && npm run dev` then open `http://localhost:3000/map`.
2. **Allow location access** (or use DevTools → Sensors → Location, e.g. lat `39.9496`, lng `-75.1503`). Distance labels and "nearby first" ranking need it.
3. Open DevTools → Network, filter `geocode`.
4. Open the planner: tap the **"Where to in Philly?"** bar.
5. Baseline must pass before manual QA:
   ```bash
   npx tsc --noEmit && npm run lint && npm test
   ```

---

## A. API checks (no UI)

Run with the dev server up. `near` is Center City. Space calls ~1 s apart.

```bash
q() { curl -s -w '  [%{http_code} %{time_total}s]\n' \
  "http://localhost:3000/api/geocode?near=39.95,-75.16&q=$(python3 -c 'import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))' "$1")" \
  | python3 -c 'import sys,json; raw=sys.stdin.read(); b,_,t=raw.rpartition("  ["); d=json.loads(b); print(len(d) if isinstance(d,list) else d, "|", " || ".join(r["shortName"] for r in d[:3]) if isinstance(d,list) else "", "  ["+t.strip())'; }
```

| # | Query | Expect **first** result | Notes |
| --- | --- | --- | --- |
| A1 | `wawa` | A Wawa in Center City / nearby, category "Convenience store" | Not the town "Wawa, PA" |
| A2 | `trader joes` | Trader Joe's, 2121 Market St or 1324 Arch St | Apostrophe missing on purpose |
| A3 | `cvs` | A CVS Pharmacy inside Philadelphia | |
| A4 | `pizza` | A pizza place, mostly Philly | Stray odd labels OK (OSM data) |
| A5 | `1500 mark` | Something at **1500 Market Street** | Half-typed street |
| A6 | `1234 south st` | **1234 South Street**, South Philadelphia | NOT 1234 S 21st/18th St |
| A7 | `1234 South Street, Philadelphia, PA 19147` | 1234 South Street | |
| A8 | `1600 n broad st apt 2` | Result at **1600 North Broad Street** | Unit is stripped |
| A9 | `10 S 2nd St #5` | 10 South 2nd Street | `#5` is stripped |
| A10 | `1901 JFK Blvd` | 1901 John F. Kennedy Boulevard | Abbreviation |
| A11 | `8 Haddon Ave, Haddonfield NJ` | **8 South/North Haddon Avenue, Haddonfield** | Suburb/NJ address |
| A12 | `123 E Main St, Norristown, PA` | 123 East Main Street, Norristown | |
| A13 | `4500 frankford av` | 4500 Frankford Avenue | |
| A14 | `5th and market` | Something on 5th St / Market St | Intersections are weak (known) |
| A15 | `99999 zzqx rd` | `[]` (0 results), HTTP 200 | Not an error |
| A16 | *(empty)* `q=` | `[]` | |
| A17 | Repeat A6 | Same results, time **< 50 ms** | Server cache hit |
| A18 | `reverse=39.9496,-75.1503` | One address object near Independence Hall | Reverse geocode still works |
| A19 | `reverse=abc` | HTTP 400 with `error` | |
| A22 | `1234 south st` with `near=` omitted entirely | 1234 South Street, Philadelphia first | No GPS: ranking falls back to City Hall |
| A23 | `1600 pennsylvania ave, washington dc` | The White House / 1600 Pennsylvania Ave NW, DC | Out-of-state query is not dragged back to Philly |
| A24 | `indiana avenue` | Indiana Avenue, Philadelphia | A state name used as a street is still local |
| A25 | `statue of liberty` | The one in New York | Nothing local matches, so the search widens |

Also check:
- **A20:** no response takes longer than ~9 s (Photon timeout is 4 s, Nominatim 8 s;
  the widening pass adds up to 3 s, and only runs when the metro pass is thin).
- **A21:** fire 5 different house-number queries at once (`&` each curl). All return 200, none 502. Nominatim calls are queued, not rejected.

## B. Typing & suggestions (Destination field)

| # | Steps | Expected |
| --- | --- | --- |
| B1 | Type `trader joes` slowly | Spinner, then rows with store icon, name, blue "Grocery store" label, address, distance on the right |
| B2 | Type `wawa` fast, one burst | Network: earlier in-flight `geocode` requests show **(canceled)**. Only the last one finishes. No flicker to old results |
| B3 | Type `1234 south st` | First row is 1234 South Street (house icon) |
| B4 | Type `1600 n broad st apt 2` | Rows at 1600 N Broad St |
| B5 | Type `99999 zzqx rd`, wait | Dropdown shows "**No matches yet — try adding a city or ZIP**". Not blank |
| B6 | Clear the field (select all, delete) | Dropdown closes, spinner stops (not stuck) |
| B7 | Type the B1 query again | Instant (client cache). No new network request |
| B8 | Deny location, reload, search `wawa` | Still works, no distance labels, no console errors |
| B9 | 400 px wide (DevTools device mode) | Long names truncate, distance stays visible, no horizontal scroll |

## C. Keyboard & Enter (the reported bug)

| # | Steps | Expected |
| --- | --- | --- |
| C1 | Type `trader joes`, wait for rows, press **Enter** | First row is selected; field shows "Trader Joe's" with an ✕ |
| C2 | Type `trader joes`, wait, press **↓ ↓** then **Enter** | The 3rd row is highlighted while arrowing and gets selected, not the first |
| C3 | ↓ past the last row / ↑ above the first | Wraps around; highlighted row scrolls into view |
| C4 | Type `8 Haddon Ave, Haddonfield NJ` and press **Enter immediately** (before rows load) | Spinner, then 8 Haddon Ave gets selected automatically |
| C5 | **Stale results:** type `wawa`, wait for rows, quickly change the text to `1234 south st`, press **Enter** before the new rows appear | Selects **1234 South Street**, NOT a Wawa |
| C6 | Type `99999 zzqx rd`, press **Enter** | Red banner: `No matches for "99999 zzqx rd" — check the spelling or add a city or ZIP`. Dismiss ✕ works |
| C7 | With a destination selected and location known, press **Enter** | Plans the route (same as tapping Find Route) |
| C8 | On a phone / iOS Simulator / Android emulator: the on-screen keyboard's **Search** key | Same as C1/C4 |
| C9 | Press Escape / tap backdrop with dropdown open | Panel closes, no console errors |

## D. Origin field

Tap **Change** next to "My Location" and repeat B1, B3, B5, C1, C2, C4, C5, C6 in
the origin field. Then:

| # | Steps | Expected |
| --- | --- | --- |
| D1 | Pick origin + destination, tap **Swap** | Labels swap; no dropdown opens on its own |
| D2 | Tap **Use my location** | Origin back to "My Location" |

## E. Regressions

| # | Steps | Expected |
| --- | --- | --- |
| E1 | Focus the empty destination field after planning a route before | "Recent" list shows. Picking one works, and so does removing one |
| E2 | Right-click / long-press map → "Route here" | Planner opens with that destination pre-filled; no search runs until you edit it |
| E3 | Reopen planner while a route is active | Prefilled label does **not** trigger a search or show "No matches" |
| E4 | Plan a route to a search result end-to-end | Route draws, destination label = chosen shortName |
| E5 | Console during all of the above | No errors or React warnings |

## F. Performance

| # | Check | Pass if |
| --- | --- | --- |
| F1 | Non-address query (`wawa`), first time | Response < ~2.5 s. Only Photon is hit (check server log / timing) |
| F2 | Address query where Photon already has it (`1600 n broad st`) | Response not much slower than F1 (400 ms grace, not 8 s) |
| F3 | Address Photon lacks (`1234 south st`) | Correct result even when slow. Under 9 s worst case |
| F4 | Typing a 20-char address normally | ≤ ~4–6 `geocode` requests, older ones canceled |
| F5 | Map pan/zoom while suggestions load | No jank. Search doesn't block the map |

## G. Failure handling (optional, needs a temporary code change — revert after)

- **G1 Photon down:** in `route.ts` change the Photon URL host to `photon.invalid`. `wawa` should still return results (Nominatim fallback), and `1234 south st` should still work.
- **G2 Both down:** also break the Nominatim host. The UI shows the red "Geocoding service unavailable" banner. No crash, spinner stops.
- Revert both edits and confirm `git diff` shows no leftover change.

---

## Known limitations (don't "fix" these)

- OSM data gaps: a store missing from OpenStreetMap won't be found. Some labels look odd (e.g. a pizza place tagged "Vacant").
- `1234 south st` also lists 1234 South Street in Reading/Pottstown after the Philly one. They are ranked below it, which is intended.
- Out-of-area results are reached by naming the state ("..., washington dc") or by
  searching for something with no local match at all. A query that *does* have local
  matches stays local, by design — this is a Philly app.
- Intersections (`5th and market`) are only roughly supported.
- Photon is a free public service. Occasional 2–3 s responses are normal.

## Fixing

1. Reproduce the failure at the API level (section A) when possible. That tells you whether it's ranking/data (`lib/search-results.ts`, `route.ts`) or UI (`RoutePlanningPanel.tsx`).
2. For ranking bugs, add a failing case to `tests/search-results.test.ts` first, then fix.
3. Keep performance guards intact: Nominatim pacing (`nominatimSlot`), the grace period, request aborts, caching. Don't add new paid or API-key services.
4. Before calling it done:
   ```bash
   npx tsc --noEmit && npm run lint && npm test
   ```
   Then re-run the failed rows plus C1–C6.
5. Report back using the table below. Don't commit or push without asking the user.

## Results

Run: 2026-09-15. Baseline: `tsc`, `lint`, **54/54** tests pass.

Philly-first ranking (A22–A26) landed after this run; `tsc`, `lint` and **72/72**
unit tests pass, but rows A1–A21 and the UI sections have not been re-run against
the live services since — the upstream geocoders were unreachable from the
environment the change was made in. Re-run section A before trusting the table.

| # | Pass/Fail | Notes (actual result) | Fixed in |
| --- | --- | --- | --- |
| A1 | Pass | Wawa @ Walnut St, Convenience store, Center City (2.8s cold) | — |
| A2 | Pass | Trader Joe's 1324 Arch St first (2121 Market 2nd) | — |
| A3 | Pass | CVS Pharmacy 1201 Walnut St first (was SW Philly CVS before fix) | `lib/search-results.ts` |
| A4 | Pass | Joe's Pizza 122 S 16th St first (was NJ "Pizza" before fix) | `lib/search-results.ts` |
| A5 | Pass | City Hall @ 1500 Market St | — |
| A6 | Pass | 1234 South Street, South Philadelphia first | — |
| A7 | Pass | 1234 South Street, South Philadelphia | — |
| A8 | Pass | AMC Broadstreet 7 @ 1600 N Broad St (unit stripped) | — |
| A9 | Pass | 10 South 2nd Street | — |
| A10 | Pass | 1901 John F. Kennedy Boulevard | — |
| A11 | Pass | 8 South Haddon Avenue, Haddonfield | — |
| A12 | Pass | 123 East Main Street, Norristown | — |
| A13 | Pass | 4500 Frankford Avenue (2 dupes, acceptable) | — |
| A14 | Pass | North 5th Street (intersection weak, known) | — |
| A15 | Pass | `[]`, HTTP 200 | — |
| A16 | Pass | `[]`, HTTP 200 | — |
| A17 | Pass | Cache hit 9 ms (same as A6) | — |
| A18 | Pass | 526 Market St near Independence Hall | — |
| A19 | Pass | HTTP 400 `reverse must be "lat,lng"` | — |
| A20 | Pass | Max cold response 4.0 s (< 9 s) | — |
| A21 | Pass | 5 parallel house-number queries all HTTP 200 | — |
| B1 | Pass | Store icon, "Grocery store" badge, distance labels | — |
| B2 | N/T | Not verified in Network tab (abort on fast typing) | — |
| B3 | Pass | 1234 South Street first, house icon | — |
| B4 | Pass | (via A8) 1600 N Broad rows | — |
| B5 | Pass | "No matches yet — try adding a city or ZIP" shown | — |
| B6 | N/T | Not re-run this session | — |
| B7 | Pass | `trader joes` instant from client cache | — |
| B8 | N/T | Location denied scenario not re-run | — |
| B9 | N/T | 400 px viewport not re-run | — |
| C1 | Pass | Enter → "Trader Joe's" + Clear ✕ | — |
| C2 | Pass* | ↓↓ selects 2nd row (2121 Market); *QA text says 3rd — needs ↓↓↓ | — |
| C3 | N/T | Wrap-around not re-run | — |
| C4 | N/T | Immediate Enter before load not re-run in browser | — |
| C5 | Pass | Stale Wawa rows + Enter → 1234 South Street selected | — |
| C6 | Pass | Red banner with dismiss; exact message matches spec | — |
| C7 | Pass | Find Route plans with destination selected | — |
| C8 | N/T | Mobile Search key not re-run | — |
| C9 | N/T | Escape / backdrop not re-run | — |
| D1 | N/T | Swap not re-run this session | — |
| D2 | N/T | Use my location not re-run | — |
| D (origin) | N/T | Origin field subset not fully repeated | — |
| E1 | N/T | Recent destinations not re-run | — |
| E2 | N/T | Route-here context menu not re-run | — |
| E3 | Pass | Reopen planner: Wawa prefilled, no search / no "No matches" | — |
| E4 | Pass | Route to Wawa draws; preview + turn-by-turn shown | — |
| E5 | Pass | No blocking console errors during tested flows | — |
| F1 | Pass* | Cold `wawa` ~2.8 s (*slightly over 2.5 s, within known Photon variance) | — |
| F2 | Pass | `1600 n broad st` ~3.6 s (grace path, not 8 s) | — |
| F3 | Pass | `1234 south st` ~3.5 s, correct result | — |
| F4 | N/T | Request count while typing not measured | — |
| F5 | N/T | Map pan during search not measured | — |
| G1 | Skip | Optional failure injection — not run | — |
| G2 | Skip | Optional failure injection — not run | — |
