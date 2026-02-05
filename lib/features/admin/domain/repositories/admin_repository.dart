import '../../submission/domain/entities/submission.dart';

/// Admin-only operations: list pending submissions, approve, reject.
abstract class AdminRepository {
  /// Stream of pending submissions (oldest first).
  Stream<List<Submission>> watchPendingSubmissions();

  /// Approve a submission: create speed bump, update submission, award user reputation.
  Future<void> approveSubmission({
    required String submissionId,
    required String adminId,
  });

  /// Reject a submission with a reason.
  Future<void> rejectSubmission({
    required String submissionId,
    required String adminId,
    required String reason,
  });
}
