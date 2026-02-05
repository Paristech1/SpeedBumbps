# Full Project Deep Clean Audit Report

**Date:** February 5, 2025  
**Auditor Role:** Senior SDET & Flutter Architect  
**Scope:** Phase 1 (Map), Phase 2 (Routing), Phase 3 (Auth), Phase 4 (Submission/Admin), Core utilities, Security

---

## SECTION 1: THE "ALGORITHM STRESS TEST" (Phase 2)

### 1.1 Avoidance Math (_distanceToLineSegment & Haversine)

| Check | Finding | Evidence |
|-------|---------|----------|
| **Edge case: bump "past" end of segment** | ✅ Pass | `t = t.clamp(0.0, 1.0)` at line 173 of `calculate_route_with_bump_avoidance.dart` ensures projection is clamped to nearest endpoint; Haversine then measures distance to that endpoint |
| **Inputs in radians** | ✅ Pass | Haversine converts degrees→radians internally: `lat1 = p1.latitude * pi / 180` (line 184). LatLng inputs are in degrees (Google convention). |
| **20.0001 m boundary (ignored)** | ⚠️ No test | No unit test exists for the exact 20 m boundary. `_bumpProximityMeters = 20.0`; `dist <= 20` triggers detection. A bump at 20.0001 m would correctly return `false`, but this is untested. |
| **19.9999 m boundary (detected)** | ⚠️ No test | Same as above; boundary precision is untested. |

**Recommendation:** Add unit tests for `_distanceToLineSegment` with bump at 19.9999 m (expected: detected) and 20.0001 m (expected: ignored). The algorithm itself is correct.

---

### 1.2 Waypoint Injection Logic (_generateAvoidanceWaypoints)

| Check | Finding | Evidence |
|-------|---------|----------|
| **Index bounds (index - 5 < 0)** | ✅ Pass | Lines 146–152: `if (before >= 0 && before < routePoints.length)` and `if (after >= 0 && after < routePoints.length)` provide safe bounds. No crash. |
| **Waypoint order sent to API** | ❌ Bug | Waypoints are added in **bump iteration order**, not route sequence. Google Directions API expects waypoints in travel order. With bumps at indices 10 and 5, we add `[before(5), after(15), before(0), after(10)]` instead of sorted `[0, 5, 10, 15]`. Route may loop or behave incorrectly. |

**Fix Required:** Sort waypoints by their route index before sending to the API:
```dart
// Collect (index, waypoint) pairs, then sort by index before adding
final waypointPairs = <int, LatLng>{}; // or List<(int, LatLng)>
// ... collect ...
waypointPairs.entries.toList()
  ..sort((a, b) => a.key.compareTo(b.key));
for (final e in sorted) waypoints.add(e.value);
```

---

### 1.3 Polyline Decoding (decodePolyline)

| Check | Finding | Evidence |
|-------|---------|----------|
| **Empty string** | ✅ Handled by caller | `google_routing_repository.dart` line 34: `encoded.isEmpty ? <LatLng>[] : _api.decodePolyline(encoded)`. If called with `""`, `decodePolyline` would return `[]` (loop exits immediately). |
| **null input** | ✅ Handled | `routeDto.overviewPolylinePoints ?? ''` ensures null becomes empty string before use. |
| **Long routes (>1000 pts)** | ⚠️ Risk | Decode runs synchronously on the calling isolate. Long polylines could cause main-thread jank. No `compute()` isolate. Consider `compute(decodePolyline, encoded)` for large payloads. |

---

## SECTION 2: UI & STATE MANAGEMENT AUDIT

### 2.1 Rapid Fire Permission Test

| Scenario | Finding | Evidence |
|----------|---------|----------|
| Deny → Background → Grant in Settings → Foreground | ❌ Fail | `MapScreen` does **not** implement `WidgetsBindingObserver`. No `didChangeAppLifecycleState`. App stays in "Permission Denied" until user taps "Grant Permission" (`ref.invalidate(locationStreamProvider)`). |

**Fix Required:** Add `WidgetsBindingObserver` to a suitable widget (e.g. `AuthGate`, `MapScreen`, or root) and re-check location permission on `AppLifecycleState.resumed`; invalidate `locationStreamProvider` to restart the stream.

---

### 2.2 Map Controller Memory Leak Check

