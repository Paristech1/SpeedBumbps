# SpeedBump App — About This Project

This document is the single source of truth for the SpeedBump vision, roadmap, and **current implementation status**. SpeedBump is a Philadelphia-focused navigation app that helps drivers avoid speed bumps using official city data, community verification, and intelligent routing.

---

## Current progress — what we've built so far

*Last updated: February 2025*

### Tech stack (actual)

- **Frontend:** Flutter (iOS, Android, web, macOS, Linux, Windows) — cross-platform native app
- **Maps:** OpenStreetMap via `flutter_map` (no API key required)
- **Routing:** OSRM (Open Source Routing Machine) public server — free, no API key; polyline decoding and waypoint-based bump avoidance
- **Backend:** Firebase (Authentication, Firestore, Crashlytics)
- **State:** Riverpod; Freezed for domain/state models
- **Security:** Firestore rules with Philadelphia bounds validation and admin claim checks

### Implemented features

**Phase 1 — Map & location**

- Interactive OpenStreetMap with real-time GPS (blue dot, auto-follow)
- Location permission flow and "GPS off" handling
- Low-accuracy warning badge
- Light and dark theme
- `WidgetsBindingObserver` lifecycle handling — re-checks location permission on app resume

**Phase 2 — Routing**

- A-to-B navigation via OSRM (free, no API key)
- Route polyline rendering with bump-aware coloring
- Turn-by-turn directions in a bottom sheet
- Automatic avoidance of verified speed bumps (waypoint injection; 20 m proximity threshold)
- Waypoints sorted by route index before API call (fixes loop/ordering issues)
- Route mode: **Fastest** vs **Bump-free** toggle
- Tap map to set destination; route recalculates on deviation (throttled with 30 s cooldown)
- Vehicle profiles: Sedan, SUV, Lowered Car, Motorcycle, Bicycle
- Route preference modes: Smooth Ride, Cargo-Conscious, Fast
- Speed bump data: bundled Philadelphia dataset (`assets/data/phl_speed_bumps.json`) loaded via `AssetSpeedBumpRepository`

**Phase 3 — Auth**

- Firebase Auth: Email/Password and Google sign-in
- Splash screen, auth gate, auth screen, profile screen
- Firestore user profiles with reputation score, miles driven
- User rank system: Rookie → Navigator → Road Warrior → Legend
- Auth stream subscription managed with proper cancellation on dispose
- Password reset and account deletion flows

**Security (implemented)**

- **Firestore rules:**
  - Users: self-read, admin-read; self-create with `isAdmin: false`; self-update profile fields only; admin-update `isAdmin` only
  - Speed bumps: public read; admin-only create/update/delete with Philadelphia bounds and severity validation
  - Routes: owner-only CRUD; admin can delete any route

**Supporting / core**

- Clean architecture: domain (entities, repository interfaces, use cases), data (repositories, datasources, models), presentation (screens, providers, state)
- Use case: `CalculateRouteWithBumpAvoidance` (route → intersect bumps → inject waypoints → sort by route index → recalculate)
- Crash reporting: Firebase Crashlytics with Flutter error handler, zone error handler, and navigation breadcrumbs
- Structured debug logger (`AppLogger`) with tagged levels (debug/info/warn/error)
- Tests: unit tests for entities, geo utils, route calculation (boundary precision at 19.9999 m and 20.0001 m), route preferences; widget tests for map screen
- CI: GitHub Actions workflow — `flutter pub get` → `build_runner` → `flutter analyze --fatal-infos --fatal-warnings` → `flutter test --coverage` → debug APK artifact upload
- Docs: `SETUP.md`, `SECURITY.md`, `PERFORMANCE.md`, `DEPENDENCIES.md`

### Deviations from original plan

