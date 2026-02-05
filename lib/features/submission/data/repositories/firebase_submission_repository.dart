import 'dart:io';

import 'package:uuid/uuid.dart';

import '../../../../core/utils/image_compressor.dart';
import '../../domain/entities/submission.dart';
import '../../domain/entities/submission_status.dart';
import '../../domain/repositories/submission_repository.dart';
import '../datasources/firebase_storage_datasource.dart';
import '../datasources/firestore_submission_datasource.dart';
import '../models/submission_model.dart';

class FirebaseSubmissionRepository implements SubmissionRepository {
  FirebaseSubmissionRepository({
    FirebaseStorageDatasource? storageDatasource,
    FirestoreSubmissionDatasource? firestoreDatasource,
  })  : _storage = storageDatasource ?? FirebaseStorageDatasource(),
        _firestore = firestoreDatasource ?? FirestoreSubmissionDatasource();

  final FirebaseStorageDatasource _storage;
  final FirestoreSubmissionDatasource _firestore;
  final _uuid = const Uuid();

  @override
  Future<String> uploadPhoto(File photoFile, String userId) async {
    final compressed = await ImageCompressor.compress(photoFile);
    return _storage.uploadSubmissionPhoto(
      photoFile: compressed,
      userId: userId,
    );
  }

  @override
  Future<Submission> submitReport({
    required String userId,
    required String userEmail,
    required String photoUrl,
    required LatLng location,
    required int severity,
    String? notes,
  }) async {
    final id = _uuid.v4();
    final model = SubmissionModel(
      id: id,
      userId: userId,
      userEmail: userEmail,
      photoUrl: photoUrl,
      latitude: location.latitude,
      longitude: location.longitude,
      severity: severity,
      notes: notes,
      status: SubmissionStatus.pending,
      submittedAt: DateTime.now(),
    );
    await _firestore.createSubmission(model);
    return model.toEntity();
  }

  @override
  Future<List<Submission>> getUserSubmissions(String userId) async {
    final list = await _firestore.getUserSubmissions(userId);
    return list.map((m) => m.toEntity()).toList();
  }

  @override
  Stream<List<Submission>> watchUserSubmissions(String userId) {
    return _firestore.watchUserSubmissions(userId).map(
          (list) => list.map((m) => m.toEntity()).toList(),
        );
  }
}
