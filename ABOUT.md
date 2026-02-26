# SpeedBump App — About This Project

This document is the single source of truth for the SpeedBump vision, roadmap, and **current implementation status**.

---

## Current progress — what we've built so far

*Last updated: February 2025*

### Tech stack (actual)

- **Frontend:** Flutter (iOS, Android, web, macOS, Linux, Windows) — cross-platform native app
- **Maps:** OpenStreetMap via `flutter_map` (no API key required)
- **Routing:** OSRM (Open Source Routing Machine) public server — free, no API key; polyline decoding and waypoint-based bump avoidance
- **Backend:** Firebase (Authentication, Firestore, Cloud Storage, Crashlytics)
- **Cloud Functions:** Firebase Cloud Functions (Node.js 20, TypeScript) — server-side submission validation and scheduled cleanup
- **State:** Riverpod; Freezed for domain/state models
- **Photo submissions:** `image_picker`, `exif` for GPS from EXIF, `image` for compression
- **Security:** Firestore and Storage rules with Philadelphia bounds validation, rate limiting, admin claim checks; Cloud Functions profanity filter and duplicate detection

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
- Firestore user profiles with reputation score, report count, miles driven
- User rank system: Rookie → Navigator → Road Warrior → Legend
- Auth stream subscription managed with proper cancellation on dispose
- Password reset and account deletion flows

**Phase 4 — Submissions & admin**

- **Photo submission:** camera capture → EXIF GPS extraction → compress ≤ 2 MB → upload to Firebase Storage; metadata + status in Firestore
- Submission form (location auto-fill from EXIF or device GPS, severity 1–5, notes), submission history screen
- **Admin:** dashboard of pending submissions; review (approve/reject with reason) with Firestore + Storage integration
- Admin gate screen with Firebase custom claim verification — non-admins cannot access admin dashboard
- On approval: creates `speed_bumps` document, updates submission, awards user reputation

**Phase 4 — Security & safety (implemented)**

- **Firestore rules:**
  - Submissions: owner-only create with strict schema validation; admin-only delete; owner-only update of mutable fields
  - Philadelphia geographic bounds enforcement on all submissions (lat 39.8–40.2, lng -75.3 to -74.9)
  - Photo URL must match Firebase Storage domain pattern
  - Server-side timestamp enforcement (`request.time`) on create and update
  - Severity constrained to 1–5 integer range
  - Status workflow enforcement (pending on create; moderation fields immutable by owner)
  - Users: self-read, admin-read; self-create with `isAdmin: false`; self-update profile fields only; admin-update `isAdmin` only
  - Speed bumps: public read; admin-only create/update/delete with Philadelphia bounds and severity validation
  - Routes: owner-only CRUD; admin can delete any route
- **Submission rate limiting (10/hour):**
  - Enforced via transactional write to `users/{uid}/meta/rate_limits`
  - Rolling 1-hour window; count must increment by exactly 1; hard cap at 10
- **Storage rules:**
  - Owner-only upload to `submissions/{userId}/{filename}`
  - Max file size: 5 MB
  - MIME type restricted to `image/jpeg`, `image/png`, `image/heic`
  - GPS metadata (`latitude`, `longitude`) required and validated against Philadelphia bounds via regex
- **Cloud Functions:**
  - `validateSubmission` (Firestore-triggered): validates coordinates, confirms photo exists in Storage, detects profanity in notes, flags duplicate reports within 10 meters; auto-rejects on violations
  - `cleanupRejectedSubmissions` (scheduled daily 02:00): deletes submissions rejected > 30 days with associated photos; removes orphaned Storage files
- **Security rules unit tests:** `tests/security/` — Firestore and Storage rules tests using `@firebase/rules-unit-testing`

**Supporting / core**

- Clean architecture: domain (entities, repository interfaces, use cases), data (repositories, datasources, models), presentation (screens, providers, state)
- Use case: `CalculateRouteWithBumpAvoidance` (route → intersect bumps → inject waypoints → sort by route index → recalculate)
- Utilities: EXIF extractor, image compressor (≤ 2 MB, max 1920×1080), app theme, API/map/Firebase/storage constants
- Crash reporting: Firebase Crashlytics with Flutter error handler, zone error handler, and navigation breadcrumbs
- Structured debug logger (`AppLogger`) with tagged levels (debug/info/warn/error)
- Tests: unit tests for entities, geo utils, route calculation (boundary precision at 19.9999 m and 20.0001 m), route preferences; widget tests for map screen
- CI: GitHub Actions workflow — `flutter pub get` → `build_runner` → `flutter analyze --fatal-infos --fatal-warnings` → `flutter test --coverage` → debug APK artifact upload
- Docs: `SETUP.md`, `SECURITY.md`, `PERFORMANCE.md`, `DEPENDENCIES.md`, audit report, Phase 4 granular plan, threat model

