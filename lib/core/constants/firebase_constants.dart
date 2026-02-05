/// Firebase/Firestore collection and field names for consistency.
class FirebaseConstants {
  FirebaseConstants._();

  static const String usersCollection = 'users';
  static const String submissionsCollection = 'submissions';
  static const String speedBumpsCollection = 'speed_bumps';

  static const String fieldId = 'id';
  static const String fieldEmail = 'email';
  static const String fieldDisplayName = 'displayName';
  static const String fieldPhotoUrl = 'photoUrl';
  static const String fieldReputationScore = 'reputationScore';
  static const String fieldTotalReports = 'totalReports';
  static const String fieldMilesDriven = 'milesDriven';
  static const String fieldCreatedAt = 'createdAt';
  static const String fieldLastActive = 'lastActive';

  // Submissions
  static const String fieldUserId = 'userId';
  static const String fieldUserEmail = 'userEmail';
  static const String fieldLocation = 'location';
  static const String fieldSeverity = 'severity';
  static const String fieldNotes = 'notes';
  static const String fieldStatus = 'status';
  static const String fieldSubmittedAt = 'submittedAt';
  static const String fieldReviewedAt = 'reviewedAt';
  static const String fieldReviewedBy = 'reviewedBy';
  static const String fieldRejectionReason = 'rejectionReason';
  static const String fieldCreatedSpeedBumpId = 'createdSpeedBumpId';

  // Speed bumps (from approved submissions)
  static const String fieldReportCount = 'reportCount';
  static const String fieldLastVerified = 'lastVerified';
  static const String fieldIsVerified = 'isVerified';
}