- **Framework:** Flutter instead of React Native (faster iteration, single codebase for all platforms).
- **Maps:** OpenStreetMap via `flutter_map` instead of Google Maps SDK or Mapbox (no API key required, free for all usage).
- **Routing:** OSRM (free, no API key) instead of HERE Routing API or Google Directions; avoidance implemented via waypoint injection and segment checking.
- **Vehicle profiles and route modes:** Implemented ahead of schedule (originally planned for Phase 2 growth).
- **Philly open data:** App uses bundled JSON asset derived from Philadelphia's traffic calming hex dataset; structured for easy swap to live Firestore or API data source.
- **Photo submissions removed:** Original plan included a photo submission and admin review system. This was removed to focus on core navigation value — the app's strength is routing and avoidance using Philadelphia's official dataset, not crowdsourced photo reports.

### Known issues (from audit)

| Area | Issue | Severity | Status |
|------|-------|----------|--------|
| Performance | `MapScreen` uses `ref.watch(locationStreamProvider)` at build root — full Scaffold rebuild on location updates | Low | TODO — narrow `Consumer` scope |
| Performance | Polyline decoding runs synchronously; risk of main-thread jank on routes > 1,000 points | Low | TODO — use `compute()` isolate |

---

# SpeedBump App — Complete Project Plan

## EXECUTIVE SUMMARY

SpeedBump is a navigation app built for Philadelphia drivers to avoid speed bumps, potholes, and road hazards using official city data, community verification, and intelligent routing. Starting with Philly's 1,584+ verified traffic calming devices, the app delivers bump-aware routing, vehicle-specific avoidance profiles, and a smooth driving experience — all for free using open-source mapping and routing infrastructure.

The app is built with Flutter for cross-platform deployment, uses OpenStreetMap for free map display, OSRM for free routing, and Firebase for authentication and data storage.

---

# PROJECT PHASES

## PHASE 0: PRE-LAUNCH VALIDATION (Weeks 1–4)

**Goal:** Validate demand before building

### Deliverables

- **Landing page with map teaser** showing 1,584 Philly speed bumps on an interactive OpenStreetMap widget
- **Email signup form** (goal: 500+ signups)
- **Driver survey** (target: 100 responses)
  - "Would you pay $3 for this app?"
  - "What's your biggest routing pain point?"
  - "How often do speed bumps affect your routes?"
- **Beta partner outreach** to 3–5 local delivery companies (e.g. GoPuff, Instacart shoppers, Amazon DSPs in Philly)

### Success metrics

- 500+ email signups
- 60%+ survey respondents say "yes" to paying
- 1 delivery company commits to beta testing

---

## PHASE 1: MVP LAUNCH (Weeks 5–12)

**Goal:** Prove core value with minimal features

### Core features

1. **Map display**
   - Philadelphia's 1,584+ official speed bump locations rendered as markers on OpenStreetMap
   - Clean, fast-loading interface with pan/zoom
   - Blue dot for real-time GPS location with auto-follow on first load
   - Low-accuracy GPS warning badge when accuracy > 20 m
   - Light and dark theme support (system-adaptive)
2. **Routing with bump avoidance**
   - A-to-B navigation via OSRM (free, no API key)
   - Algorithm: calculate route → check bump intersections within 20 m buffer → inject avoidance waypoints → sort by route index → recalculate
   - Route polyline rendering with bump-aware coloring
   - Turn-by-turn directions in a draggable bottom sheet
   - Tap map to set destination; automatic recalculation on deviation (80 m threshold, 5 s delay, 30 s cooldown)
   - Route mode toggle: **Fastest** vs **Bump-free**
3. **User authentication**
   - Firebase Auth (email/password + Google sign-in)
   - Firestore user profiles with reputation and miles driven
   - Splash screen, auth gate, and profile management
   - Password reset and account deletion

### Safety controls (built into MVP)

| Control | Layer | Description |
|---------|-------|-------------|
| Schema validation | Firestore rules | Strict field types, allowed keys, server-side timestamps |
| Speed bumps access | Firestore rules | Public read; admin-only create/update/delete with Philadelphia bounds and severity validation |
| Admin access control | Firestore rules + UI | Admin operations require `admin: true` custom claim; client-side admin gate screen blocks unauthorized users |
| Crash reporting | Crashlytics | Flutter error handler, zone error handler, navigation breadcrumbs for crash analysis |
| API key security | Build-time defines | Google Directions API key (optional) injected via `--dart-define`, not committed to source |