### Deviations from original plan

- **Framework:** Flutter instead of React Native (faster iteration, single codebase for all platforms).
- **Maps:** OpenStreetMap via `flutter_map` instead of Google Maps SDK or Mapbox (no API key required, free for all usage).
- **Routing:** OSRM (free, no API key) instead of HERE Routing API or Google Directions; avoidance implemented via waypoint injection and segment checking.
- **Vehicle profiles and route modes:** Implemented ahead of schedule (originally planned for Phase 2 growth).
- **Security depth:** Rate limiting, Philadelphia bounds enforcement, Cloud Functions validation, profanity detection, and duplicate detection all implemented beyond original Phase 1 scope.
- **Philly open data:** App uses bundled JSON asset derived from Philadelphia's traffic calming hex dataset; structured for easy swap to live Firestore or API data source.

### Known issues (from audit)

| Area | Issue | Severity | Status |
|------|-------|----------|--------|
| Admin | `adminId` hardcoded to `'admin'` in review screen | Medium | TODO — use auth custom claim `request.auth.uid` |
| Submission | Silent no-op when submitting while unauthenticated (race/expired session) | Medium | TODO — show SnackBar on auth failure |
| Performance | `MapScreen` uses `ref.watch(locationStreamProvider)` at build root — full Scaffold rebuild on location updates | Low | TODO — narrow `Consumer` scope |
| Performance | Polyline decoding runs synchronously; risk of main-thread jank on routes > 1,000 points | Low | TODO — use `compute()` isolate |
| Submission | `ImageCompressor` fallback returns original file on decode failure — may exceed 5 MB Storage limit | Low | TODO — validate final size before upload |
| Domain | `Submission` entity imports `flutter/material` for `Color` and `IconData` — domain depends on Flutter | Low | TODO — move UI helpers to presentation layer |

---

# SpeedBump App — Complete Project Plan

## EXECUTIVE SUMMARY

SpeedBump is a navigation app that helps Philadelphia drivers avoid speed bumps, potholes, and road hazards using official city data, AI-powered detection, and crowdsourced submissions. Starting with Philly's 1,584+ verified traffic calming devices, the app will expand to become the "Waze for road conditions" across 100+ cities.

The app is built with Flutter for cross-platform deployment, uses OpenStreetMap for free map display, OSRM for free routing, and Firebase for authentication, data storage, and server-side validation. A layered safety system — Firestore rules, Storage rules, Cloud Functions validation, and rate limiting — ensures data integrity and user privacy from day one.

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
   - Firestore user profiles with reputation, report count, miles driven
   - Splash screen, auth gate, and profile management
   - Password reset and account deletion
4. **Photo submission with safety controls**
   - Camera interface: capture or pick from gallery
   - GPS extraction from EXIF metadata; fallback to device location
   - Image compression (≤ 2 MB, max 1920×1080) before upload
   - Submission form: location (auto-filled), severity (1–5), notes (optional)
   - Submissions enter "pending" queue for admin review
   - Submission history screen for users to track status
5. **Admin review dashboard**
   - Admin gate with Firebase custom claim check (`admin: true`)
   - List of pending submissions with photo, map, severity, and notes
   - Approve (creates verified `speed_bumps` doc, awards user reputation) or reject (with reason)
   - Admin-only delete of any submission

### Safety controls (built into MVP)

| Control | Layer | Description |
|---------|-------|-------------|
| Geographic bounds | Firestore rules | Submissions must have coordinates within Philadelphia (lat 39.8–40.2, lng -75.3 to -74.9) |
| Schema validation | Firestore rules | Strict field types, allowed keys, status workflow, server-side timestamps |
| Rate limiting | Firestore rules | 10 submissions per user per rolling 1-hour window via transactional rate-limit document |
| File constraints | Storage rules | Owner-only upload, 5 MB max, JPEG/PNG/HEIC only, GPS metadata required and bounds-checked |
| Server-side validation | Cloud Function | `validateSubmission`: coordinate check, photo existence check, profanity filter, duplicate detection (10 m) |
| Automated cleanup | Cloud Function | `cleanupRejectedSubmissions`: daily purge of submissions rejected > 30 days + orphaned photos |
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
| Storage | Firebase Cloud Storage | Free tier (5 GB) |
| Functions | Firebase Cloud Functions (Node.js 20, TypeScript) | Free tier (125K invocations/month) |
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
- 100+ user photo submissions
- 4.0+ star rating
- < 5% submission rejection rate for legitimate reports
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
- **Safety rule: server-side validation** extends `validateSubmission` Cloud Function to cross-check accelerometer-derived severity against photo-based severity for consistency

