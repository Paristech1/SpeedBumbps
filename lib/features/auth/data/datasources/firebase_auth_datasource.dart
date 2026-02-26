import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';

class FirebaseAuthDatasource {
  final FirebaseAuth? _firebaseAuth;
  final GoogleSignIn _googleSignIn;
  bool _googleSignInInitialized = false;
  final bool _isFirebaseInitialized;

  FirebaseAuthDatasource({
    FirebaseAuth? firebaseAuth,
    GoogleSignIn? googleSignIn,
  })  : _firebaseAuth = firebaseAuth ?? _getFirebaseAuthSafely(),
        _googleSignIn = googleSignIn ?? GoogleSignIn.instance,
        _isFirebaseInitialized = firebaseAuth != null || _checkFirebaseInitialized();

  static FirebaseAuth? _getFirebaseAuthSafely() {
    try {
      return FirebaseAuth.instance;
    } catch (e) {
      // Firebase not initialized
      return null;
    }
  }

  static bool _checkFirebaseInitialized() {
    try {
      // Try to access Firebase instance
      FirebaseAuth.instance;
      return true;
    } catch (e) {
      return false;
    }
  }

  User? get currentUser {
    if (!_isFirebaseInitialized || _firebaseAuth == null) return null;
    try {
      return _firebaseAuth!.currentUser;
    } catch (e) {
      return null;
    }
  }

  Stream<User?> get authStateChanges {
    if (!_isFirebaseInitialized || _firebaseAuth == null) {
      // Return a stream that immediately emits null (unauthenticated)
      return Stream.value(null);
    }
    try {
      return _firebaseAuth!.authStateChanges();
    } catch (e) {
      // Return a stream that immediately emits null (unauthenticated)
      return Stream.value(null);
    }
  }

  Future<bool> isAdmin({bool forceRefresh = false}) async {
    if (!_isFirebaseInitialized || _firebaseAuth == null) return false;
    final user = currentUser;
    if (user == null) return false;
    try {
      final token = await user.getIdTokenResult(forceRefresh);
      return token.claims?['admin'] == true;
    } catch (e) {
      return false;
    }
  }

  Future<User> signUpWithEmail({
    required String email,
    required String password,
  }) async {
    if (!_isFirebaseInitialized || _firebaseAuth == null) {
      throw Exception('Firebase not initialized - authentication unavailable');
    }
    try {
      final credential = await _firebaseAuth!.createUserWithEmailAndPassword(
        email: email,
        password: password,
      );

      if (credential.user == null) {
        throw Exception('Failed to create user');
      }

      await credential.user!.sendEmailVerification();
      return credential.user!;
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  Future<User> signInWithEmail({
    required String email,
    required String password,
  }) async {
    if (!_isFirebaseInitialized || _firebaseAuth == null) {
      throw Exception('Firebase not initialized - authentication unavailable');
    }
    try {
      final credential = await _firebaseAuth!.signInWithEmailAndPassword(
        email: email,
        password: password,
      );

      if (credential.user == null) {
        throw Exception('Failed to sign in');
      }

      return credential.user!;
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  Future<User> signInWithGoogle() async {
    if (!_isFirebaseInitialized || _firebaseAuth == null) {
      throw Exception('Firebase not initialized - authentication unavailable');
    }
    try {
      if (!_googleSignInInitialized) {
        await _googleSignIn.initialize();
        _googleSignInInitialized = true;
      }

      final GoogleSignInAccount googleUser = await _googleSignIn.authenticate(
        scopeHint: ['email', 'profile'],
      );

      final GoogleSignInAuthentication googleAuth = googleUser.authentication;

      final credential = GoogleAuthProvider.credential(
        idToken: googleAuth.idToken,
        accessToken: null,
      );

      final userCredential =
          await _firebaseAuth!.signInWithCredential(credential);

      if (userCredential.user == null) {
        throw Exception('Failed to sign in with Google');
      }

      return userCredential.user!;
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    } on GoogleSignInException catch (e) {
      throw Exception('Google sign in aborted or failed: ${e.toString()}');
    } catch (e) {
      throw Exception('Google sign in failed: $e');
    }
  }

  Future<void> signOut() async {
    if (!_isFirebaseInitialized || _firebaseAuth == null) {
      return; // Nothing to sign out from
    }
    await Future.wait([
      _firebaseAuth!.signOut(),
      _googleSignIn.signOut(),
    ]);
  }

  Future<void> resetPassword(String email) async {
    if (!_isFirebaseInitialized || _firebaseAuth == null) {
      throw Exception('Firebase not initialized - authentication unavailable');
    }
    try {
      await _firebaseAuth!.sendPasswordResetEmail(email: email);
    } on FirebaseAuthException catch (e) {
      throw _handleAuthException(e);
    }
  }

  Future<void> deleteAccount() async {
    if (!_isFirebaseInitialized || _firebaseAuth == null) {
      throw Exception('Firebase not initialized - authentication unavailable');
    }
    final user = currentUser;
    if (user == null) {
      throw Exception('No user signed in');
    }

    try {
      await user.delete();
    } on FirebaseAuthException catch (e) {
      if (e.code == 'requires-recent-login') {
        throw Exception(
          'Please sign out and sign in again before deleting your account',
        );
      }
      throw _handleAuthException(e);
    }
  }

  Exception _handleAuthException(FirebaseAuthException e) {
    switch (e.code) {
      case 'weak-password':
        return Exception('Password must be at least 6 characters');
      case 'email-already-in-use':
        return Exception('An account already exists with this email');
      case 'invalid-email':
        return Exception('Invalid email address');
      case 'user-not-found':
        return Exception('Invalid credentials');
      case 'wrong-password':
        return Exception('Invalid credentials');
      case 'invalid-credential':
        return Exception('Invalid credentials');
      case 'user-disabled':
        return Exception('This account has been disabled');
      case 'too-many-requests':
        return Exception('Too many attempts. Try again later');
      case 'operation-not-allowed':
        return Exception('This sign-in method is not enabled');
      default:
        return Exception('Authentication error: ${e.message}');
    }
  }
}
