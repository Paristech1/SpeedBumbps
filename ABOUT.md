# SpeedBump App — About This Project

This document is the single source of truth for the SpeedBump vision, roadmap, and **current implementation status**.

---

## Current progress — what we’ve built so far

*Last updated: February 5, 2025*

### Tech stack (actual)

- **Frontend:** Flutter (iOS + Android) — cross-platform native app
- **Maps & routing:** Google Maps SDK + Google Directions API (polyline decoding, waypoint-based bump avoidance)
- **Backend:** Firebase (Authentication, Firestore, Cloud Storage)
- **State:** Riverpod; Freezed for domain/state models
- **Photo submissions:** `image_picker`, `exif` for GPS from EXIF, `image` for compression

### Implemented features

**Phase 1 — Map & location**

- Interactive Google Map with real-time GPS (blue dot, auto-follow)
- Location permission flow and “GPS off” handling
- Low-accuracy warning badge
- Light and dark theme

**Phase 2 — Routing**

- A-to-B navigation via Google Directions API
- Route polyline (green = bump-free segments, blue/red = segments with bumps)
- Turn-by-turn directions in a bottom sheet
- Automatic avoidance of verified speed bumps (waypoint injection; 20 m proximity)
- Route mode: **Fastest** vs **Bump-free**
- Tap map to set destination; route recalculates on deviation (throttled)
- Speed bump data: in-memory/local stub repository (Philadelphia dataset import ready)

**Phase 3 — Auth**

- Firebase Auth: Email/Password and Google sign-in
- Splash screen, auth gate, auth screen, profile screen
- Firestore user profiles

**Phase 4 — Submissions & admin**

- **Photo submission:** camera capture → EXIF GPS extraction → upload to Firebase Storage; metadata + status in Firestore
- Submission form (location, severity, notes), submission history screen
- **Admin:** dashboard of pending submissions; review (approve/reject) with Firestore + Storage integration
- Security: Firestore and Storage rules for authenticated users and admin role

**Supporting / core**

- Clean architecture: domain (entities, repository interfaces, use cases), data (repositories, datasources, models), presentation (screens, providers, state)
- Use case: `CalculateRouteWithBumpAvoidance` (route → intersect bumps → inject waypoints → recalculate)
- Utilities: EXIF extractor, image compressor, app theme, API/map/Firebase constants
- Tests: unit tests for entities, geo utils, route calculation; widget tests for map screen
- Docs: `SETUP.md` (Firebase, Google Maps/Directions keys), `docs/` audit and phase plans

### Deviations from original plan

- **Framework:** Flutter instead of React Native (faster iteration, single codebase for iOS/Android).
- **Maps & routing:** Google Maps + Google Directions API instead of Mapbox/HERE; avoidance implemented via waypoint injection and segment checking rather than HERE’s `avoid[segments]`.
- **Philly open data:** App is structured for 1,584+ Philadelphia traffic calming devices; currently using a local/stub speed bump repository until the official dataset is wired in.

### Next steps (from current codebase)

- Fix waypoint ordering (sort by route index before sending to Directions API) — see audit report
- Add lifecycle handling for location permission (e.g. `WidgetsBindingObserver` on resume)
- Import Philadelphia’s 1,584 speed bump dataset into the app (e.g. Firestore or bundled asset + `SpeedBumpRepository`)
- Phase 3 (README): voice navigation, speed bump reporting UI refinements

---

# SpeedBump App — Complete Project Plan

## EXECUTIVE SUMMARY

SpeedBump is a navigation app that helps Philadelphia drivers avoid speed bumps, potholes, and road hazards using official city data, AI-powered detection, and crowdsourced submissions. Starting with Philly's 1,584+ verified traffic calming devices, the app will expand to become the "Waze for road conditions" across 100+ cities.

---

# PROJECT PHASES

## PHASE 0: PRE-LAUNCH VALIDATION (Weeks 1-4)

**Goal:** Validate demand before building

### Deliverables

- **Landing page with map teaser** showing 1,584 Philly speed bumps
- **Email signup form** (goal: 500+ signups)
- **Driver survey** (target: 100 responses)
  - "Would you pay $3 for this app?"
  - "What's your biggest routing pain point?"
  - "How often do speed bumps affect your routes?"
- **Beta partner outreach** to 3-5 local delivery companies

### Success metrics

- 500+ email signups
- 60%+ survey respondents say "yes" to paying
- 1 delivery company commits to beta testing

---

## PHASE 1: MVP LAUNCH (Weeks 5-12)

**Goal:** Prove core value with minimal features

### Core features

1. **Map display**
   - Show Philadelphia's 1,584 official speed bump locations as markers
   - Clean, fast-loading interface
   - Zoom/pan functionality
