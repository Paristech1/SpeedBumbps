# Simulator preview — quick reference

## One-time init (already done)

```bash
cd "/Users/me/speed bump/SpeedBumbps"
flutter pub get
dart run build_runner build --delete-conflicting-outputs
cd ios && pod install && cd ..
```

## Start preview in iOS Simulator

**Option A — Use default device (iPhone 17 is already booted)**

```bash
cd "/Users/me/speed bump/SpeedBumbps"
flutter run
```

**Option B — Pick a specific simulator**

```bash
cd "/Users/me/speed bump/SpeedBumbps"
flutter run -d "iPhone 17"
# or
flutter run -d "iPhone 17 Pro"
# or list all: flutter devices
```

**Option C — Boot a simulator first, then run**

```bash
# Open Simulator app (optional; Flutter can boot it for you)
open -a Simulator

# Then run the app
cd "/Users/me/speed bump/SpeedBumbps"
flutter run
```

## With Google Directions API key (Phase 2 routing)

If you have a Directions API key and want routing to work:

```bash
flutter run --dart-define=GOOGLE_DIRECTIONS_API_KEY=your_key_here
```

## Hot reload

- Press **r** in the terminal while the app is running for hot reload.
- Press **R** for hot restart.
- Press **q** to quit.

## If something breaks

- **Clean and re-run:** `flutter clean && flutter pub get && cd ios && pod install && cd .. && flutter run`
- **Check environment:** `flutter doctor -v`
- **List devices:** `flutter devices`
