# 🚗 SpeedBump App

A navigation app that helps Philadelphia drivers avoid speed bumps, potholes, and road hazards using official city data and AI-powered detection. Starting with Philly's **1,584+ verified traffic calming devices**, SpeedBump aims to become the *"Waze for road conditions"* across 100+ cities.

[![Flutter](https://img.shields.io/badge/Flutter-3.x-02569B?logo=flutter)](https://flutter.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%7C%20Auth-FFCA28?logo=firebase)](https://firebase.google.com/)
[![Mapbox](https://img.shields.io/badge/Maps-Mapbox%20GL%20JS-000000?logo=mapbox)](https://docs.mapbox.com/)
[![HERE Routing](https://img.shields.io/badge/Routing-HERE%20API-00AFAA)](https://developer.here.com/documentation/routing-api/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 📖 Overview

Philadelphia has 1,584+ speed bumps hiding on daily routes — and your GPS doesn't tell you where they are. **SpeedBump does.** Plan routes that avoid them, protect your car, protect your cargo, and protect your sanity.

**Target users:** Daily commuters, delivery drivers (DoorDash, Uber Eats, Instacart), rideshare drivers, and anyone who values a smooth ride.

---

## ✨ Features

### MVP (Phase 1)
- **Interactive Map** — Display all 1,584 official Philadelphia speed bump locations as markers
- **Smart Routing** — A-to-B navigation with real-time speed bump avoidance
- **User Authentication** — Firebase Auth (email + Google sign-in)
- **Vehicle Profiles** — Sedan, SUV, lowered car, motorcycle, bicycle — avoidance thresholds adjust accordingly

### Coming Soon (Phase 2+)
- 📳 **Accelerometer-Based Severity Scoring** — Automatically rates bumps 1–5 using your phone's sensor
- 📸 **Community Submissions** — Photo-based crowdsourced bump reporting with GPS extraction
- 🤖 **AI Detection** — RoboFlow/YOLO models auto-verify submissions at 80%+ confidence
- 🎚️ **Route Preference Modes** — Smooth Ride, Fast, or Cargo-Conscious
- 🏆 **Gamification** — Road Scout badges, neighborhood leaderboards, verification challenges
- 💰 **Premium Tier ($4.99/mo)** — Ad-free, offline maps, super smooth routes, custom themes

---

## 🛠️ Tech Stack

| Category        | Technology                                      |
| --------------- | ----------------------------------------------- |
| Framework       | Flutter (React Native cross-platform)           |
| Map Display     | Mapbox GL JS                                    |
| Routing         | HERE Routing API (segment avoidance)            |
| Backend / Auth  | Firebase (Firestore, Auth, Storage, Functions)  |
| AI / CV         | RoboFlow hosted inference, YOLOv8               |
| Geospatial      | Turf.js, Firebase GeoFire                       |
| State Mgmt      | Freezed + Riverpod                              |
| Analytics       | Firebase Analytics + Sentry                     |
| Language        | Dart / TypeScript                               |

---

## 📊 Data Sources

- **Primary:** [OpenDataPhilly — Traffic Calming Devices](https://opendataphilly.org/datasets/traffic-calming/)
  - 1,584+ speed bumps, speed cushions, humps, and tables
  - Fields: Object ID, Speed Bump ID, Street Segment ID, Install Date, GPS Coordinates
  - REST API: `https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/traffic_calming_devices/FeatureServer/0/`
- **Supporting:** [Street Centerlines](https://opendataphilly.org/datasets/street-centerlines/) — base layer for routing and street segment matching

---

## 🚀 Getting Started

### Prerequisites

- Flutter SDK (3.x+)
- Xcode + iOS Simulator (for iOS builds)
- CocoaPods (`brew install cocoapods`)
- Android Studio (for Android builds)
- Firebase project configured

### Setup

```bash
# 1. Clone the repo
git clone https://github.com/Paristech1/SpeedBumbps.git
cd SpeedBumbps

# 2. Install dependencies
flutter pub get

# 3. Generate Freezed/serialization code (required after every clone)
dart run build_runner build --delete-conflicting-outputs

# 4. Install iOS pods
cd ios && pod install --repo-update && cd ..

# 5. Run the app
flutter run
```

> **Note:** Accept Xcode license if prompted: `sudo xcodebuild -license`  
> **Note:** If CocoaPods fails, try `cd ios && rm Podfile.lock && pod install --repo-update`

---

## 📁 Project Structure

```
lib/
├── core/
│   └── utils/              # exif_extractor, geospatial helpers
├── features/
│   ├── auth/               # Firebase Auth datasource, Google Sign-In 7.x
│   ├── map/                # Map display, routing, geolocator
│   ├── submission/         # User-submitted bumps, photo upload, voting
│   └── admin/              # Admin dashboard, submission review
ios/
│   ├── Podfile             # platform :ios, '15.0'
│   └── Flutter/            # xcconfig files (Debug, Release, Profile)
```

---

## 🗺️ Routing Strategy

1. Calculate standard route via **HERE Routing API** (`avoid[segments]` parameter)
2. Check if route intersects speed bump locations (10–50m buffer using **Turf.js**)
3. If intersections found → add waypoints to force route around bumps
4. Recalculate and return the smoothest valid route

---

## 🤖 AI / Computer Vision (Post-MVP)

User-submitted photo flow:
1. User uploads photo via mobile
2. Send to **RoboFlow** hosted inference API
3. Model returns detection confidence + bounding boxes
4. If confidence > 80% → extract GPS from photo EXIF data
5. Add to database under `pending` status for community verification
6. 3+ upvotes → promote to `verified` layer

Models available:
- Speed Bumps Detection (1,212 images)
- Speed Bump by Road Safety (1,415 images)
- YOLOv8: 90% accuracy, 31.76 FPS, mobile-capable

---

## 🔒 Privacy

- ❌ No exact user location history stored (only anonymized route patterns)
- ✅ Anonymous submission option
- ✅ EXIF data stripped except GPS before public display
- ✅ GDPR/CCPA compliant (data deletion on request)

---

## 🎯 Roadmap & Success Metrics

| Phase | Timeline   | Goal                         | Key Metric                       |
| ----- | ---------- | ---------------------------- | -------------------------------- |
| 0     | Weeks 1–4  | Pre-launch validation        | 500+ email signups               |
| 1     | Weeks 5–12 | MVP launch                   | 1,000 downloads, 4.0+ stars      |
| 2     | Weeks 13–20| Accelerometer + community    | 5,000 users, 50K severity points |
| 3     | Weeks 21–32| Gamification + monetization  | 500 premium subscribers, $2.5K MRR |
| 4     | Weeks 33–48| Full launch + media          | 25,000 users, $10K MRR           |
| 5     | Year 2+    | Multi-city expansion         | 100K users, 100 cities           |

---

## 📚 Resources

- [OpenDataPhilly](https://opendataphilly.org)
- [HERE Routing API Docs](https://developer.here.com/documentation/routing-api/)
- [Mapbox Directions API](https://docs.mapbox.com/api/navigation/directions/)
- [RoboFlow Universe](https://universe.roboflow.com) — search "speed bump"
- [YOLOv8 Documentation](https://docs.ultralytics.com/)
- [FixMyStreet (open source reference)](https://fixmystreet.org)

---

## 🤝 Contributing

Contributions welcome! Please open an issue first to discuss what you'd like to change.

## 📄 License

MIT License