### Tech stack (MVP — actual)

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | Flutter (cross-platform: iOS, Android, web, desktop) | Free |
| Maps | OpenStreetMap via `flutter_map` | Free (no API key) |
| Routing | OSRM (Open Source Routing Machine) | Free (no API key) |
| Auth | Firebase Authentication | Free tier |
| Database | Cloud Firestore | Free tier (50K reads/day, 20K writes/day) |
| Crash reporting | Firebase Crashlytics | Free |
| State management | Riverpod + Freezed | Free |
| CI/CD | GitHub Actions | Free tier (2,000 min/month) |

### Launch strategy

1. **Beta test** with delivery company partner (2 weeks)
2. **Soft launch** to email list (Week 10)
3. **Scrappy marketing:** delivery driver forums, Uber/Lyft Facebook groups in Philly, r/philadelphia with demo video

### Success metrics

- 1,000 downloads in first month
- 500 active weekly users
- 4.0+ star rating
- Zero unauthorized admin access incidents

---

## PHASE 2: KILLER FEATURES + GROWTH (Weeks 13–20)

**Goal:** Add unique competitive advantages and drive retention

### New features

#### 2.1 Accelerometer-based severity scoring

- **Sensor integration:** Use device accelerometer (via `sensors_plus`) to detect bump impacts while driving
- **Impact detection:** Monitor vertical G-force spikes above baseline threshold; filter false positives from braking, turning, and road noise using a moving average and minimum speed gate (> 15 km/h)
- **Severity rating:** Map G-force magnitude to 1–5 scale:
  - 1 (mild): < 0.3g deviation — barely noticeable
  - 2 (moderate): 0.3–0.5g — uncomfortable
  - 3 (significant): 0.5–0.8g — jarring
  - 4 (harsh): 0.8–1.2g — potential vehicle damage risk
  - 5 (severe): > 1.2g — hazardous
- **Map visualization:** Color-coded severity markers (green → yellow → orange → red → dark red)
- **Privacy:** Accelerometer data processed on-device only; only the computed severity score and GPS location are sent to the server

#### 2.2 Community verification system

- **Upvote/downvote:** Authenticated users can vote on existing speed bump accuracy — confirming bumps still exist, flagging removed bumps, and rating severity accuracy
- **Promotion rules:**
  - 3+ net upvotes from unique users → bump promoted to "community-verified" status
  - Community-verified bumps are weighted higher in routing avoidance calculations
  - Admin can override community verdict at any time
- **Downvote abuse prevention:**
  - One vote per user per bump
  - Users who consistently downvote verified bumps get flagged for review
  - New accounts (< 7 days old, reputation < 50) have reduced vote weight (0.5x)
- **Firestore data model:**
  - `speed_bumps/{bumpId}/votes/{voterId}` subcollection — stores vote direction and timestamp
  - Aggregated `upvotes` and `downvotes` fields on parent document
- **Safety rules:**
  - Votes subcollection: owner-only write (one doc per user); no updates (vote once only); admin can delete

#### 2.3 Vehicle profiles (already implemented — enhance)

- Current: Sedan, SUV, Lowered Car, Motorcycle, Bicycle with severity threshold adjustments
- **New:** Add vehicle clearance estimate (mm) for more precise avoidance thresholds
- **New:** Truck / delivery van profile with load-sensitivity option
- **New:** Profile persistence in Firestore user document; sync across devices
- **New:** Vehicle-specific route summary: "This route has 3 bumps — safe for SUV, avoid in lowered car"

#### 2.4 Enhanced route preference modes (already implemented — enhance)

