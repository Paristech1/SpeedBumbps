# Speed Bump App

Interactive map with real-time location and A-to-B routing with speed bump awareness.

**Full project vision, phases, and current progress:** see **[ABOUT.md](ABOUT.md)**.

## Features

### Phase 1
- Interactive Google Map
- Real-time GPS location (blue dot) with auto-follow
- Location permission and “GPS off” handling
- Low-accuracy warning badge
- Light and dark mode

### Phase 2
- A-to-B navigation using Google Directions API
- Route polyline (green = bump-free, blue/red = has bumps)
- Turn-by-turn directions in a bottom sheet
- Automatic avoidance of verified speed bumps (waypoint injection)
- Alternative route option: Fastest vs Bump-free
- Tap map to set destination; route recalculates on deviation (throttled)

## Setup

See **[SETUP.md](SETUP.md)** for:

- Google Maps API key (Android + iOS)
- **Google Directions API key** (Phase 2): set via `--dart-define=GOOGLE_DIRECTIONS_API_KEY=...`
- How to run the app (`flutter pub get`, `flutter run`)
- Generating platform files with `flutter create .` if needed

## Running tests

```bash
flutter test
```

## Manual QA checklist (real devices)

### Phase 1
- [ ] **iPhone (e.g. 13, iOS 17):** Grant location → map loads with blue dot
- [ ] **Android (e.g. Pixel 6, Samsung S21):** Deny permission → “Location Permission Required” screen
- [ ] Turn off GPS → open app → “GPS is Turned Off” screen
- [ ] Drive ~50 m → blue dot moves smoothly (no jumping)

### Phase 2
- [ ] Tap “Set destination” → tap map → route appears with polyline and directions
- [ ] Bottom sheet shows duration, distance, and turn-by-turn steps
- [ ] When alternative exists, “Fastest” / “Bump-free” toggle switches route
- [ ] Clear route → map returns to normal; set new destination works

## Architecture

- **Domain:** `UserLocation`, `AppRoute`, `RouteStep`, `SpeedBump`; repository interfaces; `CalculateRouteWithBumpAvoidance` use case
- **Data:** Google Directions API, polyline decoding; `LocalSpeedBumpRepository` (in-memory stub)
- **Presentation:** Riverpod (routing state, cache, route options); `MapScreen` with polyline, markers, bottom sheet, deviation-based recalc

Ready for Phase 3 (voice navigation, speed bump reporting UI).