| Check | Finding | Evidence |
|-------|---------|----------|
| **Controller disposal** | ✅ Implemented | `map_screen.dart` lines 519–522: `dispose()` calls `ref.read(mapControllerProvider.notifier).state?.dispose()` and sets state to `null`. |
| **Multiple instances** | ✅ Acceptable | `MapScreen` stays mounted when pushing Settings/Profile (Navigator stack). On pop, same instance returns. Controller is disposed only when `MapScreen` is removed from tree (e.g. auth/logout flow). |

**Note:** Verify with Flutter DevTools Memory tab if controller disposal is invoked in your navigation patterns.

---

### 2.3 Impossible Route UI State

| Scenario | Finding | Evidence |
|----------|---------|----------|
| **No internet** | ⚠️ Generic error | `http.get(uri)` will throw (e.g. `SocketException`). Caught in `routing_provider.dart` line 50: `state = RoutingState.error(e.toString())`. User sees technical error, not "No Connection". |
| **ZERO_RESULTS (NY → London)** | ✅ Handled | `DirectionsResponse.fromJson` allows `ZERO_RESULTS`. `response.routes.isEmpty` → `DirectionsException('No routes returned')`. Caught in routing provider → error state. No crash. |

**Recommendation:** Add error categorization (network vs. no route) for clearer UX (e.g. "No route found" vs "Check your connection").

---

## SECTION 3: ARCHITECTURE & CLEAN CODE CHECK

### 3.1 Layer Violation Check

| Rule | Finding | Evidence |
|------|---------|----------|
| **Presentation → Domain** | ✅ OK | `MapScreen` imports `geo_utils.dart` (domain utils) for `distanceFromPointToPolyline`. No `lat * pi / 180` math in UI. |
| **google_maps_flutter in Presentation** | ✅ Acceptable | MapScreen imports `google_maps_flutter` for `GoogleMap`, `LatLng`, `Marker`, `Polyline`—required for map UI. No business logic. |

---

### 3.2 Hardcoded Secrets Scan

| Location | Finding | Evidence |
|----------|---------|----------|
| **AndroidManifest.xml** | ⚠️ Placeholder | `android:value="YOUR_GOOGLE_MAPS_API_KEY_HERE"` (line 18). Placeholder, not real key. |
| **AppDelegate.swift** | ⚠️ Placeholder | `GMSServices.provideAPIKey("YOUR_GOOGLE_MAPS_API_KEY_HERE")` (line 13). |
| **Directions API** | ✅ OK | Uses `--dart-define=GOOGLE_DIRECTIONS_API_KEY` via `ApiConstants.googleDirectionsApiKey`. |
| **AIza prefix** | ✅ None found | No hardcoded `AIza` keys in source. |

**Fix Required:** Move Maps SDK keys to `android/local.properties` (with Gradle substitution) and `ios/Runner/Debug.xcconfig` / `Release.xcconfig`; ensure keys are not committed to git.

---

### 3.3 Riverpod Provider Health

| Check | Finding | Evidence |
|-------|---------|----------|
| **autoDispose usage** | ⚠️ Missing | `locationStreamProvider` is a plain `StreamProvider`—no `autoDispose`. Stream keeps running when user navigates away from map. |
| **ref.watch in onPressed** | ✅ OK | Callbacks use `ref.read` (e.g. `ref.read(routingProvider.notifier).calculateRoute`). |
| **Location stream cancellation** | ⚠️ Risk | Stream is not explicitly cancelled when leaving map. With `StreamProvider.autoDispose`, it would cancel when last listener stops. |

**Recommendation:** Use `locationStreamProvider = StreamProvider.autoDispose<MapState>(...)` so the stream is cancelled when no screen is watching.

---

## SECTION 4: PERFORMANCE PROFILING

### 4.1 Location Stream Throttling

| Check | Finding | Evidence |
|-------|---------|----------|
| **distanceFilter: 10** | ✅ Set | `geolocator_location_repository.dart` line 38: `distanceFilter: 10`. Updates only when device moves ≥10 m. |

**Note:** Validate empirically—log on each update while stationary; updates should be rare/absent.

---

### 4.2 Rebuilds Per Frame

| Check | Finding | Evidence |
|-------|---------|----------|
| **Scaffold rebuild scope** | ⚠️ Manual check | `MapScreen` uses `ref.watch(locationStreamProvider)` at build root. Location updates trigger full `Scaffold` rebuild. Consider `Consumer` around only the map/overlay parts. |

