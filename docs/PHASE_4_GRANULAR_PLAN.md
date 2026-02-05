# Phase 4 – Granular Execution Plan

## Segment 1: Dependencies & platform config
- [ ] **1.1** Add to `pubspec.yaml`: `image_picker`, `firebase_storage`, `exif`, `image`, `path_provider`, `uuid`
- [ ] **1.2** Android: camera, storage, `READ_MEDIA_IMAGES` permissions + features in `AndroidManifest.xml`
- [ ] **1.3** iOS: `NSCameraUsageDescription`, `NSPhotoLibraryUsageDescription`, `NSPhotoLibraryAddUsageDescription` in `Info.plist`

## Segment 2: Core utilities
- [ ] **2.1** `lib/core/constants/storage_constants.dart` – Firebase Storage paths
- [ ] **2.2** `lib/core/utils/exif_extractor.dart` – GPS + timestamp from EXIF
- [ ] **2.3** `lib/core/utils/image_compressor.dart` – compress to ≤2MB, max 1920×1080

## Segment 3: Submission domain layer
- [ ] **3.1** `lib/features/submission/domain/entities/submission_status.dart` – enum pending/approved/rejected
- [ ] **3.2** `lib/features/submission/domain/entities/submission.dart` – freezed entity (id, userId, userEmail, photoUrl, location, severity, notes, status, timestamps, review fields)
- [ ] **3.3** `lib/features/submission/domain/repositories/submission_repository.dart` – abstract interface
- [ ] **3.4** Use cases: submit report, get user submissions (extract from photo is in util, optional use case wrapper)

## Segment 4: Submission data layer
- [ ] **4.1** `lib/features/submission/data/models/submission_model.dart` – freezed + fromJson/toJson, fromEntity/toEntity
- [ ] **4.2** `lib/features/submission/data/datasources/firebase_storage_datasource.dart` – upload/delete photo
- [ ] **4.3** `lib/features/submission/data/datasources/firestore_submission_datasource.dart` – CRUD + watch pending, approve/reject
- [ ] **4.4** `lib/features/submission/data/repositories/firebase_submission_repository.dart` – implement domain repository

## Segment 5: Submission presentation layer
- [ ] **5.1** Providers: `submission_provider.dart` (submit state), `user_submissions_provider.dart` (list)
- [ ] **5.2** `camera_screen.dart` – camera vs gallery, navigate to form with `File`
- [ ] **5.3** `submission_form_screen.dart` – photo preview, EXIF then device location, severity, notes, submit
- [ ] **5.4** Widgets: `severity_selector.dart`, `location_mini_map.dart`, `photo_preview.dart` (if needed)
- [ ] **5.5** `submission_history_screen.dart` – list user submissions with status

## Segment 6: Admin domain + data
- [ ] **6.1** `lib/features/admin/domain/entities/review_action.dart` – approve/reject with reason
- [ ] **6.2** `lib/features/admin/domain/repositories/admin_repository.dart` – get pending, approve, reject
- [ ] **6.3** `lib/features/admin/data/datasources/firestore_admin_datasource.dart` – delegate to submission datasource + create speed bump on approve
- [ ] **6.4** `lib/features/admin/data/repositories/firebase_admin_repository.dart` – impl + award reputation via user datasource
- [ ] **6.5** Firestore `speed_bumps` write path (create on approve); extend `FirebaseConstants` for submissions & speed_bumps

## Segment 7: Admin presentation
- [ ] **7.1** `pending_submissions_provider.dart` – stream pending from Firestore
- [ ] **7.2** `admin_dashboard_screen.dart` – list pending, stats, tap to review
- [ ] **7.3** `review_submission_screen.dart` – photo, map, approve/reject with reason
- [ ] **7.4** Widgets: `submission_card.dart`, `review_actions_bar.dart`

## Segment 8: App integration
- [ ] **8.1** Routes: `/camera`, `/submission-history`; push for form
- [ ] **8.2** Map screen: FAB or “Report bump” → Camera screen
- [ ] **8.3** Profile: “My submissions” → Submission history screen
- [ ] **8.4** AuthGate / home: ensure authenticated users can reach camera

## Segment 9: Security & reputation
- [ ] **9.1** Firebase Storage rules: submissions/{userId}/{fileName} – create (auth, size, type), read (auth), delete (owner or admin)
- [ ] **9.2** Firestore rules: submissions (create own+pending, read auth, update/delete admin); speed_bumps (create admin, read true); add `isAdmin()` helper
- [ ] **9.3** On approve: create `speed_bumps` doc, update submission, call user datasource `incrementReputation` + `incrementReportCount`
- [ ] **9.4** (Optional) `firestore.indexes.json` for submissions `status` + `submittedAt` if required

## Out of scope for this pass (Phase 4.5)
- Push notifications (FCM + local) – client deps only or stub; full “send on approve/reject” via Cloud Functions later
- Batch admin operations
- Community voting (Phase 5)

---

## Post-implementation: deploy steps
1. **Firebase Storage rules:** Deploy `storage.rules` (Firebase Console → Storage → Rules, or `firebase deploy --only storage`).
2. **Firestore indexes:** Deploy `firestore.indexes.json` or create composite indexes in console when prompted.
3. **Admin access:** Set custom claim `admin: true` for admin users (Firebase Admin SDK or Cloud Function) so admin rules apply.
4. **Codegen:** Run `flutter pub get && dart run build_runner build --delete-conflicting-outputs` if you add/change freezed classes.