- Current: Smooth Ride, Cargo-Conscious, Fast
- **New: Eco-Smooth** — balances fuel efficiency with bump avoidance (prefer highways with fewer bumps over short residential streets with many)
- **New: Accessibility** — avoids bumps rated ≥ 2 for wheelchair-accessible vehicle users
- **New:** Route comparison summary before confirming: time difference, bump count, distance difference

### Growth tactics

- **Referral program:** "Invite a friend, both get 1 month Premium free" — tracked via unique referral codes stored in Firestore
- **Weekly retention push notifications:**
  - "3 new bumps verified on your commute route this week"
  - "You've avoided 12 bumps this month — keep it up!"
- **Social sharing:** "Share your smoothest route" card with bump stats — generates shareable image with route map overlay

### Safety additions for Phase 2

| Control | Description |
|---------|-------------|
| Vote integrity | Server-side vote aggregation; client cannot directly write totals |
| New account restrictions | Accounts < 7 days old have reduced vote weight and cannot flag other reports |
| Accelerometer privacy | Raw sensor data stays on-device; only derived severity scores are transmitted |

### Success metrics

- 5,000 total Philadelphia users
- 30% weekly retention
- 50,000+ severity data points (accelerometer)
- Community vote participation rate > 20% of active users

---

## PHASE 3: GAMIFICATION + MONETIZATION (Weeks 21–32)

**Goal:** Sticky engagement and sustainable revenue

### Gamification system

#### 3.1 Road Scout badge progression

| Badge | Requirement | Icon | Perks |
|-------|-------------|------|-------|
| Rookie Scout | Create account | 🏁 | Access to basic features |
| Street Navigator | 50 routes completed + 50 reputation | 🔍 | Custom map themes |
| Bump Dodger | 200 routes with bump avoidance + 200 reputation | 🎯 | Beta access to new features |
| Pavement Pro | 500 routes + 500 reputation + 100 votes given | ⭐ | Priority support |
| Road Legend | 1,000 routes + 1,000 reputation + 500 miles driven | 🏆 | Free Premium |

#### 3.2 Leaderboards

- **Neighborhood leaderboards:** Top navigators by Philadelphia zip code (miles driven, bumps avoided)
- **Weekly leaderboard:** Most bumps avoided in rolling 7-day window
- **All-time leaderboard:** Cumulative reputation score
- **Safety guardrails:**
  - Leaderboards show display name only (no email or user ID)
  - Users can opt out of leaderboards in privacy settings

#### 3.3 Challenges and achievements

- **Daily challenge:** "Complete a bump-free route on your commute" — small reputation boost
- **Weekly challenge:** "Verify 5 speed bump accuracy votes" — badge progress
- **Streak rewards:** 7-day, 30-day, 90-day driving streaks with escalating reputation multipliers
- **Road trip mode:** Track bumps encountered on a drive; generate a "road report card" at the end

#### 3.4 Reputation system (expand current)

- Current: `reputationScore`, `milesDriven` on user profile
- **New scoring events:**
  | Action | Points |
  |--------|--------|
  | Complete a bump-free route | +5 |
  | Community vote matches consensus | +2 |
  | Referred user's first route | +5 |
  | 7-day streak maintained | +15 |
  | 100 miles driven with app | +10 |
- **Reputation decay:** Inactive users (> 90 days) lose 5% monthly (minimum 0)

### Monetization

#### 3.5 Premium tier

**Price:** $4.99/month or $39.99/year

| Feature | Free | Premium |
|---------|------|---------|
| Map display + routing | ✅ | ✅ |
| Speed bump avoidance | ✅ | ✅ |
| Route history | Last 5 | Unlimited |
| Offline maps | ❌ | ✅ (download Philadelphia) |
| Super Smooth routing (avoid bumps ≥ 1) | ❌ | ✅ |
| Custom map themes | ❌ | ✅ |
| Ad-free experience | ❌ | ✅ |
| Advanced vehicle profiles | Basic 5 | + Truck, Van, RV |
| Priority support | ❌ | ✅ |
| Export route data (GPX) | ❌ | ✅ |

