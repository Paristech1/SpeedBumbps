# Speed Bump App — Setup

## Maps and routing (no API keys required)

- **Map display:** Uses OpenStreetMap via `flutter_map` — no API key needed.
- **Routing:** Uses OSRM (Open Source Routing Machine) public demo — no API key needed.

## Firebase (optional — for auth and profiles)

1. Create a project at [Firebase Console](https://console.firebase.google.com/) (e.g. `SpeedBumpApp`).
2. **Android:** Add an Android app with package name `com.speedbumpapp.speed_bump_app`, then download `google-services.json` and place it in `android/app/`.
3. **iOS:** Add an iOS app with bundle ID `com.speedbumpapp.speed_bump_app`, download `GoogleService-Info.plist` and add it to `ios/Runner/`.
4. In Firebase Console → **Authentication** → Get started → enable **Email/Password** and **Google** sign-in.

Do not commit real `google-services.json` or `GoogleService-Info.plist` with production keys.

## Running the app

From the project root (with Flutter installed and on your PATH):

```bash
./scripts/setup.sh
flutter run
```

The setup helper script runs:

- `flutter pub get`
- `dart run build_runner build --delete-conflicting-outputs`
- `flutter test`

## App behavior

- **Login:** Optional — the app opens directly to the map. Use the menu (drawer) to log in.
- **Firebase:** Optional for running — if Firebase config has placeholder values, Firebase is skipped and the app runs without auth.
- **Speed bumps:** Philadelphia's 1,584+ speed bumps are bundled as an asset and load automatically.
- **Routing:** Tap "Set destination", then tap on the map. The app calculates a route via OSRM with speed bump avoidance.