#### 2.2 AI-powered detection (automated verification)

- **Computer vision pipeline:**
  - Integrate RoboFlow pre-trained speed bump / pothole detection models
  - User uploads photo → client sends to RoboFlow hosted inference API → receives confidence score + bounding boxes
  - If confidence ≥ 80%: auto-flag as "AI-verified" → fast-track in admin queue
  - If confidence 40–79%: flag for community voting + admin review
  - If confidence < 40%: flag as "low confidence" with reason
- **On-device option:** TensorFlow Lite model for offline detection (Phase 2.5)
- **Safety rules for AI:**
  - AI verification is advisory only — does not bypass admin approval
  - AI confidence score stored in submission metadata for audit trail
  - `validateSubmission` Cloud Function extended to validate AI metadata fields
  - Rate limiting applies equally to AI-flagged submissions

#### 2.3 Community verification system

- **Upvote/downvote:** Authenticated users can vote on reported bumps; UI shows vote count and user consensus
- **Promotion rules:**
  - 3+ net upvotes from unique users → promoted to "community-verified" status
  - Community-verified bumps are weighted higher in routing avoidance calculations
  - Admin can override community verdict at any time
- **Downvote abuse prevention:**
  - One vote per user per bump
  - Users who consistently downvote verified bumps get flagged for review
  - New accounts (< 7 days old, reputation < 50) have reduced vote weight (0.5x)
- **Firestore data model:**
  - `speed_bumps/{bumpId}/votes/{voterId}` subcollection — stores vote direction and timestamp
  - Aggregated `upvotes` and `downvotes` fields on parent document (updated via Cloud Function to prevent manipulation)
- **Safety rules:**
  - Votes subcollection: owner-only write (one doc per user); no updates (vote once only); admin can delete
  - Cloud Function `aggregateVotes` recalculates totals on vote write to prevent client-side count manipulation

#### 2.4 Vehicle profiles (already implemented — enhance)

- Current: Sedan, SUV, Lowered Car, Motorcycle, Bicycle with severity threshold adjustments
- **New:** Add vehicle clearance estimate (mm) for more precise avoidance thresholds
- **New:** Truck / delivery van profile with load-sensitivity option
- **New:** Profile persistence in Firestore user document; sync across devices
- **New:** Vehicle-specific route summary: "This route has 3 bumps — safe for SUV, avoid in lowered car"

#### 2.5 Enhanced route preference modes (already implemented — enhance)

- Current: Smooth Ride, Cargo-Conscious, Fast
- **New: Eco-Smooth** — balances fuel efficiency with bump avoidance (prefer highways with fewer bumps over short residential streets with many)
- **New: Accessibility** — avoids bumps rated ≥ 2 for wheelchair-accessible vehicle users
- **New:** Route comparison summary before confirming: time difference, bump count, distance difference

### Growth tactics

- **Referral program:** "Invite a friend, both get 1 month Premium free" — tracked via unique referral codes stored in Firestore
- **Weekly retention push notifications:**
  - "3 new bumps reported on your commute route this week"
  - "You've avoided 12 bumps this month — keep it up!"
- **Challenges:** "Report 5 bumps this week to earn the Street Surveyor badge"
- **Social sharing:** "Share your smoothest route" card with bump stats — generates shareable image with route map overlay

### Safety additions for Phase 2

| Control | Description |
|---------|-------------|
| AI audit trail | AI confidence scores and model versions stored per submission for reproducibility |
| Vote integrity | Server-side vote aggregation via Cloud Function; client cannot directly write totals |
| New account restrictions | Accounts < 7 days old have reduced vote weight and cannot flag other reports |
| Accelerometer privacy | Raw sensor data stays on-device; only derived severity scores are transmitted |
| RoboFlow API key protection | Key stored server-side in Cloud Functions environment config; client calls Cloud Function proxy, not RoboFlow directly |

### Success metrics

- 5,000 total users
- 30% weekly retention
- 50,000+ severity data points (accelerometer + manual)
- 500+ AI-verified submissions
- < 2% false positive rate for AI auto-verification
- Community vote participation rate > 20% of active users

---

## PHASE 3: GAMIFICATION + MONETIZATION (Weeks 21–32)

**Goal:** Sticky engagement and sustainable revenue

### Gamification system

#### 3.1 Road Scout badge progression

