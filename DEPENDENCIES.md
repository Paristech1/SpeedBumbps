# Dependency Inventory

This file tracks major package usage, migration notes, and known caveats.

## Core framework
- `flutter` / `dart` (SDK): app runtime and tooling.
- `flutter_riverpod`: state management for auth/map/routing providers.

## Mapping and location
- `flutter_map`: OpenStreetMap map rendering, markers, and polylines.
- `latlong2`: coordinate types used throughout the app.
- `geolocator`: foreground location stream and permission helpers.
- `permission_handler`: unified permission handling.

## Networking and data model
- `http`: OSRM routing API requests.
- `freezed_annotation` + `json_annotation`: immutable entities and serialization.
- `freezed` + `json_serializable` + `build_runner` (dev): code generation.
  - **Workaround:** run `dart run build_runner build --delete-conflicting-outputs` after model edits.

## Firebase stack
- `firebase_core`: Firebase bootstrap.
- `firebase_auth`: auth layer (optional — app runs without Firebase).
- `google_sign_in`: Google auth integration.
- `cloud_firestore`: user profiles and speed bump data.
- `firebase_crashlytics`: crash/error reporting and navigation breadcrumbs.

## UI / platform support
- `cupertino_icons`: iOS icon set.
- `flutter_lints`: static linting rules.

## Security & vulnerability checks
Run these locally as part of release readiness:

```bash
flutter pub outdated
dart pub audit
```

If an update is applied for a critical CVE, record package/version and regression-test map/routing/auth flows before merge.
