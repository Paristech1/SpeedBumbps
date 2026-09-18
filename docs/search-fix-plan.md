# SpeedBumps — Search QA Fixes (E1–E6) Build Brief

> Paste this whole file into Claude in Cursor. Branch: `fix/search-qa-e1-e6`.
> Context: the City address index (`docs/search-plan.md`) shipped and house lookup passes (8/8). This brief fixes the six findings from the 18 Sep 2026 QA run.

---

## 1. Findings → fixes at a glance

| ID | Severity | Problem | Fix |
|---|---|---|---|
| E1 | High | Exact house pin is the OPA parcel centroid; router snaps to the cross street (440 Sloan St → Nectarine St) and adds U-turns | At build time, replace each house row's coordinate with a **street-front point** snapped onto its own street's centerline |
| E2 | High | Real corner `S 16th & Bigler` not found (parcel pair 141 m > 60 m cap); Photon fallback shows a cafe + Wilmington street | Build **`intersections.json` from centerline topology** (shared nodes). Exact lookup, no gap guess |
| E3 | Medium | `16th & bigler` returns `[]` | Same intersection path for `&`/`and`/`at`; normalize `&` → `and` before any upstream call; expand missing predir |
| E4 | Medium | Origin stuck on "Locating…" when GPS never resolves; `near` omitted | Use `hasPermission`/`error` + 8 s timeout; editable fallback; map-center `near` |
| E5 | Medium | Route fit hides under the preview sheet; view shows suburbs | Pad `fitBounds` by the measured sheet height; `invalidateSize()` first |
| E6 | Low | Photon streets/addresses appended under an exact index hit | Filter Photon rows by query type |

---

## 2. New data source: City Street Centerlines (verified)

- ArcGIS FeatureServer: `https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Street_Centerline/FeatureServer/0/query`
- Polylines, `maxRecordCount` = 2000 → page with `resultOffset` + `resultRecordCount=2000` + `orderByFields=objectid`
- Query params: `where=1=1&outFields=seg_id,fnode_,tnode_,pre_dir,st_name,st_type,suf_dir,st_code,l_f_add,l_t_add,r_f_add,r_t_add,class&outSR=4326&f=geojson`
- Fallback download if paging fails: `https://hub.arcgis.com/api/v3/datasets/c36d828494cd44b5bd8b038be696c839_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1`
- Key fields: `fnode_`/`tnode_` (topology node IDs), `pre_dir`, `st_name`, `st_type`, `suf_dir`, `st_code`, `l_f_add`/`l_t_add`/`r_f_add`/`r_t_add` (address ranges), `seg_id`, `class`
- OPA has `street_code`, which joins to centerline `st_code`

**First step:** fetch one page and log a few rows, plus the distinct `st_type` and `pre_dir` values, and confirm `st_code` values match OPA `street_code` for a few known streets (e.g. Sloan, Bigler, S 16th). Adjust the code below if field names or casing differ.

---

## 3. File changes

```
SpeedBumbps/
├── scripts/
│   └── build-address-index.mjs        # EDIT — fetch centerlines, snap rows, build intersections
├── data/address-index/
│   ├── streets.json                   # EDIT (regenerated) — version 2
│   ├── intersections.json             # NEW — generated
│   └── shards/*.json                  # regenerated — coords are now street-front points
├── lib/address-index/
│   ├── keys.mjs                       # EDIT — INDEX_VERSION = 2, shared centerline key helper
│   ├── parse.ts                       # EDIT — predir expansion for intersections
│   ├── match.ts                       # EDIT — intersection lookup via intersections.json
│   └── store.ts                       # EDIT — lazy-load intersections.json
├── app/api/geocode/route.ts           # EDIT — upstream query normalization, Photon filtering
├── lib/search-results.ts              # EDIT — per-query-type Photon filtering
├── components/map/RoutePlanningPanel.tsx  # EDIT — origin states (E4)
├── hooks/useLocationTracking.ts       # EDIT (if needed) — expose a 'timedOut' state
├── hooks/useRoutePolyline.ts          # EDIT — bottom inset padding (E5)
├── tests/
│   ├── address-snap.test.ts           # NEW
│   ├── address-intersections.test.ts  # NEW
│   ├── fixtures/address-index/…       # EDIT — add a tiny intersections.json + centerline fixture
│   └── qa/place-search-qa.md          # EDIT — add section I (E1–E6 regression)
└── docs/search-fix-plan.md            # this file
```