| Badge | Requirement | Icon | Perks |
|-------|-------------|------|-------|
| Rookie Scout | Create account | 🏁 | Access to basic features |
| Street Surveyor | 10 verified submissions + 50 reputation | 🔍 | Custom map themes |
| Bump Hunter | 50 verified submissions + 200 reputation | 🎯 | Priority admin review of submissions |
| Pavement Pro | 200 verified submissions + 500 reputation + 100 votes given | ⭐ | Beta access to new features |
| Road Legend | 500 verified submissions + 1,000 reputation + community moderator nomination | 🏆 | Free Premium + moderator tools |

#### 3.2 Leaderboards

- **Neighborhood leaderboards:** Top reporters by Philadelphia zip code
- **Weekly leaderboard:** Most verified submissions in rolling 7-day window
- **All-time leaderboard:** Cumulative reputation score
- **Safety guardrails:**
  - Leaderboards show display name only (no email or user ID)
  - Users can opt out of leaderboards in privacy settings
  - Suspicious activity (bulk low-quality submissions) auto-excluded from leaderboards via Cloud Function check
  - Minimum 70% approval rate required to appear on leaderboards

#### 3.3 Challenges and achievements

- **Daily challenge:** "Report 1 bump on your commute" — small reputation boost
- **Weekly challenge:** "Verify 5 community reports" — badge progress
- **Streak rewards:** 7-day, 30-day, 90-day reporting streaks with escalating reputation multipliers
- **"Bump of the Week":** Community vote on most impactful submission — winner featured on home screen
- **Road trip mode:** Track bumps encountered on a drive; generate a "road report card" at the end

#### 3.4 Reputation system (expand current)

- Current: `reputationScore`, `totalReports`, `milesDriven` on user profile
- **New scoring events:**
  | Action | Points |
  |--------|--------|
  | Submission approved | +10 |
  | Submission rejected | -5 |
  | Community vote matches admin verdict | +2 |
  | Community vote contradicts admin verdict | -1 |
  | Referred user's first approved submission | +5 |
  | 7-day streak maintained | +15 |
  | Report flagged as duplicate (automated) | -3 |
- **Reputation decay:** Inactive users (> 90 days) lose 5% monthly (minimum 0)
- **Safety:** Reputation scores calculated server-side via Cloud Functions to prevent manipulation; client reads only

### Monetization

#### 3.5 Premium tier

**Price:** $4.99/month or $39.99/year

| Feature | Free | Premium |
|---------|------|---------|
| Map display + routing | ✅ | ✅ |
| Speed bump avoidance | ✅ | ✅ |
| Photo submissions (10/hr) | ✅ | ✅ (25/hr) |
| Route history | Last 5 | Unlimited |
| Offline maps | ❌ | ✅ (download regions) |
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
  - REST API for fleet route optimization with bump avoidance
  - Bulk route calculation endpoint
  - Webhook notifications for new bumps on fleet routes
  - SLA: 99.9% uptime, < 200 ms response time
  - **Safety:** API key authentication with per-key rate limits; IP allowlisting option; audit logging
- **Ride-hailing driver tier ($2.99/month):**
  - Uber/Lyft/DoorDash driver mode
  - Auto-detect when app is in use during a delivery; track bumps passively
  - End-of-shift bump report
- **City planner data license ($999/month):**
  - Aggregated, anonymized bump density heatmaps by neighborhood
  - Severity trend reports (monthly/quarterly)
  - Exportable datasets (CSV, GeoJSON, Shapefile)
  - **Safety:** All data fully anonymized — no user IDs, emails, or individual submission details; k-anonymity threshold of 5 (areas with < 5 unique reporters are excluded)

#### 3.7 Sponsored "Smooth Streets"

- Local auto shops, tire dealers, and suspension specialists can sponsor bump markers
- Sponsored markers show "Tip: [Sponsor] can align your wheels after this bump"
- Ads are non-intrusive: small banner on bump detail view only
- **Safety:** Sponsored content clearly labeled; no tracking beyond impression counts; sponsors cannot influence bump verification or severity ratings

### Safety additions for Phase 3

| Control | Description |
|---------|-------------|
| Server-side reputation | All point calculations via Cloud Functions; client is read-only |
| Leaderboard opt-out | Users can hide from all leaderboards in privacy settings |
| Subscription validation | RevenueCat server-side receipt validation; Firebase custom claims for entitlement |
| B2B API security | Per-key rate limiting, IP allowlisting, audit logging, OAuth 2.0 for enterprise clients |
| Data anonymization | k-anonymity (k=5) for all exported datasets; no PII in city planner exports |
| Anti-gaming | Suspicious activity detection for leaderboards and badge farming; minimum approval rate thresholds |

