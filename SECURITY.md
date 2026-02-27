# SpeedBump Firebase Security

## Firestore access model

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
- **Validation**: Coordinates constrained to Philadelphia bounds (lat 39.8–40.2, lng -75.3 to -74.9) and severity in range 1–5.

### `routes/{routeId}`
- **Read**: Owner-only.
- **Create/Update**: Owner-only.
- **Delete**: Owner or admin.

## Deploy rules
```bash
firebase deploy --only firestore:rules
```