- **Payment:** RevenueCat SDK for iOS/Android subscription management; Firebase custom claims for entitlement checks
- **Safety:** Premium status stored as Firebase custom claim (like admin); cannot be forged client-side; RevenueCat webhook validates purchases server-side

#### 3.6 B2B offerings

- **Logistics API ($99–$499/month):**
  - REST API for fleet route optimization with bump avoidance in Philadelphia
  - Bulk route calculation endpoint
  - Webhook notifications for new bumps on fleet routes
  - SLA: 99.9% uptime, < 200 ms response time
  - **Safety:** API key authentication with per-key rate limits; IP allowlisting option; audit logging
- **Ride-hailing driver tier ($2.99/month):**
  - Uber/Lyft/DoorDash driver mode
  - Auto-detect when app is in use during a delivery; track bumps passively
  - End-of-shift bump report
- **City planner data license ($999/month):**
  - Aggregated, anonymized bump severity heatmaps by Philadelphia neighborhood
  - Severity trend reports (monthly/quarterly)
  - Exportable datasets (CSV, GeoJSON, Shapefile)
  - **Safety:** All data fully anonymized — no user IDs, emails, or individual details; k-anonymity threshold of 5

#### 3.7 Sponsored "Smooth Streets"

- Local auto shops, tire dealers, and suspension specialists can sponsor bump markers
- Sponsored markers show "Tip: [Sponsor] can align your wheels after this bump"
- Ads are non-intrusive: small banner on bump detail view only
- **Safety:** Sponsored content clearly labeled; no tracking beyond impression counts; sponsors cannot influence bump verification or severity ratings

### Safety additions for Phase 3

| Control | Description |
|---------|-------------|
| Subscription validation | RevenueCat server-side receipt validation; Firebase custom claims for entitlement |
| B2B API security | Per-key rate limiting, IP allowlisting, audit logging, OAuth 2.0 for enterprise clients |
| Data anonymization | k-anonymity (k=5) for all exported datasets; no PII in city planner exports |
| Leaderboard opt-out | Users can hide from all leaderboards in privacy settings |

### Success metrics

- 10,000 total Philadelphia users
- 500 premium subscribers
- $2,500/month MRR
- 2–3 B2B partnerships signed
- 40% weekly retention
- Average reputation score > 100 for active users
- < 1% churn rate for premium users in first 3 months

---

## PHASE 4: FULL PRODUCT LAUNCH (Weeks 33–48)

**Goal:** Market leader for speed bump navigation in Philadelphia

### Advanced features

#### 4.1 Turn-by-turn voice navigation

- **Voice guidance:** Text-to-speech directions with bump warnings ("Speed bump in 200 meters — severity 4, moderate impact expected for your sedan")
- **Integration:** Use `flutter_tts` package for cross-platform speech synthesis
- **Bump proximity alerts:** Audio chime + verbal warning at configurable distances (100 m, 200 m, 500 m)
- **Speed-aware warnings:** Adjust warning distance based on current speed — faster speeds get earlier warnings
- **Mute mode:** Quick toggle for phone calls; auto-resume after call ends
- **Safety:** Voice navigation only activates when app detects vehicle speed > 5 km/h; warnings never cover emergency audio alerts

#### 4.2 Offline maps and routing

- **Region download:** Users can download Philadelphia map tiles and speed bump data for offline use
- **Storage:** `sqflite` local database for speed bump data; map tiles cached via `flutter_map` tile cache
- **Offline routing:** Bundled lightweight routing graph (based on OSRM extract for Philadelphia) for basic A-to-B when offline
- **Storage management:** Display cache size in settings; manual clear option; auto-evict tiles older than 30 days

#### 4.3 Health and accessibility mode

- **Accessibility routing:** Avoid bumps ≥ severity 2 for wheelchair-accessible vehicles and users with back/joint conditions
- **Health impact tracking:** Optional journal — log pain events after bump encounters; generate report for medical professional
- **Large text and high contrast mode:** Accessibility-first map overlays for visually impaired users
- **Safety:** Health data stored on-device only; never uploaded to Firebase; export is user-initiated only; no health data in analytics