### Success metrics

- 10,000 total users
- 500 premium subscribers
- $2,500/month MRR
- 2–3 B2B partnerships signed
- 40% weekly retention
- Average reputation score > 100 for active users
- < 1% churn rate for premium users in first 3 months

---

## PHASE 4: FULL PRODUCT LAUNCH (Weeks 33–48)

**Goal:** Market leader in Philadelphia, expansion-ready

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
- **Sync strategy:** On reconnection, upload queued submissions; download new/updated bump data since last sync
- **Storage management:** Display cache size in settings; manual clear option; auto-evict tiles older than 30 days
- **Safety:** Offline submissions queued with device-local timestamps; server reconciles timestamps on upload; rate limiting applied at upload time, not queue time

#### 4.3 Health and accessibility mode

- **Accessibility routing:** Avoid bumps ≥ severity 2 for wheelchair-accessible vehicles and users with back/joint conditions
- **Health impact tracking:** Optional journal — log pain events after bump encounters; generate report for medical professional
- **Emergency service data:** Export bump density maps in formats usable by ambulance and disability transport dispatchers
- **Large text and high contrast mode:** Accessibility-first map overlays for visually impaired users
- **Safety:** Health data stored on-device only; never uploaded to Firebase; export is user-initiated only; no health data in analytics

#### 4.4 Sustainability ("Eco-Smooth") routes

- **Carbon-aware routing:** Calculate CO2 impact of detours to avoid bumps; display "extra emissions" for longest route vs smoothest route
- **Eco score:** Rate each route on a green scale factoring distance, estimated fuel consumption, and bump encounters
- **Integration:** Partner with carbon offset providers for optional offset purchases
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
- **Data inputs:** Historical bump submissions, road age (from city data), weather API, construction permit data
- **Safety:** Predictions clearly labeled as estimates; model confidence displayed; no predictions made with < 60% confidence; A/B test predictions before full rollout

#### 4.7 Advanced analytics dashboard

- **User analytics:** Trips completed, bumps avoided, time saved, miles driven with bump avoidance
- **Community analytics:** Total bumps reported, verified, rejected; top neighborhoods; severity distribution
- **Admin analytics:** Moderation queue depth, average review time, approval rate, AI accuracy over time
- **Export:** Users can export their trip data as CSV or GPX
- **Safety:** Analytics processed in aggregate; individual user data visible only to the user; admin sees only anonymized aggregate views

#### 4.8 Data marketplace

- **Fleet management companies:** Sell real-time bump API access for route planning
- **Insurance companies:** Anonymized aggregate data on road conditions for risk assessment (e.g. "This zip code has 3x average bump density")
- **Automotive OEMs:** Suspension calibration data — which roads trigger what G-forces at what speeds
- **Pricing:** Per-query for API; monthly license for bulk data; custom for OEM partnerships
- **Safety:** All marketplace data fully anonymized; no individual user data ever sold; compliance with CCPA/GDPR; opt-out available; data use agreements require ethical use clauses

### Viral launch campaign

- **"Bumpiest Block in Philly" contest:** Users vote on the worst block; winning block gets media coverage and a petition to the city
- **Local media blitz:** Philadelphia Inquirer feature, 6ABC/NBC10 morning show demo, local podcast tour
- **Influencer partnerships:** Philly driving/commuter YouTube and TikTok creators
- **Street team:** Branded stickers on delivery vehicles; QR code posters at Wawa, Sheetz, gas stations

### Success metrics

- 25,000+ total users
- 1,500 premium subscribers
- $10,000/month MRR
- 3+ major media features (Inquirer, TV, podcasts)
- 4.5+ star average rating
- < 100 ms average route calculation time
- 99.5% app availability
- Offline mode used by 30%+ of active users

---

## PHASE 5: EXPANSION & SCALE (Year 2+)

**Goal:** "Waze for road conditions" — nationwide and beyond

### Multi-city expansion

#### 5.1 City onboarding framework

- **Data pipeline:** Automated ingest of open data from city portals (OpenDataPhilly model replicated)
  - City-specific adapters: each city's data format → normalized SpeedBump schema
  - Initial cities (Year 2): Pittsburgh, Newark, Baltimore, Washington DC, New York, Boston, Chicago, Detroit, Los Angeles, San Francisco
  - Year 3 target: 100 cities
- **Geographic bounds:** Per-city Firestore rules (extend Philadelphia model to configurable city bounds)
- **Speed bump data sources per city:**
  | City | Data Source | Format |
  |------|-----------|--------|
  | Philadelphia | OpenDataPhilly | GeoJSON, ArcGIS REST |
  | Pittsburgh | WPRDC | CSV, GeoJSON |
  | New York | NYC OpenData | CSV, API |
  | Chicago | Chicago Data Portal | GeoJSON |
  | Los Angeles | LA GeoHub | GeoJSON, Shapefile |
  | Others | Crowdsourced + city partnerships | SpeedBump schema |
