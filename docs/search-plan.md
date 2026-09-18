# Release Notes — Philly Address Search Overhaul

This file is the 18 Sep 2026 release notes. The implementation brief that used to live here is in git history. The E1–E6 follow-up brief is [search-fix-plan.md](search-fix-plan.md).

**Date:** 18 Sep 2026  
**Scope:** Place/address search, intersections, route start points, planner origin, route framing, turn-by-turn instructions  
**Shipped:** `origin/main` at `155e9dc` (`720a0c9` → `155e9dc`, 13 commits on top of `73097ef`)  
**Branches:** `feature/address-index` (7 commits) → `fix/search-qa-e1-e6` (6 commits)

---

## Summary

Search now finds the exact Philadelphia address you type, including while you're still typing it. Before, the app searched only OpenStreetMap data (Photon + Nominatim), which is missing most Philly house numbers, so results fell back to popular places. The app now searches its own index of **547,412 City addresses on 3,437 streets**, built from official City of Philadelphia data. Photon still handles businesses and places.

A follow-up QA pass (random houses, not the sample list) found problems after an address was picked: routes starting on the wrong street, missing intersections, a stuck origin field, and bad map framing. All six were fixed in the same release, along with a turn-instruction bug found while fixing them.

---

## What's new

| Area | Change |
|---|---|
| Address search | New City address index (OPA property data). House-number queries match it first, as you type (`2044 n 63` → 2044 N 63rd St). Exact hits return in about 250–350 ms because Nominatim is skipped and Photon only gets a 250 ms grace period. |
| Smart street matching | Handles `N`/`North`, `5`/`5th`/`fifth`, `St`/`Street`, `Av`/`Ave`, and JFK/MLK/Columbus/Cecil Moore aliases. Also strips units (`apt 2`, `#5`), rear/half addresses (`1234r`, `256 1/2`), and city/state/zip. |
| Mid-typing accuracy | Each street stores its house-number range, so partial queries only show streets that actually have that block. |
| Approximate matches | If a house number isn't in the data, the nearest house on the same side of the street is shown, with an `approx.` chip. |
| Intersections | `S 16th & Bigler`, `16th and bigler`, and `16th at bigler` all resolve to the real corner, using the City's street centerline network (22,266 street pairs). A number-less street like `16th` tries both N and S. |
| Street-front pins | House pins now sit on the curb of their own street, so routes start and end on the right street. |
| Monthly refresh | GitHub Action `address-index.yml` rebuilds the index monthly. |

---

## Fixes (from the 18 Sep QA report)

The first independent QA used two random index addresses as origin and destination (`440 Sloan St` → `2846 S 16th St`) plus extra geocode checks. That run produced E1–E6.

| ID | Problem | Fix |
|---|---|---|
| E1 | `440 Sloan St` pinned the lot's center, 10 m from Nectarine St, so routes started on the cross street | House points are snapped onto their own street's centerline at build time. The point is chosen by address range and odd/even side, and kept at least 15 m away from corners. |
| — | Turn-by-turn showed right turns as "Make a U-turn" | The Valhalla maneuver mapping was off by several entries (right → U-turn, left → Continue, arrive → Turn left). It now uses the documented enum and has unit tests (`lib/valhalla-maneuvers.ts`). This was the real cause of the "3 U-turns" in the first QA report. |
| E2 | Real corners like S 16th & Bigler weren't found (nearby lots 141 m apart), and a Center City café showed instead | Intersections now come from `intersections.json` (22,266 street pairs that share a centerline node), not from guessing between nearby lots. |
| E3 | `16th & bigler` returned nothing | `&`, `and`, `at`, `@`, `/` all take the same path. A side typed without N/S tries both directions. Store names like `at&t`, `h&m`, `barnes & noble` still work. |
| E4 | Origin stuck on "Locating…" when GPS never arrived | After 8 s, or on denial/error, the origin becomes typeable ("Location unavailable — type a start address"). "Use my location" comes back when a fix arrives. Searches use the map center as the location bias. |
| E5 | The route hid under the preview sheet and the map showed the suburbs | The route is framed using the sheet's real height and re-framed when the sheet snaps. Very wide framing on city routes is logged. |
| E6 | Unrelated streets listed under an exact address hit | An exact house now shows at most 2 nearby places below it, and nothing else. |

Also fixed:

- `1234 south st` no longer matches **S St Bernard St** (OPA writes "Saint" as `ST`).
- `1500 Market St` and `1500 Market Street` are now treated as the same result.
- Store names containing `&` (`at&t`, `h&m`, `barnes & noble`) are not treated as intersections.

