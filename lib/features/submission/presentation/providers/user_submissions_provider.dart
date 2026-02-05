import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/firebase_submission_repository.dart';
import '../../domain/entities/submission.dart';
import '../../domain/repositories/submission_repository.dart';
import '../../../auth/presentation/providers/auth_state_provider.dart';

final userSubmissionsProvider = StreamProvider<List<Submission>>((ref) {
  final authState = ref.watch(authStateProvider);
  return authState.when(
    authenticated: (user) {
      final repo = ref.watch(submissionRepositoryProvider);
      return repo.watchUserSubmissions(user.id);
    },
    unauthenticated: () => Stream.value([]),
    loading: () => Stream.value([]),
    error: (_) => Stream.value([]),
  );
});