2. **Basic routing**
   - A-to-B navigation with speed bump awareness
   - Algorithm: Calculate route → Check intersections → Add avoidance waypoints
   - Integration: HERE Routing API with segment avoidance
3. **User authentication**
   - Firebase Auth (email/Google sign-in)
   - Basic user profiles
4. **Photo submission (manual review)**
   - Camera interface for uploading speed bump photos
   - GPS extraction from EXIF data
   - Submissions go to "pending" queue for admin approval

### Tech stack (MVP — original plan)

- **Frontend:** React Native (cross-platform)
- **Map display:** Mapbox GL JS
- **Backend:** Firebase (Auth, Firestore, Storage)
- **Routing:** HERE Routing API
- **Data source:** Philadelphia OpenDataPhilly API

### Launch strategy

1. **Beta test** with delivery company partner (2 weeks)
2. **Soft launch** to email list (Week 10)
3. **Scrappy marketing:** delivery driver forums, Uber/Lyft Facebook groups in Philly, r/philadelphia with demo video

### Success metrics

- 1,000 downloads in first month
- 500 active weekly users
- 100+ user photo submissions
- 4.0+ star rating

---

## PHASE 2: KILLER FEATURE + GROWTH (Weeks 13-20)

**Goal:** Add unique competitive advantage and drive retention

### New features

- **Accelerometer-based severity scoring:** detect bump harshness, rate 1–5 stars, color-coded on map (green = mild, red = harsh)
- **AI detection (automated):** RoboFlow pre-trained models; auto-verify submissions with 80%+ confidence; flag low-confidence for community voting
- **Community verification:** upvote/downvote; 3+ upvotes = promoted to verified layer; user reputation
- **Vehicle profiles:** Sedan, SUV, Lowered Car, Motorcycle, Bicycle; adjust avoidance thresholds
- **Route preference modes:** "Smooth Ride", "Fast", "Cargo-Conscious"

### Growth tactics

- Referral program; weekly retention (push notifications, challenges)

### Success metrics

- 5,000 total users; 30% weekly retention; 50,000+ severity data points; 500+ AI-verified submissions

---

## PHASE 3: GAMIFICATION + MONETIZATION (Weeks 21-32)

**Goal:** Sticky engagement and revenue

### Gamification

- **Road Scout badges:** Rookie Scout → Street Surveyor → Bump Hunter → Pavement Pro → Road Legend
- **Leaderboards by neighborhood;** verification challenges; "Bump of the Week"; road trip mode

### Monetization

- **Premium tier:** $4.99/month or $39.99/year (ad-free, unlimited history, Super Smooth routes, offline maps, themes, priority support)
- **B2B:** logistics API, ride-hailing driver tier, city planner data
- **Sponsored “Smooth Streets”** (local auto/tire shops)

### Success metrics

- 10,000 users; 500 premium subscribers; $2,500/month MRR; 2–3 B2B partnerships

---

## PHASE 4: FULL PRODUCT LAUNCH (Weeks 33-48)

**Goal:** Market leader, expansion-ready

### Advanced features

- Health & accessibility mode; sustainability (“Eco-Smooth”) routes; city advocacy tools; predictive mapping; data marketplace

### Viral launch

- “Bumpiest Block in Philly” contest; local media (Inquirer, TV, podcasts)

### Success metrics

- 25,000+ users; 1,500 premium; $10,000/month MRR; 3+ major media features; 4.5+ stars

---

## PHASE 5: EXPANSION & SCALE (Year 2+)

**Goal:** “Waze for road conditions” nationwide

- Multi-city (10 cities Year 2, 100 by Year 3); white-label; AV/insurance/municipal partnerships; acquisition potential (Google/Apple/Waze, $50M+ target).

---

# TECHNICAL ARCHITECTURE

## Data sources

### Primary: Traffic calming devices

- **Source:** OpenDataPhilly — City of Philadelphia
- **Contains:** 1,584+ speed bumps, speed cushions, humps, tables
- **Fields:** Object ID, Speed bump ID, Street segment ID, Installation date, GPS coordinates
- **Formats:** CSV, Shapefile, GeoJSON, ArcGIS REST API
- **API:** `https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/traffic_calming_devices/FeatureServer/0/`
- **Contact:** Philadelphia Streets Department (Mike Matela — michael.matela@phila.gov)

### Supporting: Street centerlines

- Base layer for routing; segment IDs match speed bump data.

---

## Mapping & routing APIs

### Option A: HERE Routing API (original recommendation)

- `avoid[segments]` to exclude road segments; free tier.

### Option B: Mapbox Directions API

- No native avoid coordinates; workaround via alternative routes + client-side filter.

### Custom routing strategy (used in this app)