---

## 4. E1 — Street-front points (build time)

**Goal:** every house row's `lat, lng` becomes a point on its **own** street's centerline, in front of the house. The router then snaps to the right street. `RoutingContext` already routes to `result.location`, so no routing code changes are needed.

Steps in `build-address-index.mjs`:

1. Add `street_code` to the OPA SELECT.
2. Load all centerline segments. Group by `st_code` and also by street key (`streetKey(pre_dir, st_name, st_type)` from `keys.mjs`, so both datasets share one normalizer).
3. For each deduped house row, choose a segment:
   - Candidates = segments with the same `st_code` whose geometry is within **60 m** of the parcel point.
   - Score each candidate:
     - `+2` if the house number falls inside the segment's left or right address range (min/max of `l_f_add..l_t_add` or `r_f_add..r_t_add`; ignore null/0 ranges)
     - `+1` if the house parity matches that side's parity (odd/even of `l_f_add` vs `r_f_add`) — this also picks the right carriageway on divided roads (Broad, Roosevelt Blvd)
     - tie-break: shortest distance from the parcel point
   - No `st_code` candidate within 60 m → try the same street key within 60 m.
   - Still none → keep the parcel point and count it as `unsnapped`.
4. Project the parcel point onto the chosen segment's polyline (nearest point on any sub-segment; do the math in a local metric projection, e.g. equirectangular around Philly's latitude).
5. **Corner clamp:** if the projected point is closer than `min(15 m, 25% of segment length)` to either segment endpoint, move it along the segment to that distance. The waypoint must never sit inside an intersection.
6. Write the snapped point as the row's `lat, lng` (5 decimals). Keep the row format unchanged: `[house, suffix, lat, lng, zipIndex]`.
7. Optional debug: env `KEEP_PARCEL=1` writes the parcel point into a separate `data/address-index/debug/` folder (git-ignored). Off by default.

**Build guards (fail the build if exceeded):**

- OPA streets (by `street_code`) with no centerline match > **2%**
- House rows `unsnapped` > **3%**
- Log both numbers, plus the 20 most common unmatched street keys

**Size:** the file count and shard size stay the same (the coordinate is replaced, not added).

**Optional (only if E1 re-test still shows wrong-street starts):** plumb the street name through `/api/route` and send Valhalla's documented `street` location hint (`locations[i].street`).

---

## 5. E2 / E3 — Intersections from topology

### Build (`build-address-index.mjs`)

1. For every segment, record `(fnode_ → streetKey, coord of first vertex)` and `(tnode_ → streetKey, coord of last vertex)`.
2. For each node, collect the distinct street keys touching it.
3. For every pair of distinct street keys at a node, add the node coordinate under the sorted pair key `"KEYA|KEYB"`.
4. Cluster coordinates per pair within **75 m** (two streets can meet at several nodes, e.g. streets that cross twice or divided roads with two nodes at one corner). Store cluster centroids.
5. Write `data/address-index/intersections.json`:

```json
{
  "version": 2,
  "pairs": {
    "BIGLER_ST|S_16TH_ST": [[39.9168, -75.1745]],
    "NECTARINE_ST|SLOAN_ST": [[39.9615, -75.2016]]
  }
}
```

   (Coordinates above are illustrative; use real output.)

6. Log the pair count. Spot-check that `BIGLER_ST|S_16TH_ST` and `NECTARINE_ST|SLOAN_ST` exist.

### Runtime (`match.ts` + `store.ts`)