#### 4.4 Sustainability ("Eco-Smooth") routes

- **Carbon-aware routing:** Calculate CO2 impact of detours to avoid bumps; display "extra emissions" for longest route vs smoothest route
- **Eco score:** Rate each route on a green scale factoring distance, estimated fuel consumption, and bump encounters
- **Dashboard:** Monthly eco-impact summary ("You saved 2.3 kg CO2 by choosing efficient bump-free routes")

#### 4.5 City advocacy tools

- **Bump report cards:** Per-neighborhood severity statistics exported as PDF for city council presentations
- **"Fix This Bump" petitions:** Users can sign digital petitions for the worst bumps; threshold triggers auto-notification to Philadelphia Streets Department
- **Open data contribution:** Verified bump data published as open dataset (GeoJSON + CSV) for civic hackers and urban planners
- **311 integration:** One-tap file a 311 complaint with Philadelphia's existing system, pre-filled with bump location and severity data
- **Safety:** Petition signatures use display names only; 311 filings include user's consent for name + contact sharing; open data exports fully anonymized

#### 4.6 Predictive mapping

- **Deterioration model:** Machine learning model trained on bump severity history to predict which roads will develop new bumps
- **Seasonal patterns:** Incorporate weather and construction data to forecast temporary bump risk changes
- **Route pre-optimization:** Pre-calculate common commute routes nightly and cache bump-free alternatives
- **Data inputs:** Historical bump data, road age (from city data), weather API, construction permit data
- **Safety:** Predictions clearly labeled as estimates; model confidence displayed; no predictions made with < 60% confidence; A/B test predictions before full rollout

#### 4.7 Advanced analytics dashboard

- **User analytics:** Trips completed, bumps avoided, time saved, miles driven with bump avoidance
- **Community analytics:** Total bumps verified, severity distribution by neighborhood
- **Export:** Users can export their trip data as CSV or GPX
- **Safety:** Analytics processed in aggregate; individual user data visible only to the user

### Viral launch campaign

- **"Bumpiest Block in Philly" contest:** Users vote on the worst block; winning block gets media coverage and a petition to the city
- **Local media blitz:** Philadelphia Inquirer feature, 6ABC/NBC10 morning show demo, local podcast tour
- **Influencer partnerships:** Philly driving/commuter YouTube and TikTok creators
- **Street team:** Branded stickers on delivery vehicles; QR code posters at Wawa, Sheetz, gas stations

### Success metrics

- 25,000+ total Philadelphia users
- 1,500 premium subscribers
- $10,000/month MRR
- 3+ major media features (Inquirer, TV, podcasts)
- 4.5+ star average rating
- < 100 ms average route calculation time
- 99.5% app availability
- Offline mode used by 30%+ of active users

---

## FUTURE CONSIDERATIONS

While SpeedBump is laser-focused on being the best speed bump navigation app for Philadelphia, future city expansion is a possibility once the Philly experience is mature. Potential expansion would involve:

- Replicating the open-data pipeline for other cities with public speed bump datasets (Pittsburgh, Baltimore, etc.)
- Per-city geographic bounds and community verification
- Backend scaling (Firebase → dedicated backend with PostGIS) if Firestore free tier limits are exceeded

This remains a long-term consideration and is not on the active roadmap.

---

# TECHNICAL ARCHITECTURE

## System architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Flutter Client                        │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐              │
│  │   Map    │ │ Routing  │ │   Auth    │              │
│  │ (OSM)   │ │ (OSRM)   │ │ (Firebase)│              │
│  └──────────┘ └──────────┘ └───────────┘              │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐              │
│  │Community │ │ Profiles │ │   GPS     │              │
│  │ (Voting) │ │(Firestore)│ │(Geolocator)│             │
│  └──────────┘ └──────────┘ └───────────┘              │
└───────────────┬────────────┬─────────────────────────────┘
                │            │
    ┌───────────▼──┐  ┌──────▼──────┐  ┌───────────────┐
    │  Firestore   │  │    OSRM     │  │  OpenStreetMap │
    │  (users,     │  │(public demo)│  │  (tile server) │
    │  speed_bumps,│  └─────────────┘  └───────────────┘
    │  routes,     │
    │  votes)      │
    └──────────────┘
