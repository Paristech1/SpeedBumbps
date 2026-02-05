import 'dart:io';

import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../entities/submission.dart';

/// Repository for submitting and listing speed bump reports.
abstract class SubmissionRepository {
  /// Upload photo to storage; returns download URL.
  Future<String> uploadPhoto(File photoFile, String userId);

  /// Submit a new report (create Firestore doc with status pending).
  Future<Submission> submitReport({
    required String userId,
    required String userEmail,
    required String photoUrl,
    required LatLng location,
    required int severity,
    String? notes,
  });

  /// Get all submissions for a user, newest first.
  Future<List<Submission>> getUserSubmissions(String userId);

  /// Stream of user submissions (for history screen).
  Stream<List<Submission>> watchUserSubmissions(String userId);
}
