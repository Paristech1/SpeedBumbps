# SpeedBumps

A mobile-first web navigator that helps Philadelphia drivers avoid speed bumps. It plots the city's official traffic-calming devices on a map, plans A-to-B routes that detour around them, and gives spoken turn-by-turn guidance — all on free, open services with no accounts and no API keys.

Live map: `/` (or `/map`). Static UI preview without GPS/routing: `/demo/active-navigation`.

## What it does

- **Bump map** — 1,500+ official Philadelphia speed bumps, humps, cushions and tables rendered as viewport-culled canvas markers. Bumps on your selected route are emphasised; the rest dim.
- **Bump-aware routing** — the fastest route plus, when it crosses bumps, an alternative with fewer of them. The alternative is found by asking the router for alternates and then re-routing with the offending bumps as excluded locations; it is only offered if it has strictly fewer bumps and fits the profile's detour budget.
- **Vehicle and strategy profiles** — *Smooth Ride* / *Balanced* / *Fastest* set how much longer a detour may be (≈ +60% / +25% / none). The vehicle (sedan, SUV, lowered, motorcycle, bicycle) nudges that budget, sets the routing costing (bikes and motorcycles get their own), and decides how gentle a user-reported bump must be to count.
- **Turn-by-turn navigation** — follow-cam with heading arrow, progress trace, live distance to the next maneuver, remaining time/distance, ETA clock, speed, GPS-quality chip, automatic rerouting from your current position when you leave the route, and arrival detection that ends the trip for you.
- **Voice guidance** — free on-device speech (Web Speech API) with early and "now" announcements, speed-bump heads-ups as you approach one, a voice picker, and a mute toggle. Screen stays awake while navigating.
- **Planner conveniences** — "Route here" from a map long-press/right-click (reverse-geocoded), recent destinations, Enter-to-pick-top-result, origin/destination swap, and "My Location" as the default origin.
- **Saved routes and places** — routes are stored locally; routes saved from "My Location" re-run from wherever you are now. Places (POIs) can be saved, categorised, and imported/exported as GeoJSON.
- **Reports** — report a bump the dataset is missing (GPS or tap-on-map, severity 1–5, note). Reports render on the map and count in routing immediately.
- **Profile** — on-device display name, default vehicle/strategy, voice choice, and a Log mode that captures diagnostics you can download or file as a GitHub issue.

Everything is stored in `localStorage`; there is no backend beyond two small API proxies.

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Map | Leaflet 1.9 (canvas renderer), OpenStreetMap raster tiles |
| Routing | Valhalla public server (primary; `alternates`, `exclude_locations`, per-vehicle costing) with OSRM demo servers as fallback, via `app/api/route` |
| Geocoding | City of Philadelphia address index (OPA parcels, built into `data/address-index`) first, then Photon + Nominatim (forward) and Nominatim (reverse), via `app/api/geocode` with an in-process LRU cache |
| Voice | Web Speech API (`speechSynthesis`) |
| UI | Tailwind CSS 4, vaul drawers, lucide icons, sonner toasts |
| Tests | Vitest |

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run lint       # eslint
npm test           # vitest (unit tests in tests/)
```

No environment variables are required. The routing and geocoding proxies call public OpenStreetMap-community servers; be considerate of their usage policies (the geocode proxy caches for 24 h and the client debounces searches).

### Place search with Google (optional, recommended)

Without a key, search runs on the City address index (every Philadelphia
parcel) plus Photon and Nominatim. Those two are free OpenStreetMap services
that aren't built for this. Nominatim's policy forbids search-as-you-type,
and Photon's public server throttles production use. Both know businesses
poorly. Set a Google key and suggestions come from **Places Autocomplete
(New)** instead. The City index still leads for Philly house numbers.

1. In Google Cloud, enable **Places API (New)** and create an API key.
   Restrict it to that API.
2. In Netlify: *Site configuration → Environment variables*, add
   `GOOGLE_MAPS_API_KEY`, then redeploy.
3. Check `/api/geocode?status`. It should say `"googlePlaces": true`.

Cost: keystrokes are grouped into a session per search and are free. A
session is billed once, when a result is picked, at the Place Details
Essentials rate (location and address only). Google's free monthly allowance
covers light use. If Google errors or times out, search falls back to
Photon/Nominatim on its own.

## Project structure

```
app/
  api/geocode/route.ts     Search: address index + Photon/Nominatim: ?q=<text> or ?reverse=<lat>,<lng>
  api/route/route.ts       Routing proxy: Valhalla → OSRM fallback, normalised to OSRM JSON
  map/page.tsx             The app (also served at /)
  demo/active-navigation   Static UI preview
components/map/            Map chrome: planner, route sheet, navigation HUD, tab drawers, controls
contexts/                  MapContext (Leaflet instance), RoutingContext (route state + cache), ThemeContext
hooks/                     Location tracking, follow-cam, deviation, voice, markers, local persistence
lib/
  address-index/           Philly address index: query parsing, street matching, disk loader
  bump-avoidance.ts        Candidate scoring + exclusion rounds
  osrm-service.ts          Route request/parse, polyline decode, step→polyline indexing
  geo-utils.ts             Haversine, segment distance, route progress, imperial formatting
  speed-bump-service.ts    Dataset loader + user-reported bumps
  voice-guidance.ts        Speech singleton, voice selection, spoken distances
types/                     Domain types (routes, bumps, profiles, user data)
public/data/phl_speed_bumps.json   The bump dataset
data/address-index/                Generated Philly address index (refreshed monthly by GitHub Actions)
scripts/snap-bumps-to-roads.mjs    One-off data fix (see below)
scripts/build-address-index.mjs    Rebuilds data/address-index from City OPA data
tests/                     Vitest unit tests
```

## How routing works

```
plan(origin, destination, profile)
  ├─ Valhalla: route + alternates=2 (costing from vehicle)
  ├─ for each candidate: bumps within 20 m of its geometry (own bbox, padded)
  ├─ primary = fastest candidate
  ├─ if primary has bumps and the profile allows a detour:
  │    ├─ re-route with exclude_locations = bumps on primary (≤ 50)
  │    └─ if still bumpy and improving, one more round excluding those too
  └─ alternative = fewest bumps, then fastest, within (1 + budget) × primary duration
     — offered only if it has strictly fewer bumps than primary
```

During navigation the driver's position is projected onto the route polyline; the current instruction is the first maneuver still ahead of that projection, so guidance keeps up through GPS gaps. Leaving the route by >100 m for 5 s triggers a reroute from the current position (30 s cooldown), preserving the fewer-bumps choice if one was made.

## Data

- **Primary:** [OpenDataPhilly — Traffic Calming Devices](https://opendataphilly.org/datasets/traffic-calming/), flattened to `{ id, lat, lng }` in `public/data/phl_speed_bumps.json`. Severity is not in the source data; every dataset bump is treated as severity 3.
- **Snapping:** the source points derive from H3 cells and can sit slightly off-street. `scripts/snap-bumps-to-roads.mjs` snaps each point to the nearest road with OSRM and drops duplicates; `.github/workflows/snap-bumps.yml` runs it when the script changes.
- **User reports** carry a 1–5 severity and are trusted locally.

## Privacy

Location never leaves the device except as route/geocode coordinates sent to the routing and geocoding proxies. Nothing is stored server-side. Log mode coarsens coordinates unless you opt in to precise locations.

## License

MIT
