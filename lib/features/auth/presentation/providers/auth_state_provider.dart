import 'package:firebase_auth/firebase_auth.dart' as firebase_auth;
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/datasources/firebase_auth_datasource.dart';
import '../../data/datasources/firestore_user_datasource.dart';
import '../../data/models/user_model.dart';
import '../../domain/entities/app_user.dart';
import '../state/auth_state.dart';

final firebaseAuthDatasourceProvider = Provider<FirebaseAuthDatasource>((ref) {
  return FirebaseAuthDatasource();
});

final firestoreUserDatasourceProvider = Provider<FirestoreUserDatasource>((ref) {
  return FirestoreUserDatasource();
});

final authStateProvider =
    StateNotifierProvider<AuthStateNotifier, AuthState>((ref) {
  return AuthStateNotifier(
    authDatasource: ref.watch(firebaseAuthDatasourceProvider),
    userDatasource: ref.watch(firestoreUserDatasourceProvider),
  );
});

class AuthStateNotifier extends StateNotifier<AuthState> {
  final FirebaseAuthDatasource authDatasource;
  final FirestoreUserDatasource userDatasource;

  AuthStateNotifier({
    required this.authDatasource,
    required this.userDatasource,
  }) : super(const AuthState.loading()) {
    _initAuthListener();
  }

  void _initAuthListener() {
    authDatasource.authStateChanges.listen((firebaseUser) async {
      if (firebaseUser == null) {
        state = const AuthState.unauthenticated();
      } else {
        await _loadUserProfile(firebaseUser);
      }
    });
  }

  Future<void> _loadUserProfile(firebase_auth.User firebaseUser) async {
    try {
      final uid = firebaseUser.uid;
      UserModel? userModel = await userDatasource.getUserProfile(uid);

      if (userModel == null) {
        userModel = UserModel(
          id: uid,
          email: firebaseUser.email ?? '',
          displayName: firebaseUser.displayName,
          photoUrl: firebaseUser.photoURL,
          createdAt: DateTime.now(),
          lastActive: DateTime.now(),
        );
        await userDatasource.createUserProfile(userModel);
      }

      state = AuthState.authenticated(userModel.toEntity());
    } catch (e) {
      state = AuthState.error(e.toString());
    }
  }

  Future<void> signInWithEmail({
    required String email,
    required String password,
  }) async {
    state = const AuthState.loading();
    try {
      await authDatasource.signInWithEmail(
        email: email,
        password: password,
      );
    } catch (e) {
      state = AuthState.error(e.toString());
    }
  }

  Future<void> signUpWithEmail({
    required String email,
    required String password,
  }) async {
    state = const AuthState.loading();
    try {
      await authDatasource.signUpWithEmail(
        email: email,
        password: password,
      );
    } catch (e) {
      state = AuthState.error(e.toString());
    }
  }

  Future<void> signInWithGoogle() async {
    state = const AuthState.loading();
    try {
      await authDatasource.signInWithGoogle();
    } catch (e) {
      state = AuthState.error(e.toString());
    }
  }

  Future<void> signOut() async {
    try {
      await authDatasource.signOut();
      state = const AuthState.unauthenticated();
    } catch (e) {
      state = AuthState.error(e.toString());
    }
  }

  Future<void> resetPassword(String email) async {
    await authDatasource.resetPassword(email);
  }

  Future<void> deleteAccount() async {
    try {
      final userId = authDatasource.currentUser?.uid;
      if (userId == null) {
        throw Exception('No user signed in');
      }
      await userDatasource.deleteUserProfile(userId);
      await authDatasource.deleteAccount();
      state = const AuthState.unauthenticated();
    } catch (e) {
      throw Exception(e.toString());
    }
  }
}
