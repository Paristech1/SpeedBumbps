# Speed Bump App — Setup

## Firebase (Phase 3 — Auth and profiles)

1. Create a project at [Firebase Console](https://console.firebase.google.com/) (e.g. `SpeedBumpApp`).
2. **Android:** Add an Android app with package name `com.speedbumpapp.speed_bump_app`, then download `google-services.json` and place it in `android/app/` (overwrite the placeholder).
3. **iOS:** Add an iOS app with bundle ID `com.speedbumpapp.speed_bump_app`, download `GoogleService-Info.plist` and add it to `ios/Runner/` in Xcode (right‑click Runner → Add Files).
4. In Firebase Console → **Authentication** → Get started → enable **Email/Password** and **Google** sign-in. For Google Sign-In on Android, add your debug (and release) SHA-1 in Firebase → Project settings → Your apps → Android app; get SHA-1 with `cd android && ./gradlew signingReport`.
5. In Firebase Console → **Firestore Database** → Create database (production mode), choose a location (e.g. `us-east1`).
6. Deploy Firestore security rules from this repo:
   ```bash
   firebase deploy --only firestore:rules
   ```
   Or copy the contents of `firestore.rules` into Firebase Console → Firestore → Rules and publish.

Do not commit real `google-services.json` or `GoogleService-Info.plist` with production keys; use placeholders or CI secrets.

## Maps and routing (no API keys required)

- **Map display:** Uses OpenStreetMap via `flutter_map` — no API key needed.
- **Routing:** Uses OSRM (Open Source Routing Machine) public demo — no API key needed.

## Running the app

From the project root (with Flutter installed and on your PATH):

```bash
./scripts/setup.sh
flutter run
```

The setup helper script stops on the first error. Run it from the project root. It runs:

- `flutter pub get`
- `dart run build_runner build --delete-conflicting-outputs`
- `flutter test`

If the project was created manually without `flutter create`, run `flutter create .` once to generate any missing platform files (e.g. iOS Xcode project, Android launcher icons), then replace only the API key placeholders and location permission entries as above.

## App behavior

- **Login:** Optional — the app opens directly to the map. Use the menu (drawer) to log in.
- **Firebase:** Optional for running — if `GoogleService-Info.plist` has placeholder values, Firebase is skipped and the app runs without auth/storage.