---

## Data sources

| Source | Used for | Notes |
|---|---|---|
| City OPA properties (`opa_properties_public`, Carto SQL API) | Addresses | Address and coordinate columns only. **No owner, mailing, or sale data is stored.** |
| City Street Centerlines (ArcGIS FeatureServer) | Street-front pins, intersections | Joined to OPA on street code. 0% of streets unmatched. |
| Photon / Nominatim (OpenStreetMap) | Businesses, places, suburbs/NJ, fallback | Unchanged services, same rate limits. |

No new API keys or paid services.

---

## Files

```
SpeedBumbps/
├── data/address-index/            # NEW (generated)
│   ├── streets.json               # street dictionary, index v2
│   ├── intersections.json         # street pairs → corner points
│   └── shards/*.json              # 284 files of street-front house points
├── lib/address-index/             # NEW
│   ├── keys.mjs                   # shared keys (build + runtime)
│   ├── centerline.mjs             # snapping + topology
│   ├── normalize.ts
│   ├── parse.ts
│   ├── match.ts
│   └── store.ts
├── lib/valhalla-maneuvers.ts      # NEW — maneuver mapping fix
├── scripts/build-address-index.mjs         # NEW
├── .github/workflows/address-index.yml     # NEW
├── app/api/geocode/route.ts       # index first, query-type filtering, cache v3
├── app/api/route/route.ts         # uses the new maneuver mapping
├── lib/search-results.ts          # tiers + filtering
├── components/map/RoutePlanningPanel.tsx   # approx. chip, origin fallback
├── components/map/MapMain.tsx     # sheet height → route framing
├── hooks/useRoutePolyline.ts      # sheet-aware fitBounds
├── next.config.ts                 # index bundled into /api/geocode
├── tests/                         # address-*, valhalla-maneuvers tests + fixtures
└── docs/
    ├── search-plan.md             # this file (release notes)
    └── search-fix-plan.md         # E1–E6 implementation brief
```

---

## Under the hood

- **Index build:** `scripts/build-address-index.mjs` pages through the City's OPA property records and the City street centerlines. It snaps each house onto its street and writes the index to `data/address-index/`: a street list, 284 files of house points, and the intersection table. The build refuses to write a partial index. It fails on a short download, on more than 2% of streets with no centerline (actual: 0%), or on more than 3% of houses that can't be placed on their street (actual: 0.91%).
- **Monthly refresh:** `.github/workflows/address-index.yml` rebuilds on the 1st of each month (and on script changes). It commits only when the data changed.
- **Search code:** `lib/address-index/` handles query parsing, spelling rules, matching and loading from disk. `lib/address-index/centerline.mjs` holds the snapping and intersection math, shared by the build and the tests.
- **Geocode API:** `app/api/geocode/route.ts` searches the index while Photon is in flight. It calls Nominatim only when the index has no exact house, and it filters Photon/Nominatim rows by query type.
- **Routing:** the turn-code mapping moved to `lib/valhalla-maneuvers.ts`.
- **UI:** `approx.` chip, origin states and a map-center search fallback in `RoutePlanningPanel.tsx`. The route is framed above the sheet in `useRoutePolyline.ts`.

---

## Privacy

The build selects only address and coordinate columns from OPA. Owner, mailing-address, sale and valuation fields are never downloaded or stored, and a scan of `data/` for them finds nothing.

---

## Upgrade notes

- **Repo size:** `data/address-index/` adds about 18.8 MB, and each monthly refresh adds a diff. The files are one row per line so diffs stay small.
- **Deploy:** `next.config.ts` bundles `data/address-index/**` into the `/api/geocode` function. The files stay out of `public/`.
- **Caches:** the server search cache key moved to `v3`, so old cached results aren't served.
- **No new services or keys:** City data is public, and no environment variables were added.
- **Fallback:** if `data/address-index/` is missing, search falls back to Photon/Nominatim and logs one warning.

---

## Performance

| Check | Result |
|---|---|
| Exact address (warm) | ~200–350 ms |
| Intersection lookup | ~250 ms |
| Cached repeat | ~2 ms |
| Index build | 0% street codes unmatched, 0.91% houses unsnapped (guards: 2% / 3%) |
| Tests | `tsc`, lint, 129 tests / 9 files, and `npm run build` pass |

---

## QA results (local dev, 18 Sep 2026)

Full steps are in `tests/qa/place-search-qa.md` sections H and I.

Independent retest after the fixes (same houses as E1, plus I8 GPS blocked and I9 at 390 px):