1. Calculate standard route (e.g. Google Directions).
2. Check if route intersects speed bump locations (e.g. 10–50 m buffer).
3. If yes, add waypoints to avoid bumps.
4. Recalculate route with modified waypoints.

---

## Computer vision (user submissions)

- **RoboFlow:** pre-trained speed bump / pothole models.
- **YOLO:** YOLOv5-FPNet, YOLOv8; run via RoboFlow hosted API or on-device (e.g. TFLite) for offline.
- Flow: upload → inference → confidence + boxes; if > 80%, use EXIF GPS → DB → community verification.

---

## User submission system

- **Geolocation:** iOS/Android location for camera; PWA: `navigator.geolocation`; EXIF via exif.js or equivalent.
- **Backend:** Firestore (GeoPoint, status: pending | verified | rejected), Cloud Storage for photos; geoqueries; upvotes/downvotes.

---

## Recommended tech stack (original)

- **Frontend:** React Native; Mapbox or Leaflet; Redux Toolkit; React Navigation.
- **Backend:** Firebase (Firestore, Storage, Auth, Cloud Functions).
- **AI/ML:** RoboFlow; optional TensorFlow Lite on-device.
- **Routing:** HERE primary; Mapbox backup.
- **Analytics:** Firebase Analytics; Sentry; Remote Config.

---

# Key technical considerations

- **Geospatial:** Turf.js-style logic (point-in-polygon, distance); 10–50 m buffer; Haversine.
- **Data freshness:** Weekly sync with Philly API; user submissions live immediately; promote after 3+ upvotes or admin approval.
- **Performance:** Spatial indexing (e.g. GeoFire); cache routes; lazy-load bumps (viewport + buffer); compress uploads &lt; 500 KB.
- **Privacy:** No full location history; anonymous submission option; strip EXIF except GPS for display; GDPR/CCPA.

---

# Additional resources

- **OpenDataPhilly:** https://opendataphilly.org — Traffic Calming, Street Centerlines.
- **HERE:** https://developer.here.com/documentation/routing-api/
- **Mapbox:** https://docs.mapbox.com/api/navigation/directions/
- **RoboFlow Universe:** https://universe.roboflow.com (search “speed bump”).
- **FixMyStreet:** https://fixmystreet.org

---

# Success criteria summary

- **MVP:** 1,000 downloads; 500 weekly active users; 100+ submissions; 4.0+ stars.
- **Growth:** 5,000 users; 30% weekly retention; 50,000+ severity points.
- **Monetization:** 10,000 users; 500 premium; $2,500/month MRR.
- **Launch:** 25,000 users; 1,500 premium; $10,000/month MRR; 3+ media features.
- **Expansion:** 100,000+ users, 10 cities; $100K/month MRR; acquisition discussions.

---

# Implementation roadmap (from plan)

- **Phase 1 MVP:** Import 1,584 Philly bumps; map UI; A–B routing with bump awareness (waypoints).
- **Phase 2:** Camera + EXIF; community voting; vehicle profiles; route modes.
- **Phase 3:** AI (RoboFlow/YOLO); gamification; monetization.
- **Phase 4:** Turn-by-turn voice; offline; analytics; health/sustainability; advocacy; predictive; data marketplace.

---

# Next steps (immediate action items from plan)

- **Week 1–2:** Landing page, email capture, driver survey, beta partner outreach.
- **Week 3–4:** Tech stack locked; Firebase; import Philly dataset; map prototype.
- **Week 5–8:** MVP (map, routing, photo submission); internal + beta testing.
- **Week 9–12:** Soft launch; marketing; feedback; plan Phase 2 (e.g. accelerometer severity).

---

# Marketing video script (Phase 0)

**Duration:** 60 s. **Platforms:** Instagram, TikTok, Facebook, YouTube Shorts, Reddit.

- **Opening:** Car hitting bump, coffee spill, “Another day in Philly…”
- **Problem:** 1,584 bumps; GPS doesn’t show them; delivery/rideshare/parent pain.
- **Solution:** SpeedBump app — map of all bumps; routes that avoid them; smooth vs bumpy comparison.
- **Features:** Real-time routing; severity; vehicle profiles; community photos.
- **Social proof:** Short testimonials (delivery, parent, rideshare).
- **CTA:** Download SpeedBump; QR code; “Navigate Philly Without the Bumps.”

**Image prompts:** Cinematic bump hit (interior, coffee spill); closing shot of smooth road toward Philly skyline at sunset.

**Rollout:** Teaser (opening only) → full video → paid (e.g. $500–1K) targeting Philly drivers.

---

*This app is feasible and fills a real need: city data exists, pre-trained AI exists, and routing with avoidance is implementable. Crowdsourcing will improve it over time.*
