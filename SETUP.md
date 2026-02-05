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

## Google Maps API key (map display)

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a project (e.g. `SpeedBumpApp`) and enable **Maps SDK for Android** and **Maps SDK for iOS**.
3. Create an API key and restrict it to your app (Android package name and iOS bundle ID).
4. **Android:** Set the key in `android/app/src/main/AndroidManifest.xml` in the `<meta-data android:name="com.google.android.geo.API_KEY" android:value="..."/>` (replace `YOUR_GOOGLE_MAPS_API_KEY_HERE`).
5. **iOS:** Set the key in `ios/Runner/AppDelegate.swift` in the call `GMSServices.provideAPIKey("...")` (replace `YOUR_GOOGLE_MAPS_API_KEY_HERE`).

Do not commit real API keys to version control. Use environment variables or secure storage in CI/production.

## Google Directions API key (Phase 2 routing)

Route calculation uses the **Directions API**. Use the same project in Google Cloud Console:

1. Enable **Directions API** (and optionally **Routes API**) for your project.
2. The app reads the key from the `GOOGLE_DIRECTIONS_API_KEY` environment variable at build time. Pass it when running or building:
   - **Run:** `flutter run --dart-define=GOOGLE_DIRECTIONS_API_KEY=your_key_here`
   - **Build:** Add `--dart-define=GOOGLE_DIRECTIONS_API_KEY=your_key_here` to your build command.
3. You can reuse the same API key as the Maps SDK key if it has both APIs enabled; restrict it to your app as above.

Do not commit the key. For local development, use a `.env` or shell alias that sets the define.

## Running the app

From the project root (with Flutter installed and on your PATH):

```bash
flutter pub get
flutter run
```

If the project was created manually without `flutter create`, run `flutter create .` once to generate any missing platform files (e.g. iOS Xcode project, Android launcher icons), then replace only the API key placeholders and location permission entries as above.

## Restricting the API key (recommended)

In Google Cloud Console, restrict the key to:

- **Android:** Application restriction → Android apps → add package name `com.speedbumpapp.speed_bump_app` and your SHA-1.
- **iOS:** Application restriction → iOS apps → add bundle ID `com.speedbumpapp.speed_bump_app`.