**Recommendation:** Use Flutter DevTools "Widget Rebuild Stats" when moving the camera; isolate rebuilds to `GoogleMap` and overlays where possible.

---

## SECTION 5: AUTH MODULE (Phase 3)

| Check | Finding | Evidence |
|-------|---------|----------|
| **Auth stream subscription leak** | ❌ Bug | `auth_state_provider.dart` line 37: `authDatasource.authStateChanges.listen(...)` is never cancelled. When `AuthStateNotifier` is disposed, the subscription keeps running. |
| **Controller disposal (AuthScreen)** | ✅ Pass | `_tabController`, `_emailController`, etc. disposed in `dispose()`. |
| **resetPassword error handling** | ⚠️ Missing | `resetPassword` in AuthStateNotifier doesn't set state on error; it rethrows. Auth screen catches and shows SnackBar. But `resetPassword` in datasource can throw `FirebaseAuthException`—handled via `_handleAuthException`. |
| **deleteAccount rethrows** | ⚠️ Inconsistent | `deleteAccount` throws instead of setting `AuthState.error`. Profile screen catches and shows SnackBar. Other auth methods set `state = AuthState.error`. |
| **Silent submit when unauthenticated** | ❌ Bug | `submission_form_screen.dart` line 234: `authState.whenOrNull(authenticated: ...)`—if user is unauthenticated (race/expired session), submit does nothing. No SnackBar, no error. |

---

## SECTION 6: SUBMISSION MODULE (Phase 4)

| Check | Finding | Evidence |
|-------|---------|----------|
| **ImageCompressor usage** | ✅ Pass | Used in `firebase_submission_repository.dart` before upload. |
| **Temp file cleanup** | ⚠️ Risk | `ImageCompressor._saveToTempFile` creates files in temp dir. No explicit cleanup. OS typically cleans temp—low risk. |
| **ImageCompressor fallback** | ⚠️ Silent | On decode/compress failure, returns original `imageFile` (line 33). Large unmodified file could exceed Storage rules (5MB). |
| **ExifExtractor edge case** | ⚠️ Risk | `_convertToDecimal` throws if `ratios.length < 3`. `extractLocation` catches and returns null. But `readExifFromBytes` could throw on corrupt files—caught. |
| **userSubmissionsProvider stream** | ⚠️ No autoDispose | Same pattern as location—stream keeps running when user leaves submission history. |
| **Submission domain imports** | ⚠️ Arch | `Submission` entity imports `flutter/material` (Color) and `google_maps_flutter` (LatLng). Domain depends on Flutter/plugins. |

---

## SECTION 7: ADMIN MODULE (Phase 4)

| Check | Finding | Evidence |
|-------|---------|----------|
| **Admin route protection** | ❌ Bug | `/admin` is a named route. Any user can `Navigator.pushNamed(context, '/admin')`. No route guard. Non-admins can view pending submissions. |
| **adminId hardcoded** | ⚠️ TODO | `review_submission_screen.dart` line 36: `final adminId = 'admin'`. TODO to get from auth claims. |
| **Firestore speed_bumps update rule** | ❌ Bug | `firestore.rules` line 38: `allow update: if isAuthenticated()`—any logged-in user can update speed bumps. Should be `isAdmin()`. |
| **Submissions read rule** | ⚠️ Risk | `allow read: if isAuthenticated()`—any authenticated user can read ALL submissions. Fine for admin; combined with no route guard, non-admins can read pending list. |
| **ReviewSubmissionScreen dispose** | ✅ Pass | `_rejectReasonController.dispose()` in dispose. |

---

## SECTION 8: CORE & MAIN

| Check | Finding | Evidence |
|-------|---------|----------|
| **Firebase init error** | ⚠️ Risk | `main.dart` line 9: `await Firebase.initializeApp()`—no try/catch. If Firebase config is invalid, app crashes at startup. |
| **WidgetsBindingObserver** | ❌ Missing | Root `SpeedBumpApp` does not implement `WidgetsBindingObserver`. No app lifecycle handling for permission re-check (Map) or auth token refresh. |
| **Exif date parsing** | ⚠️ Edge case | `_parseExifDate` returns `DateTime.now()` on parse failure (line 62). Could mask invalid EXIF. |

---

## EXECUTION REPORT (Summary Table)