- **Safety:** Each city has independent rate limits, admin teams, and moderation queues; cross-city data sharing requires admin approval

#### 5.2 White-label platform

- **SpeedBump for Cities:** SaaS product for municipalities to deploy their own branded version
  - Custom branding (logo, colors, name)
  - City-specific admin dashboard for road maintenance teams
  - Integration with municipal work order systems
  - Resident-facing app with city branding
- **Pricing:** $500–$5,000/month based on city population
- **Safety:** White-label instances are isolated tenants; no data sharing between cities without explicit agreement; each tenant has independent security rules

#### 5.3 Autonomous vehicle partnerships

- **AV data feed:** Real-time bump location and severity API for autonomous vehicle route planning
- **Calibration data:** Vehicle-specific suspension response data to help AV companies tune ride comfort algorithms
- **Partners:** Waymo, Cruise, Aurora, Motional (initial outreach Year 2)
- **Safety:** AV data feed is read-only; no write access; SLA guarantees with failover; data freshness guarantees (< 1 hour for new verified bumps)

#### 5.4 Insurance and fleet partnerships

- **Usage-based insurance:** Provide road condition data to insurers for premium calibration
- **Fleet management:** Integrate with Samsara, Geotab, Verizon Connect for automatic bump logging
- **Vehicle maintenance prediction:** Correlate bump exposure with maintenance schedules
- **Safety:** All insurance data anonymized and aggregated; individual user data never shared without explicit consent; GDPR/CCPA compliance for all data partnerships

#### 5.5 International expansion (Year 3+)

- **Localization:** Multi-language support (Spanish, Portuguese, French, German, Japanese) via Flutter l10n
- **International data sources:** OpenStreetMap speed bump tags, community-sourced data, municipal partnerships
- **Region-specific compliance:** GDPR for EU, LGPD for Brazil, PIPA for Japan
- **Safety:** Per-region data residency requirements; EU data stays in EU data centers; region-specific privacy policies

### Technical scaling

- **Backend migration:** Firebase → dedicated backend (FastAPI/Node.js) + PostgreSQL with PostGIS for geospatial queries when Firebase free tier limits are exceeded
- **Caching:** Redis for route cache and speed bump spatial index; CDN for map tile serving
- **Search:** Elasticsearch/Typesense for bump and location search
- **Observability:** Datadog/Grafana for metrics, alerting, and distributed tracing
- **Security at scale:** WAF, DDoS protection, API gateway with rate limiting per client, SOC 2 Type II certification

### Success metrics

- 100,000+ total users across 10+ cities
- 5,000+ premium subscribers
- $100,000/month MRR
- 3+ B2B enterprise contracts (fleet, insurance, AV)
- White-label deployed in 2+ cities
- 1M+ speed bump data points
- Acquisition discussions with target: $50M+ (Google, Apple, Waze, HERE, TomTom)

---

# TECHNICAL ARCHITECTURE

## System architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Flutter Client                        │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐ ┌──────────┐ │
│  │   Map    │ │ Routing  │ │   Auth    │ │Submission│ │
│  │ (OSM)   │ │ (OSRM)   │ │ (Firebase)│ │  (Photo) │ │
│  └──────────┘ └──────────┘ └───────────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌───────────┐              │
│  │  Admin   │ │ Profiles │ │   GPS     │              │
│  │ (Review) │ │(Firestore)│ │(Geolocator)│             │
│  └──────────┘ └──────────┘ └───────────┘              │
└───────────────┬────────────┬────────────┬──────────────┘
                │            │            │
    ┌───────────▼──┐  ┌──────▼──────┐  ┌──▼────────────┐
    │  Firestore   │  │   Storage   │  │    OSRM       │
    │  (users,     │  │  (photos)   │  │ (public demo) │
    │  submissions,│  └─────────────┘  └───────────────┘
    │  speed_bumps,│
    │  routes)     │  ┌─────────────┐  ┌───────────────┐
    └──────┬───────┘  │ Cloud       │  │  OpenStreetMap │
           │          │ Functions   │  │  (tile server) │
           └──────────┤ (validate,  │  └───────────────┘
                      │  cleanup)   │
                      └─────────────┘
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

## Computer vision (Phase 2+)