1. `store.ts`: lazy-load `intersections.json` once per warm instance (same pattern as `streets.json`).
2. `parse.ts`: keep one intersection pattern for `and`, `at`, `&`, `@`, `/` (already present). Make sure `16th & bigler` produces `{ kind: 'intersection' }`. Add a unit test.
3. `searchIntersection`:
   - Resolve each side to candidate street keys with `rankStreets` (top 3 each).
   - **Predir expansion:** if the user typed no predir, include every predir variant of that street (`16th` → `N_16TH_ST`, `S_16TH_ST`).
   - For each A×B combination, look up the sorted pair key in `intersections.json`.
   - Collect all node coordinates; dedupe within 75 m; sort by distance to `near`; return up to 3.
   - Result: `kind: 'street'`, `shortName: 'S 16th St & Bigler St'`, `displayName: 'Philadelphia, PA'`, `approximate: false` (it's a real node), tier 1.
4. Remove the parcel-pair `closestPoints` method. If you keep it as a fallback, raise the gap to 150 m and grow `GRID_CELL_DEG` so a cell is still larger than the gap. Default recommendation: **remove it**, since topology is exact.

### Upstream fallback when the index finds nothing

In `route.ts` / `search-results.ts`, when `parseQuery(...).kind === 'intersection'`:

- Send Photon a normalized query: replace `&`, `@`, `/` with ` and `.
- Keep only Photon/Nominatim rows with `kind` `street` or `area` **whose street name matches one of the typed sides** (reuse `normalizeStreet` / `streetMatchLevel`). Drop POIs.
- If nothing survives, return `[]` so the UI shows its existing "no matches" hint. Never show an unrelated cafe as an intersection.

---

## 6. E6 — Photon noise under index hits

In `mergeSearchResults` (or right before it):

| Query type | Keep from Photon/Nominatim |
|---|---|
| Address with a tier-1 index hit | POIs only (`kind: 'place'`), max 2, and only within 1 km of the index hit |
| Address with only tier-2/3 index hits | Current behavior (street-matching rows still help while typing) |
| Intersection | Section 5 fallback rules |
| Other (`wawa`, `trader joes`) | Unchanged |

---

## 7. E4 — Origin field when GPS fails

`useLocationTracking` already exposes `hasPermission: boolean | null` and `error: string | null`.

1. In `RoutePlanningPanel.tsx`, derive `originStatus`:
   - `'ready'` → `userLocation` present
   - `'locating'` → no location, no error, less than **8 s** since the panel opened
   - `'unavailable'` → `hasPermission === false`, `error` set, or 8 s elapsed with no fix
2. Origin field copy:
   - ready: `My Location`
   - locating: `Locating…` (spinner)
   - unavailable: automatically switch `useMyLocation` to `false`, focus the origin input, and show placeholder `Location unavailable — type a start address`. Show the `error` text as a small muted line under the field.
3. If a fix arrives later while the user hasn't typed an origin, offer a small `Use my location` button. Don't overwrite typed text.
4. `near` fallback for search bias: `userLocation ?? mapCenter` (read the current Leaflet map center from `MapContext`). Only fall back to the server's `PHILLY_CENTER` if the map isn't ready.

---

## 8. E5 — Route framing vs. the preview sheet

In `useRoutePolyline.ts`:

1. Accept a `bottomInset` (px) argument/option. The preview sheet (`RouteResultCard` / vaul drawer) reports its height via a `ResizeObserver` into `MapContext` (or a prop).
2. Before fitting: `map.invalidateSize()`.
3. `fitBounds(bounds, { paddingTopLeft: [40, topBarHeight + 24], paddingBottomRight: [40, bottomInset + 24], maxZoom: 17 })`.
4. Re-fit when `bottomInset` changes by more than 40 px (sheet snap points), but not during navigation (the follow-cam owns the camera, as today).
5. Guard: if the resulting zoom is less than 11 for a route under 30 km, log a warning via `app-logger` (this is the "suburbs" symptom).

---

## 9. Tests

### Unit (Vitest)

| # | Test | Expect |
|---|---|---|
| T1 | Snap: parcel 10 m from cross street, 25 m from own street (fixture) | Snapped point lies on own street's segment |
| T2 | Snap: house number in right-side range with matching parity on a divided road fixture (two parallel segments) | Picks the matching-parity carriageway |
| T3 | Snap: projection lands 3 m from a segment endpoint | Clamped to ≥ min(15 m, 25% length) from the endpoint |
| T4 | Snap: segment ranges null | Falls back to distance-only choice |
| T5 | Intersection parse: `16th & bigler`, `16th and bigler`, `s 16th st at bigler st`, `16th/bigler` | All → `kind: 'intersection'` with the same sides |
| T6 | Intersection lookup: `16th & bigler` against a fixture pair `BIGLER_ST|S_16TH_ST` | One result, tier 1, not approximate |
| T7 | Intersection with 2 nodes 300 m apart (fixture) | Two results, nearest to `near` first |
| T8 | Intersection miss (`zzz & qqq`) with Photon rows = [cafe POI, "West 16th Street, Wilmington"] | `[]` |
| T9 | Tier-1 address hit + Photon rows [street, far POI, near POI] | Only the near POI kept |

Existing tests must keep passing. Update the parcel-pair tests if you removed `closestPoints`.

### Manual QA — add section **I. QA regression (E1–E6)** to `tests/qa/place-search-qa.md`

| # | Steps | Pass criteria |
|---|---|---|
| I1 | Plan `440 Sloan St` → `2846 S 16th St` | First maneuver is on **Sloan St**, not Nectarine; no U-turn in the first 500 m |
| I2 | Repeat I1 with 3 other random shard addresses on short blocks near corners | First maneuver is on the named street each time |
| I3 | A house on N Broad St (divided section) | Start is on the correct carriageway; no immediate U-turn |
| I4 | Search `S 16th & Bigler` | `S 16th St & Bigler St` on top, pin at the corner |
| I5 | Search `16th & bigler`, `16th and bigler`, `16th at bigler` | Same top result for all three; never `[]` |
| I6 | Search `sloan and nectarine` | Still found (control) |
| I7 | Search `zzqx & qqzx` | Empty state, no cafes or out-of-state streets |
| I8 | Open Plan Route with location blocked (DevTools → Sensors → Location unavailable) | Within 8 s the origin becomes typeable, with the "Location unavailable" hint; `/api/geocode` calls include `near` (map center) |
| I9 | Plan a 6 mi route with the preview sheet open, on phone width and desktop | The whole route is visible above the sheet; no suburb-scale zoom |
| I10 | Search `7255 hill rd` | Exact house first; no unrelated streets below it |
| I11 | Build log | Centerline unmatched ≤ 2%, unsnapped ≤ 3%, `BIGLER_ST|S_16TH_ST` present |

---

## 10. Acceptance criteria

- [ ] `npx tsc --noEmit && npm run lint && npm test` pass
- [ ] `npm run build` passes; the geocode function trace includes `data/address-index/intersections.json`
- [ ] Index rebuilt with `INDEX_VERSION = 2`; bump `SEARCH_CACHE_VERSION` so old cached results aren't served
- [ ] T1–T9 and I1–I11 pass
- [ ] `data/address-index/` size grows by less than 2 MB (intersections only)
- [ ] No owner/mailing/sale fields anywhere in `data/`

---

## 11. Build order (commit after each)

1. Centerline sample fetch + field check (section 2).
2. Build script: centerline download + snapping + guards (E1). Rebuild the index. Run I1 quickly.
3. Build script: `intersections.json` (E2).
4. `store.ts` / `match.ts` / `parse.ts` intersection lookup + unit tests (E2/E3).
5. Upstream normalization + Photon filtering (E3/E6).
6. Origin states + `near` fallback (E4).
7. Route framing (E5).
8. QA section I on a Vercel preview.

---

## 12. Notes

- The monthly GitHub Action (`address-index.yml`) needs no changes beyond running the updated script. It now also downloads centerlines (~40k segments, ~20 paged requests; add a 500 ms delay between pages).
- Moving the pin from the parcel to the curb in front of it is intentional. It's the same idea as a "navigation point" in commercial maps.
