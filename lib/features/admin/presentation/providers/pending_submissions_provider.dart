import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../submission/domain/entities/submission.dart';
import '../../data/repositories/firebase_admin_repository.dart';
import '../../domain/repositories/admin_repository.dart';

final adminRepositoryProvider = Provider<AdminRepository>((ref) {
  return FirebaseAdminRepository();
});

final pendingSubmissionsProvider =
    StreamProvider<List<Submission>>((ref) {
  final repo = ref.watch(adminRepositoryProvider);
  return repo.watchPendingSubmissions();
});