- **RoboFlow:** Pre-trained speed bump / pothole detection models
- **YOLO:** YOLOv5-FPNet, YOLOv8; run via RoboFlow hosted API or on-device (TFLite) for offline
- **Flow:** Upload → inference → confidence + bounding boxes; if ≥ 80%, use EXIF GPS → DB → admin fast-track
- **Safety:** AI is advisory only; never bypasses admin review; confidence score stored for audit trail

---

## User submission system

- **Geolocation:** iOS/Android location services via `geolocator`; EXIF extraction via `exif` package; fallback to device GPS
- **Image processing:** Compress to ≤ 2 MB, max 1920×1080 via `image` package before upload
- **Backend:** Firestore (`submissions` collection) with GeoPoint location, status workflow (pending → verified/rejected), severity 1–5; Cloud Storage for photos
- **Validation pipeline:** Client-side compression → Storage rules (size, type, GPS metadata, bounds) → Firestore rules (schema, ownership, rate limit, bounds) → Cloud Function (coordinates, photo existence, profanity, duplicates)

---

## Security architecture

### Defense in depth

```
Layer 1: Client-side validation (UX convenience, not security)
    ↓
Layer 2: Firebase Storage rules (file size, type, GPS metadata, owner path)
    ↓
Layer 3: Firestore security rules (schema, ownership, rate limiting, bounds, timestamps)
    ↓
Layer 4: Cloud Functions (server-side validation, profanity, duplicates, cleanup)
    ↓
Layer 5: Admin review (human verification of all submissions)
```

### Threat mitigations

| Threat | Mitigation | Implementation |
|--------|-----------|----------------|
| Unauthorized data access | Firebase rules enforce owner/admin access patterns | `firestore.rules`, `storage.rules` |
| Submission spam | Rate limiting: 10/hour per user, rolling window | Firestore rules with rate-limit subcollection |
| False/spoofed reports | Admin review required; Cloud Function validates coordinates, checks for duplicates | `validateSubmission` Cloud Function |
| Profanity/abuse | Server-side profanity filter on notes | `validateSubmission` Cloud Function |
| Oversized uploads | 5 MB limit enforced server-side | Storage rules |
| Non-image uploads | MIME type whitelist (JPEG, PNG, HEIC) | Storage rules |
| Out-of-bounds submissions | Philadelphia geographic bounds enforced in Firestore and Storage rules | Both rule sets validate lat/lng ranges |
| Admin impersonation | Firebase custom claims (`admin: true`) set out-of-band; UI admin gate screen | `AdminGateScreen` + Firestore rules |
| Data leakage (photos) | Owner-only upload path; authenticated read only | Storage rules |
| Stale rejected data | Automated daily cleanup after 30 days | `cleanupRejectedSubmissions` Cloud Function |
| Orphaned storage files | Daily orphan scan and deletion | `cleanupRejectedSubmissions` Cloud Function |
| API key exposure | Google API key via build-time define; OSRM has no key | `ApiConstants` + `--dart-define` |
| Auth session leaks | Auth stream subscription cancelled on dispose | `AuthStateNotifier.dispose()` |
| Permission state drift | `WidgetsBindingObserver` re-checks permissions on app resume | `MapScreen.didChangeAppLifecycleState` |

### Security testing

- **Unit tests:** `tests/security/firestore.rules.test.js` and `tests/security/storage.rules.test.js` using Firebase Rules Unit Testing SDK
- **Test coverage:** Unauthenticated access denied; authenticated read allowed; owner-only writes; Philadelphia bounds enforcement; rate limit enforcement (11th submission blocked); admin delete allowed
- **Audit:** Full threat model in `speed bump-threat-model.md`; deep clean audit in `docs/PHASE_1_2_DEEP_CLEAN_AUDIT_REPORT.md`

---

# Key technical considerations

- **Geospatial:** Haversine distance calculations; point-to-line-segment projection with clamping; 20 m bump proximity threshold; 200 m bounds padding for bump queries; waypoint sorting by route index
- **Data freshness:** Bundled Philadelphia dataset for immediate availability; Firestore for user-submitted and admin-verified bumps; future: periodic sync with Philly ArcGIS API
- **Performance:** `distanceFilter: 10` on GPS stream (updates only when device moves ≥ 10 m); bump data cached in memory after first load; route recalculation throttled (30 s cooldown); bump markers built once per data update
- **Privacy:** No full location history stored on server; EXIF GPS used only for submission location; submission photos accessible only to authenticated users; user profiles visible only to self and admin; all exported/marketplace data anonymized with k-anonymity (k=5)
- **Resilience:** Firebase init gracefully handled — app runs with map features even without Firebase credentials; OSRM fallback if routing fails; image compression fallback returns original file on decode error; crash reporting via Crashlytics for production error tracking

