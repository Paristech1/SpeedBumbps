# Speed Bump App

Philadelphia-focused navigation app with real-time location and A-to-B routing that avoids speed bumps.

Uses OpenStreetMap for maps and OSRM for routing — **no API keys required**.

**Full project vision, phases, and current progress:** see **[ABOUT.md](ABOUT.md)**.

## Features

- Interactive OpenStreetMap with real-time GPS (blue dot, auto-follow)
- Location permission and "GPS off" handling
- Low-accuracy warning badge
- Light and dark mode
- A-to-B routing via OSRM with speed bump awareness
- Philadelphia's 1,584+ speed bumps displayed on map
- Route polyline with turn-by-turn directions in a bottom sheet
- Automatic avoidance of verified speed bumps (waypoint injection, 20 m proximity)
- Route toggle: **Fastest** vs **Bump-free**
- Tap map to set destination; route recalculates on deviation (throttled)
- Vehicle profiles: Sedan, SUV, Lowered Car, Motorcycle, Bicycle
- Route modes: Smooth Ride, Cargo-Conscious, Fast

## Setup

1. Clone the repository.
2. Run the setup helper script from the project root:
   ```bash
   ./scripts/setup.sh
   ```
   This runs `flutter clean`, `flutter pub get`, `dart run build_runner build --delete-conflicting-outputs`, and `flutter test`.
3. Run `flutter run` (or `./scripts/run_ios.sh` for auto iOS device selection).

No API keys are needed — maps use OpenStreetMap and routing uses OSRM (both free).

See **[SETUP.md](SETUP.md)** for Firebase configuration (optional — app runs without it).

## Running tests

```bash
flutter test
```

## Manual QA checklist

- [ ] Grant location → map loads with blue dot and speed bump markers
- [ ] Tap "Set destination" → tap map → route appears with polyline and directions
- [ ] Bottom sheet shows duration, distance, and turn-by-turn steps
- [ ] When alternative exists, "Fastest" / "Bump-free" toggle switches route
- [ ] Clear route → map returns to normal; set new destination works
- [ ] Deny permission → "Location Permission Required" screen
- [ ] Turn off GPS → "GPS is Turned Off" screen

## Architecture

- **Domain:** `UserLocation`, `AppRoute`, `RouteStep`, `SpeedBump`; repository interfaces; `CalculateRouteWithBumpAvoidance` use case
- **Data:** OSRM Directions API, polyline decoding; `AssetSpeedBumpRepository` (bundled Philadelphia dataset)
- **Presentation:** Riverpod (routing state, cache, route options); `MapScreen` with polyline, markers, bottom sheet, deviation-based recalc

## Dependency and reliability checks

```bash
flutter pub outdated
dart pub audit
```

See [DEPENDENCIES.md](DEPENDENCIES.md) for package rationale, migration notes, and known issues.

## CI

GitHub Actions workflow: `.github/workflows/flutter_ci.yml`
- `flutter pub get`
- `build_runner` code generation
- strict `flutter analyze`
- `flutter test --coverage`
- debug APK artifact upload
