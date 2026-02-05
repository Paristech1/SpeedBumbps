import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/app_user.dart';
import 'auth_state_provider.dart';

/// Current user profile when authenticated; null otherwise.
final userProfileProvider = Provider<AppUser?>((ref) {
  return ref.watch(authStateProvider).whenOrNull(
        authenticated: (user) => user,
      );
});