---

# Additional resources

- **OpenDataPhilly:** https://opendataphilly.org — Traffic Calming, Street Centerlines
- **OSRM:** https://project-osrm.org/ — Free routing engine (public demo server)
- **OpenStreetMap:** https://www.openstreetmap.org/ — Free map tiles
- **flutter_map:** https://pub.dev/packages/flutter_map — Flutter OpenStreetMap integration
- **RoboFlow Universe:** https://universe.roboflow.com (search "speed bump")
- **Firebase Security Rules:** https://firebase.google.com/docs/rules
- **FixMyStreet:** https://fixmystreet.org — Similar civic tech reference

---

# Success criteria summary

| Phase | Users | Premium | MRR | Key Metric |
|-------|-------|---------|-----|-----------|
| **MVP** | 1,000 downloads | — | — | 500 weekly active; 100+ submissions; 4.0+ stars |
| **Growth** | 5,000 | — | — | 30% weekly retention; 50K severity data points; 500+ AI-verified |
| **Monetization** | 10,000 | 500 | $2,500 | 40% weekly retention; 2–3 B2B deals |
| **Launch** | 25,000 | 1,500 | $10,000 | 3+ media features; 4.5+ stars; < 100 ms route calc |
| **Expansion** | 100,000+ | 5,000+ | $100,000 | 10+ cities; 3+ enterprise contracts; acquisition talks |

---

# Implementation roadmap

| Phase | Timeline | Key Deliverables |
|-------|----------|-----------------|
| Phase 0 | Weeks 1–4 | Landing page, survey, beta partner |
| Phase 1 MVP | Weeks 5–12 | Map + routing + auth + submissions + admin + safety rules (**COMPLETE**) |
| Phase 2 Growth | Weeks 13–20 | Accelerometer severity, AI detection, community voting, enhanced vehicle/route profiles |
| Phase 3 Monetize | Weeks 21–32 | Gamification, premium tier, B2B API, city planner data |
| Phase 4 Launch | Weeks 33–48 | Voice nav, offline, health/accessibility, eco-routes, city advocacy, predictive mapping, data marketplace |
| Phase 5 Scale | Year 2+ | Multi-city (10 → 100), white-label, AV/insurance/fleet partnerships, international |

---

# Next steps (immediate action items)

### From current codebase

1. **Fix:** Replace hardcoded `adminId = 'admin'` in `review_submission_screen.dart` with `request.auth.uid` from Firebase Auth
2. **Fix:** Handle unauthenticated submission attempt — show SnackBar error instead of silent no-op
3. **Improve:** Narrow `Consumer` scope in `MapScreen` to reduce unnecessary Scaffold rebuilds on location updates
4. **Improve:** Use `compute()` isolate for polyline decoding on routes > 1,000 points
5. **Improve:** Validate image size after compression fallback — reject or re-compress if still > 5 MB
6. **Improve:** Move `Color` and `IconData` helpers out of `Submission` domain entity into presentation layer

### For Phase 2

7. **Add:** `sensors_plus` package for accelerometer integration
8. **Add:** RoboFlow API integration via Cloud Function proxy
9. **Add:** Community voting system (Firestore subcollection + Cloud Function aggregation)
10. **Add:** Enhanced vehicle profile persistence in Firestore
11. **Add:** Push notification infrastructure (FCM + local notifications)

---

# Marketing video script (Phase 0)

**Duration:** 60 s. **Platforms:** Instagram, TikTok, Facebook, YouTube Shorts, Reddit.

- **Opening:** Car hitting bump, coffee spill, "Another day in Philly…"
- **Problem:** 1,584 bumps; GPS doesn't show them; delivery/rideshare/parent pain.
- **Solution:** SpeedBump app — map of all bumps; routes that avoid them; smooth vs bumpy comparison.
- **Features:** Real-time routing; severity; vehicle profiles; community photos.
- **Social proof:** Short testimonials (delivery, parent, rideshare).
- **CTA:** Download SpeedBump; QR code; "Navigate Philly Without the Bumps."

**Image prompts:** Cinematic bump hit (interior, coffee spill); closing shot of smooth road toward Philly skyline at sunset.

**Rollout:** Teaser (opening only) → full video → paid (e.g. $500–1K) targeting Philly drivers.

---

*This app is feasible, fills a real need, and is built on a foundation of safety-first engineering. City data exists, pre-trained AI exists, and routing with avoidance is implemented. The layered security architecture — from Firestore rules to Cloud Functions to admin review — ensures data integrity and user privacy as the platform scales from Philadelphia to 100+ cities.*
