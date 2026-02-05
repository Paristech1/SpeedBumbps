/// Firebase Storage path constants for Phase 4 photo submissions.
class StorageConstants {
  StorageConstants._();

  /// Root for submission photos: submissions/{userId}/{timestamp}.jpg
  static const String submissionsPath = 'submissions';

  static String submissionPhotoPath(String userId, String fileName) {
    return '$submissionsPath/$userId/$fileName';
  }
}
