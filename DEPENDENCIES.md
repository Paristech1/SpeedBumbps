# Dependency Inventory

This file tracks major package usage, migration notes, and known caveats.

## Core framework
- `flutter` / `dart` (SDK): app runtime and tooling.
- `flutter_riverpod`: state management for auth/map/routing/submission providers.

## Mapping and location
- `google_maps_flutter`: map rendering, markers, and camera controls.
  - **Known issue:** simulator rendering can stutter on first load; warm start is smoother.
- `geolocator`: foreground location stream and permission helpers.
  - **Migration note:** newer API uses `LocationSettings` and explicit permission checks.
- `permission_handler`: unified permission handling.

## Networking and data model
- `http`: Google Directions API requests and API clients.
- `freezed_annotation` + `json_annotation`: immutable entities and serialization.
- `freezed` + `json_serializable` + `build_runner` (dev): code generation.
  - **Workaround:** run `dart run build_runner build --delete-conflicting-outputs` after model edits.

## Firebase stack
- `firebase_core`: Firebase bootstrap.
- `firebase_auth`: auth layer.
- `google_sign_in`: Google auth integration.
  - **Migration note:** app currently targets 7.x APIs.
- `cloud_firestore`: user/submission storage.
- `firebase_storage`: image uploads.
- `firebase_crashlytics`: crash/error reporting and navigation breadcrumbs.

## Media and file processing
- `image_picker`: image capture/selection.
- `exif`: metadata extraction from photos.
- `image`: compression/pre-processing.
- `path_provider`: temp file locations.
- `uuid`: IDs for submissions/files.

## UI / platform support
- `cupertino_icons`: iOS icon set.
- `flutter_lints`: static linting rules.

## Security & vulnerability checks
Run these locally as part of release readiness:

```bash
flutter pub outdated
dart pub audit
```

If an update is applied for a critical CVE, record package/version and regression-test map/routing/submission/auth flows before merge.
