import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../../core/constants/firebase_constants.dart';
import '../models/submission_model.dart';
import '../../domain/entities/submission_status.dart';

class FirestoreSubmissionDatasource {
  FirestoreSubmissionDatasource({
    FirebaseFirestore? firestore,
  }) : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _col =>
      _firestore.collection(FirebaseConstants.submissionsCollection);

  Future<void> createSubmission(SubmissionModel submission) async {
    final data = submission.toJson();
    data[FirebaseConstants.fieldId] = submission.id;
    await _col.doc(submission.id).set(data);
  }

  Future<SubmissionModel?> getSubmission(String submissionId) async {
    final doc = await _col.doc(submissionId).get();
    if (!doc.exists || doc.data() == null) return null;
    final data = Map<String, dynamic>.from(doc.data()!);
    data[FirebaseConstants.fieldId] = doc.id;
    return SubmissionModel.fromJson(data);
  }

  Future<List<SubmissionModel>> getUserSubmissions(String userId) async {
    final snapshot = await _col
        .where(FirebaseConstants.fieldUserId, isEqualTo: userId)
        .orderBy(FirebaseConstants.fieldSubmittedAt, descending: true)
        .get();
    return snapshot.docs.map((d) => _docToModel(d)).toList();
  }

  Stream<List<SubmissionModel>> watchUserSubmissions(String userId) {
    return _col
        .where(FirebaseConstants.fieldUserId, isEqualTo: userId)
        .orderBy(FirebaseConstants.fieldSubmittedAt, descending: true)
        .snapshots()
        .map((s) => s.docs.map(_docToModel).toList());
  }

  Future<List<SubmissionModel>> getPendingSubmissions() async {
    final snapshot = await _col
        .where(FirebaseConstants.fieldStatus, isEqualTo: 'pending')
        .orderBy(FirebaseConstants.fieldSubmittedAt, descending: false)
        .limit(50)
        .get();
    return snapshot.docs.map(_docToModel).toList();
  }

  Stream<List<SubmissionModel>> watchPendingSubmissions() {
    return _col
        .where(FirebaseConstants.fieldStatus, isEqualTo: 'pending')
        .orderBy(FirebaseConstants.fieldSubmittedAt, descending: false)
        .limit(50)
        .snapshots()
        .map((s) => s.docs.map(_docToModel).toList());
  }

  Future<void> approveSubmission({
    required String submissionId,
    required String adminId,
    required String createdSpeedBumpId,
  }) async {
    await _col.doc(submissionId).update({
      FirebaseConstants.fieldStatus: 'approved',
      FirebaseConstants.fieldReviewedAt: FieldValue.serverTimestamp(),
      FirebaseConstants.fieldReviewedBy: adminId,
      FirebaseConstants.fieldCreatedSpeedBumpId: createdSpeedBumpId,
    });
  }

  Future<void> rejectSubmission({
    required String submissionId,
    required String adminId,
    required String reason,
  }) async {
    await _col.doc(submissionId).update({
      FirebaseConstants.fieldStatus: 'rejected',
      FirebaseConstants.fieldReviewedAt: FieldValue.serverTimestamp(),
      FirebaseConstants.fieldReviewedBy: adminId,
      FirebaseConstants.fieldRejectionReason: reason,
    });
  }

  SubmissionModel _docToModel(QueryDocumentSnapshot<Map<String, dynamic>> doc) {
    final data = Map<String, dynamic>.from(doc.data());
    data[FirebaseConstants.fieldId] = doc.id;
    return SubmissionModel.fromJson(data);
  }
}