| Area | Test | Status | Fix Required |
|------|------|--------|--------------|
| Logic | Waypoint Injection Index Bounds | ✅ | Pass |
| Logic | Waypoint Injection **Order** | ❌ | Sort waypoints by route index before API call |
| Logic | Haversine / _distanceToLineSegment | ✅ | Pass |
| Logic | 20m Boundary Precision | ⚠️ | Add unit tests for 19.9999 / 20.0001 m |
| Logic | Polyline decode empty/null | ✅ | Pass |
| Logic | Polyline long routes | ⚠️ | Consider `compute()` for >1000 points |
| UI | Permission Lifecycle | ❌ | Add `WidgetsBindingObserver`, re-check on `resumed` |
| UI | Map Controller Dispose | ✅ | Implemented |
| UI | ZERO_RESULTS / No Route | ✅ | Handled, no crash |
| UI | No Internet | ⚠️ | Improve error message (network vs no route) |
| Perf | Location Stream Battery | ✅ | `distanceFilter: 10` set |
| Perf | Rebuild Scope | ⚠️ | Profile; consider narrower `Consumer` usage |
| Arch | API Key Security | ❌ | Move keys to local.properties / xcconfig, exclude from git |
| Arch | Layer Violations | ✅ | Pass |
| Arch | Location Stream autoDispose | ⚠️ | Use `StreamProvider.autoDispose` |
| **Auth** | Auth stream subscription leak | ❌ | Cancel `authStateChanges.listen` in StateNotifier dispose |
| **Auth** | Silent submit when unauthenticated | ❌ | Show SnackBar if authState.whenOrNull does nothing |
| **Admin** | Admin route protection | ❌ | Guard `/admin` with admin claim check; redirect non-admins |
| **Admin** | Firestore speed_bumps update rule | ❌ | Change to `isAdmin()` |
| **Admin** | adminId hardcoded | ⚠️ | Use auth custom claim when available |
| **Submission** | ImageCompressor failure → large upload | ⚠️ | Reject or re-compress if still >5MB after fallback |
| **Submission** | userSubmissionsProvider autoDispose | ⚠️ | Consider autoDispose |
| **Core** | Firebase init error handling | ⚠️ | Wrap in try/catch; show error UI |
| **Core** | Root WidgetsBindingObserver | ❌ | Add for permission/auth lifecycle |

---

## QUICK FIX COMMANDS

```bash
# Static analysis (run when Flutter is available)
flutter analyze
# Rule: Zero errors, zero warnings.

# Tests with coverage
flutter test --coverage
genhtml coverage/lcov.info -o coverage/html
# Rule: 90% coverage on domain/usecases.
```

**Note:** `flutter` was not found in PATH during this audit. Run these commands in an environment where Flutter is installed.

### Test Coverage Gaps (Full Project)
- **Auth:** Only `app_user_test.dart`; no tests for `AuthStateNotifier`, auth datasource, or auth screen.
- **Submission:** No tests for `SubmissionNotifier`, `FirebaseSubmissionRepository`, `ExifExtractor`, or `ImageCompressor`.
- **Admin:** No tests for `FirebaseAdminRepository`, admin screens, or pending submissions provider.
- **Map:** `map_screen_test.dart` and `user_location_test.dart` exist.
- **Routing:** `calculate_route_with_bump_avoidance_test.dart` and `geo_utils_test.dart` exist.

---

## PRIORITY FIX LIST

### Critical (Full Project)
1. **Auth stream leak:** Cancel `authStateChanges` subscription when `AuthStateNotifier` is disposed.
2. **Admin route guard:** Restrict `/admin` to users with `admin: true` custom claim; redirect others.
3. **Firestore rules:** Change `speed_bumps` update rule to `isAdmin()`.
4. **Silent submit:** Handle unauthenticated state in submission form (show error to user).
5. **WidgetsBindingObserver:** Add at root or AuthGate for permission re-check on app resume.

### High (Phase 1–2)
6. **Waypoint order:** Sort waypoints by route index before Google API call.
7. **API keys:** Move to `local.properties` / xcconfig.

### Medium
8. Add boundary unit tests (19.9999 m, 20.0001 m) for Haversine.
9. Firebase init try/catch.
10. adminId from auth claims.

### Low
11. `StreamProvider.autoDispose` for `locationStreamProvider`, `userSubmissionsProvider`, `pendingSubmissionsProvider`.
12. `compute()` for polyline decode on long routes.
13. ImageCompressor: validate size before upload when fallback to original file.
