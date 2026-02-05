import '../entities/app_user.dart';

/// Abstract auth operations; keeps presentation independent of Firebase.
abstract class AuthRepository {
  /// Stream of auth state: emits current [AppUser] when signed in, null when signed out.
  Stream<AppUser?> get authStateChanges;

  /// Sign up with email and password.
  Future<void> signUpWithEmail({required String email, required String password});

  /// Sign in with email and password.
  Future<void> signInWithEmail({required String email, required String password});

  /// Sign in with Google.
  Future<void> signInWithGoogle();

  /// Sign out.
  Future<void> signOut();

  /// Send password reset email.
  Future<void> resetPassword(String email);

  /// Delete the current user account and all associated data.
  Future<void> deleteAccount();
}
