## Cursor Cloud specific instructions

### Overview

Speed Bump App — a Flutter-based map/navigation app that helps drivers avoid speed bumps. Uses OpenStreetMap (via `flutter_map`) and OSRM for routing (no API keys needed). Firebase is used for auth, Firestore, Storage, and Crashlytics but is **optional at runtime** — the app gracefully degrades if Firebase is not configured.

### Services

| Service | Stack | Purpose |
|---|---|---|
| Flutter app | Dart / Flutter (web) | Main app — map, routing, submissions |
| Cloud Functions | Node.js 20 / TypeScript | `functions/` — submission validation, cleanup |
| Security tests | Node.js 20 | `tests/security/` — Firebase rules unit tests |

### Running the app (web, development)

```bash
flutter run -d web-server --web-port=8080 --web-hostname=0.0.0.0
```

The app opens on `http://localhost:8080`. Map tiles load from OSM without keys. Firebase features (auth, submissions, admin) require a configured Firebase project or emulators — without them the app still renders the map and navigation UI.

### Lint / Analyze / Test

Standard commands per `README.md`:

- **Lint:** `flutter analyze` (CI uses `--fatal-infos --fatal-warnings`; the repo currently has pre-existing warnings/infos)
- **Tests:** `flutter test` (33 unit/widget tests)
- **Cloud Functions lint:** `cd functions && npm run lint`
- **Cloud Functions build:** `cd functions && npm run build`
- **Security tests:** `cd tests/security && npm test` (requires Firebase Emulator running)

### Code generation

After editing Freezed model files, regenerate with:

```bash
dart run build_runner build --delete-conflicting-outputs
```

### Non-obvious caveats

- **Node.js version:** Cloud Functions require Node.js 20 (`engines.node` in `functions/package.json`). Use `nvm use 20` before working in `functions/` or `tests/security/`.
- **Security tests peer deps:** `tests/security/package.json` has a `firebase` vs `@firebase/rules-unit-testing` peer conflict; install with `npm install --legacy-peer-deps`.
- **Flutter SDK path:** Flutter is installed at `/home/ubuntu/flutter` and added to `PATH` via `~/.bashrc`.
- **No `firebase.json`:** The repo does not include a `firebase.json`; one must be created to use the Firebase Emulator Suite locally.
- **Asset directories:** `assets/images/` and `assets/data/` are referenced in `pubspec.yaml`; ensure they exist before building.
