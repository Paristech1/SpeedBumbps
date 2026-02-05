import 'package:uuid/uuid.dart';

import '../../../auth/data/datasources/firestore_user_datasource.dart';
import '../datasources/firestore_speed_bump_datasource.dart';
import '../../../submission/data/datasources/firestore_submission_datasource.dart';
import '../../../submission/domain/entities/submission.dart';
import '../../domain/repositories/admin_repository.dart';

/// Points awarded when a submission is approved.
const int kReputationPointsPerApproval = 10;

class FirebaseAdminRepository implements AdminRepository {
  FirebaseAdminRepository({
    FirestoreSubmissionDatasource? submissionDatasource,
    FirestoreSpeedBumpDatasource? speedBumpDatasource,
    FirestoreUserDatasource? userDatasource,
  })  : _submission = submissionDatasource ?? FirestoreSubmissionDatasource(),
        _speedBump = speedBumpDatasource ?? FirestoreSpeedBumpDatasource(),
        _user = userDatasource ?? FirestoreUserDatasource();

  final FirestoreSubmissionDatasource _submission;
  final FirestoreSpeedBumpDatasource _speedBump;
  final FirestoreUserDatasource _user;
  final _uuid = const Uuid();

  @override
  Stream<List<Submission>> watchPendingSubmissions() {
    return _submission.watchPendingSubmissions().map(
          (list) => list.map((m) => m.toEntity()).toList(),
        );
  }

  @override
  Future<void> approveSubmission({
    required String submissionId,
    required String adminId,
  }) async {
    final model = await _submission.getSubmission(submissionId);
    if (model == null) throw Exception('Submission not found');

    final bumpId = _uuid.v4();
    await _speedBump.createSpeedBump(
      id: bumpId,
      location: model.location,
      severity: model.severity,
    );
    await _submission.approveSubmission(
      submissionId: submissionId,
      adminId: adminId,
      createdSpeedBumpId: bumpId,
    );
    await _user.incrementReputation(model.userId, kReputationPointsPerApproval);
    await _user.incrementReportCount(model.userId);
  }

  @override
  Future<void> rejectSubmission({
    required String submissionId,
    required String adminId,
    required String reason,
  }) async {
    await _submission.rejectSubmission(
      submissionId: submissionId,
      adminId: adminId,
      reason: reason,
    );
  }
}