```

## Data sources

### Primary: Traffic calming devices

- **Source:** OpenDataPhilly — City of Philadelphia
- **Contains:** 1,584+ speed bumps, speed cushions, humps, tables
- **Fields:** Object ID, Speed bump ID, Street segment ID, Installation date, GPS coordinates
- **Formats:** CSV, Shapefile, GeoJSON, ArcGIS REST API
- **API:** `https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/traffic_calming_devices/FeatureServer/0/`
- **Current integration:** Bundled as `assets/data/phl_speed_bumps.json` — hex grid centroids with per-cell counts expanded to deterministic points
- **Contact:** Philadelphia Streets Department

### Supporting: Street centerlines

- Base layer for routing; segment IDs match speed bump data.

---

## Mapping & routing

### Map display: OpenStreetMap via `flutter_map`

- No API key required; free for all usage
- Tile URL: `https://tile.openstreetmap.org/{z}/{x}/{y}.png`
- Package: `flutter_map` (current: ^7.0.2)
- User agent: `com.speedbumpapp.speed_bump_app`

### Routing: OSRM (Open Source Routing Machine)

- No API key required; free public demo server
- Base URL: `https://router.project-osrm.org/route/v1/driving`
- Features: full polyline, step-by-step instructions, waypoint support
- Polyline decoding: same algorithm as Google's encoded polyline format

### Custom routing strategy (waypoint-based bump avoidance)

1. Calculate standard route (OSRM)
2. Query speed bumps within route bounds + 200 m padding
3. Filter to critical bumps based on vehicle profile and route preference mode
4. Check if route intersects bump locations (20 m proximity threshold using Haversine distance to line segments)
5. If intersections found, generate avoidance waypoints (±5 polyline points from each bump)
6. Sort waypoints by their position along the route (prevents routing loops)
7. Recalculate route with avoidance waypoints
8. Compare: return both primary (fastest) and alternative (bump-free) routes

### Optional: Google Directions API

- Available as a fallback or for enhanced routing features
- Key injected via `--dart-define=GOOGLE_DIRECTIONS_API_KEY=...`
- Not required for core functionality

---

## Security architecture

### Defense in depth

```
Layer 1: Client-side validation (UX convenience, not security)
    ↓
Layer 2: Firestore security rules (schema, ownership, bounds, timestamps)
    ↓
Layer 3: Admin review (human verification for speed bump data management)
```

### Threat mitigations

| Threat | Mitigation | Implementation |
|--------|-----------|----------------|
| Unauthorized data access | Firebase rules enforce owner/admin access patterns | `firestore.rules` |
| Out-of-bounds data | Philadelphia geographic bounds enforced in Firestore rules | Firestore rules validate lat/lng ranges |
| Admin impersonation | Firebase custom claims (`admin: true`) set out-of-band; UI admin gate screen | `AdminGateScreen` + Firestore rules |
| API key exposure | Google API key via build-time define; OSRM has no key | `ApiConstants` + `--dart-define` |
| Auth session leaks | Auth stream subscription cancelled on dispose | `AuthStateNotifier.dispose()` |
| Permission state drift | `WidgetsBindingObserver` re-checks permissions on app resume | `MapScreen.didChangeAppLifecycleState` |

---

# Key technical considerations

