# SpeedBump Firebase Security

## Firestore access model

### `submissions/{submissionId}`
- **Read**: Any authenticated user.
- **Create**: Authenticated owner only (`userId == request.auth.uid`) with strict schema validation.
- **Update**: Owner can edit limited mutable fields while preserving moderation fields.
- **Delete**: Admin-only (`request.auth.token.admin == true`).
- **Validation**:
  - `location.latitude` must be in **39.8 - 40.2**.
  - `location.longitude` must be in **-75.3 - -74.9**.
  - `photoUrl` must match `https://firebasestorage.googleapis.com/...`.
  - `status` constrained to workflow values.
  - `submittedAt` and `updatedAt` must be server-side timestamps (`request.time`).

### Submission rate limiting (10 / hour)
- Enforced by requiring a transactional write to:
  - `users/{uid}/meta/rate_limits`
- Required fields:
  - `windowStartedAt`
  - `submissionCount`
- Rule logic enforces:
  - New window starts at `request.time`.
  - Existing window increments by exactly 1.
  - `submissionCount` can never exceed **10** inside a rolling 1-hour window.

### `users/{userId}`
- **Read**: Self + admin.
- **Create**: Self only, `isAdmin` must be `false`.
- **Update**:
  - Self can update profile fields only.
  - Admin can update `isAdmin` only.
- **Delete**: Admin-only.

### `speed_bumps/{bumpId}`
- **Read**: Public.
- **Write/Delete**: Admin-only.
- **Validation**: Coordinates constrained to Philadelphia and severity in range.

### `routes/{routeId}`
- **Read**: Owner-only.
- **Create/Update**: Owner-only.
- **Delete**: Owner or admin.

## Storage access model

### `submissions/{userId}/{filename}`
- **Read**: Authenticated users.
- **Write**: Owner-only.
- **Constraints**:
  - Max file size **5 MB**.
  - MIME type must be one of:
    - `image/jpeg`
    - `image/png`
    - `image/heic`
  - GPS metadata (`latitude`, `longitude`) is required and must match Philadelphia bounds patterns.

## Cloud Functions validation

### `validateSubmission`
Firestore-triggered moderation and integrity checks on submission writes:
- Confirms photo path exists in Firebase Storage.
- Validates coordinates remain in allowed range.
- Detects duplicate reports within **10 meters**.
- Rejects submissions containing profanity in notes.

### `cleanupRejectedSubmissions`
Scheduled daily cleanup:
- Deletes submissions rejected for over **30 days**.
- Removes associated rejected images.
- Removes orphaned files in `submissions/` not referenced by any submission document.

## Admin privileges summary
- Delete any submission.
- Promote/demote `users.isAdmin`.
- Full write access to `speed_bumps`.
- Delete any route.

## Deploy rules
```bash
firebase deploy --only firestore:rules,storage
```

## Deploy functions
```bash
cd functions
npm install
npm run build
firebase deploy --only functions
```
