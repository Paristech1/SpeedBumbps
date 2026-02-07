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

1. Clone the repository.
2. Run the setup helper script from the project root:
   ```bash
   ./scripts/setup.sh
   ```
   This runs `flutter clean`, `flutter pub get`, `dart run build_runner build --delete-conflicting-outputs`, and `flutter test`.
3. (Optional) Run `./scripts/prebuild_check.sh` to validate tooling before build.
4. Run `flutter run` (or `./scripts/run_ios.sh` for auto iOS device selection).

Local Maps SDK keys (for map display):
- Android: add `GOOGLE_MAPS_API_KEY=...` to `android/local.properties`.
- iOS: copy `ios/Runner/Maps.xcconfig.example` to `ios/Runner/Maps.xcconfig` and set `GOOGLE_MAPS_API_KEY=...`.
- These files are gitignored.

See **[SETUP.md](SETUP.md)** for:

- Google Maps API key (Android + iOS)
- **Google Directions API key** (Phase 2): set via `--dart-define=GOOGLE_DIRECTIONS_API_KEY=...`
- How to run the setup helper script (`./scripts/setup.sh`) and app (`flutter run`)
- Generating platform files with `flutter create .` if needed


## iOS build requirements

- **Xcode:** 15.0+ recommended (16.x preferred).
- **iOS runtimes:** install at least one runtime from iOS 15, 16, and 17 in Xcode > Settings > Platforms.
- **CocoaPods:** latest stable (`pod --version`).

### iOS launcher helper

Use the helper script to improve build reliability on macOS:

```bash
./scripts/run_ios.sh
```

Behavior:
- Uses a currently booted simulator if present.
- Otherwise boots the latest available iPhone simulator (for example, iPhone 17 class devices).
- Uses attached physical iOS device if found.
- Falls back to `flutter run -d macos` when no iOS target is available.

## Running tests

```bash
flutter test
flutter test integration_test/critical_flows_test.dart
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


## Dependency and reliability checks

```bash
flutter pub outdated
dart pub audit
./scripts/prebuild_check.sh
```

See [DEPENDENCIES.md](DEPENDENCIES.md) for package rationale, migration notes, and known issues.
See [PERFORMANCE.md](PERFORMANCE.md) for profiling procedure and benchmark template.


## CI

GitHub Actions workflow: `.github/workflows/flutter_ci.yml`
- `flutter pub get`
- `build_runner` code generation
- strict `flutter analyze`
- `flutter test --coverage`
- debug APK artifact upload

## Logging and crash reporting

- `lib/core/utils/logger.dart`: debug-only structured logs (`debug/info/warn/error`).
- `firebase_crashlytics` integrated in `main.dart` for uncaught Flutter and zone errors.
- Navigation events are logged through a navigator observer for crash breadcrumbs.
- Manual crash test hook: call `CrashReporting.triggerTestCrash()` in debug builds to validate reporting.