| # | Check | Result |
|---|---|---|
| I1 | `440 Sloan St` → `2846 S 16th St` starts on Sloan, no early U-turn | Pass. UI: "Head on Sloan Street" then "Turn right onto Spring Garden Street". 13 min, 6.0 mi. |
| I2 | Block-start houses depart on their own street | Pass (`2601 S Iseminger St`, `501 S Philip St`, `1203 W Airdrie St`) |
| I3 | N Broad St houses start on the correct side | Pass (`4600` and `5501 N Broad St`). Large-lot exception: `1401 N Broad` stays unsnapped (see limitations). |
| I4–I6 | Intersections (`S 16th & Bigler`, `&`/`and`/`at`, `sloan and nectarine`) | Pass (~250–590 ms) |
| I7 | Nonsense intersection returns the empty state | Pass (`zzqx & qqzx` → `[]`) |
| I8 | Origin fallback with location blocked | Pass. Placeholder "Location unavailable — type a start address"; copy "Location temporarily unavailable"; geocode URLs include `near=39.95,-75.17` (map center). |
| I9 | Route framed above the sheet | Pass*. Whole 6 mi route stays visible above the sheet at desktop and 390 px after collapsing the sheet. Zoom still includes inner suburbs (Ardmore / airport) on a short viewport; the old Norristown-scale miss is gone. |
| I10 | `7255 hill rd` shows no unrelated rows | Pass (only that house) |
| I11 | Build guards and `BIGLER_ST\|S_16TH_ST` present | Pass. Index v2, `builtAt` 2026-09-18T19:41:26Z. Pair at `[39.91462, -75.1748]`. |
| I12 | `&` store names still work | Pass (`barnes & noble`, `at&t`, `h&m`) |
| I13 | Right turns read "Turn right onto …", not "Make a U-turn" | Pass on the Sloan → S 16th preview and on the I2/I3 routes |

---

## Known limitations

- Philadelphia only. Suburbs and NJ still use Photon/Nominatim.
- About 0.9% of houses (mostly large lots on Roosevelt Blvd, Academy Rd, Delaire Landing Rd) are more than 60 m from their street, so they keep the lot-center point and routes may start on a driveway or service road (e.g. 1401 N Broad St).
- Intersections use the City's official street names. `5th and market` misses because that stretch of 5th St is named Independence Mall.
- For intersection-shaped queries (`x & y`, `x and y`), Photon/Nominatim results are limited to the typed streets and places named after both sides.
- The index refreshes monthly, so new construction can lag. `approx.` covers gaps up to ±100 house numbers.
- A house number more than 50 outside a street's range returns no index result.

---

## Still to do

- Run the QA pass on a Vercel preview, including cold-start timing (H8: first full-address search under 1.5 s).
- Parked ideas, not started: expand the bump dataset beyond official City data, one-tap "Report Bump" while navigating, visual "Bump Ahead" countdown.

---

## How this was built

- **Claude (Cowork):** read the repo, found the root cause (OSM is missing Philly house numbers), checked the City data sources and Vercel bundling, and wrote both build briefs.
- **Gemma 4 12B (LM Studio, local):** reviewed each design. It caught the edge cases for missing fields, divided roads, streets that meet more than once, and route start points landing in an intersection.
- **Claude (Cursor):** implemented both briefs, ran the tests and QA, and found and fixed the Valhalla maneuver mapping bug.
- **Independent QA (Cursor, this session):** pulled random index addresses (not the sample list), filed E1–E6 with measured evidence, retested section I after the fixes (including I8 with GPS blocked and I9 at 390 px), and pushed `155e9dc` to `main`.

---

## Commits

`fix/search-qa-e1-e6`

- `155e9dc` Add QA section I (E1-E6 regression) with local results
- `73a4b92` Planner origin falls back when GPS fails; frame routes above the sheet (E4/E5)
- `5fcb1fd` Filter provider rows by query type; spell out street pairs (E3/E6)
- `68ee959` Look up intersections from centerline topology (E2/E3)
- `7b773c2` Snap house points onto their own street's centerline (E1)
- `5ea869b` Fix Valhalla maneuver mapping that turned right turns into U-turns

`feature/address-index`

- `0584123` Skip the Photon wait for exact index hits; add QA section H
- `7e4ef6e` Add monthly GitHub Action to refresh the address index
- `df59478` Show an approx. chip on approximate search results
- `2e65eba` Search the City address index before Photon/Nominatim
- `c43f402` Add address-index store and matcher with fixture tests
- `087f800` Add OPA address index build script and generated index
- `720a0c9` Add address-index normalizer and query parser