- **Geospatial:** Haversine distance calculations; point-to-line-segment projection with clamping; 20 m bump proximity threshold; 200 m bounds padding for bump queries; waypoint sorting by route index
- **Data freshness:** Bundled Philadelphia dataset for immediate availability; Firestore for admin-verified bumps; future: periodic sync with Philly ArcGIS API
- **Performance:** `distanceFilter: 10` on GPS stream (updates only when device moves ≥ 10 m); bump data cached in memory after first load; route recalculation throttled (30 s cooldown); bump markers built once per data update
- **Privacy:** No full location history stored on server; user profiles visible only to self and admin; all exported data anonymized with k-anonymity (k=5)
- **Resilience:** Firebase init gracefully handled — app runs with map features even without Firebase credentials; OSRM fallback if routing fails; crash reporting via Crashlytics for production error tracking

---

# Additional resources

- **OpenDataPhilly:** https://opendataphilly.org — Traffic Calming, Street Centerlines
- **OSRM:** https://project-osrm.org/ — Free routing engine (public demo server)
- **OpenStreetMap:** https://www.openstreetmap.org/ — Free map tiles
- **flutter_map:** https://pub.dev/packages/flutter_map — Flutter OpenStreetMap integration
- **Firebase Security Rules:** https://firebase.google.com/docs/rules

---

# Success criteria summary

| Phase | Users | Premium | MRR | Key Metric |
|-------|-------|---------|-----|-----------|
| **MVP** | 1,000 downloads | — | — | 500 weekly active; 4.0+ stars |
| **Growth** | 5,000 | — | — | 30% weekly retention; 50K severity data points |
| **Monetization** | 10,000 | 500 | $2,500 | 40% weekly retention; 2–3 B2B deals |
| **Launch** | 25,000 | 1,500 | $10,000 | 3+ media features; 4.5+ stars; < 100 ms route calc |

---

# Implementation roadmap

| Phase | Timeline | Key Deliverables |
|-------|----------|-----------------|
| Phase 0 | Weeks 1–4 | Landing page, survey, beta partner |
| Phase 1 MVP | Weeks 5–12 | Map + routing + auth + safety rules (**COMPLETE**) |
| Phase 2 Growth | Weeks 13–20 | Accelerometer severity, community voting, enhanced vehicle/route profiles |
| Phase 3 Monetize | Weeks 21–32 | Gamification, premium tier, B2B API, city planner data |
| Phase 4 Launch | Weeks 33–48 | Voice nav, offline, health/accessibility, eco-routes, city advocacy, predictive mapping |

---

# Next steps (immediate action items)

### From current codebase

1. **Improve:** Narrow `Consumer` scope in `MapScreen` to reduce unnecessary Scaffold rebuilds on location updates
2. **Improve:** Use `compute()` isolate for polyline decoding on routes > 1,000 points

### For Phase 2

3. **Add:** `sensors_plus` package for accelerometer integration
4. **Add:** Community voting system (Firestore subcollection)
5. **Add:** Enhanced vehicle profile persistence in Firestore
6. **Add:** Push notification infrastructure (FCM + local notifications)

---

# Marketing video script (Phase 0)

**Duration:** 60 s. **Platforms:** Instagram, TikTok, Facebook, YouTube Shorts, Reddit.

- **Opening:** Car hitting bump, coffee spill, "Another day in Philly…"
- **Problem:** 1,584 bumps; GPS doesn't show them; delivery/rideshare/parent pain.
- **Solution:** SpeedBump app — map of all bumps; routes that avoid them; smooth vs bumpy comparison.
- **Features:** Real-time routing; severity; vehicle profiles; community voting.
- **Social proof:** Short testimonials (delivery, parent, rideshare).
- **CTA:** Download SpeedBump; QR code; "Navigate Philly Without the Bumps."

**Image prompts:** Cinematic bump hit (interior, coffee spill); closing shot of smooth road toward Philly skyline at sunset.

**Rollout:** Teaser (opening only) → full video → paid (e.g. $500–1K) targeting Philly drivers.

---

*SpeedBump is Philadelphia's go-to speed bump navigation app — built on official city data, open-source mapping, and community verification. Designed to help every Philly driver find the smoothest route, every time.*
