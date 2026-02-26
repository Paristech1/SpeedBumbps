import 'dart:io';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../data/repositories/firebase_submission_repository.dart';
import '../../domain/repositories/submission_repository.dart';
import '../state/submission_state.dart';

final submissionRepositoryProvider = Provider<SubmissionRepository>((ref) {
  return FirebaseSubmissionRepository();
});

final submissionProvider =
    StateNotifierProvider<SubmissionNotifier, SubmissionState>((ref) {
  final repo = ref.watch(submissionRepositoryProvider);
  return SubmissionNotifier(repo);
});

class SubmissionNotifier extends StateNotifier<SubmissionState> {
  SubmissionNotifier(this._repo) : super(const SubmissionState.initial());

  final SubmissionRepository _repo;

  Future<void> submitReport({
    required String userId,
    required String userEmail,
    required File photoFile,
    required LatLng location,
    required int severity,
    String? notes,
  }) async {
    state = const SubmissionState.loading();
    try {
      final photoUrl = await _repo.uploadPhoto(photoFile, userId);
      await _repo.submitReport(
        userId: userId,
        userEmail: userEmail,
        photoUrl: photoUrl,
        location: location,
        severity: severity,
        notes: notes,
      );
      state = const SubmissionState.success();
    } catch (e, _) {
      state = SubmissionState.error(e.toString());
    }
  }

  void reset() {
    state = const SubmissionState.initial();
  }
}
