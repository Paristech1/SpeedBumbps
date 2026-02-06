# Security Best Practices Report

## Executive Summary
This codebase is a Flutter/Dart client with Firebase Auth, Firestore, and Firebase Storage. The highest-risk issues are overly permissive Firestore and Storage rules that allow broad read access to user/submission data and allow any authenticated user to update `speed_bumps`. These permissions can lead to data tampering and privacy exposure. Tightening rules and adding schema validation are the most impactful secure-by-default improvements.

## Critical
None identified.

## High
1. **[H-1] Any authenticated user can update `speed_bumps` documents**
   - **Impact:** Any logged-in user can tamper with public map data, inflate report counts, or mark bumps as verified.
   - **Evidence:** `firestore.rules:34-38` allows `update` for any authenticated user.
   - **Recommendation:** Restrict updates to admins only, or use Cloud Functions / server-side logic to handle trusted updates. If users should influence counts, allow a narrowly scoped write path (e.g., create a separate `reports` subcollection with per-user write constraints).

2. **[H-2] All authenticated users can read all submissions**
   - **Impact:** Any user can access other users’ submissions, including precise locations, notes, and email addresses.
   - **Evidence:** `firestore.rules:25-31` allows `read` for any authenticated user.
   - **Recommendation:** Restrict reads to the submission owner and admins. If you need aggregated/public visibility, expose a sanitized, denormalized public collection without PII.

3. **[H-3] All authenticated users can read all user profiles**
   - **Impact:** Any logged-in user can enumerate and read profiles, which likely include PII (email, displayName, photo URL).
   - **Evidence:** `firestore.rules:18-23` allows `read` for any authenticated user.
   - **Recommendation:** Restrict profile reads to the owner and admins, or split public vs. private profile data into separate collections with distinct rules.

## Medium
4. **[M-4] Firestore rules allow clients to set sensitive fields without validation**
   - **Impact:** Clients can set or overwrite fields like `reputationScore`, `totalReports`, `reviewedBy`, or `createdSpeedBumpId`, which should be server-managed.
   - **Evidence:** `firestore.rules:18-31` has no field-level validation; `create` and `update` do not constrain allowed keys or types.
   - **Recommendation:** Add schema validation in rules: restrict allowable keys, enforce types, and prevent client writes to server-managed fields. Use `request.resource.data.keys().hasOnly([...])` and verify field values.

5. **[M-5] Any authenticated user can read any submission photo**
   - **Impact:** Photo submissions can contain sensitive imagery; broad read access creates a privacy risk.
   - **Evidence:** `storage.rules:14-21` allows `read` for any authenticated user.
   - **Recommendation:** Restrict reads to the owner and admins, or move public photos to a separate path with explicit rules.

## Low
6. **[L-6] Client-embedded Google Directions API key should be restricted by platform**
   - **Impact:** If the key is leaked, it can be abused for quota theft or cost.
   - **Evidence:** `lib/core/constants/api_constants.dart:6-11` uses a client-provided API key.
   - **Recommendation:** Apply Google API key restrictions (Android/iOS bundle identifiers and SHA-1) and strict API scope/quotas. Consider using a server proxy if you need stronger control.

## Notes
- Email verification is sent on sign-up, but the app does not appear to enforce verified emails for access. If required, add a verification gate in the client or in backend rules using `request.auth.token.email_verified`.

---
If you want, I can propose concrete rule changes or implement fixes one finding at a time.
