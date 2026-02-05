import 'package:firebase_auth/firebase_auth.dart' as firebase_auth;

import '../../domain/entities/app_user.dart';
import '../../domain/repositories/auth_repository.dart';
import '../datasources/firebase_auth_datasource.dart';
import '../datasources/firestore_user_datasource.dart';
import '../models/user_model.dart';

class FirebaseAuthRepository implements AuthRepository {
  final FirebaseAuthDatasource _authDatasource;
  final FirestoreUserDatasource _userDatasource;

  FirebaseAuthRepository({
    required FirebaseAuthDatasource authDatasource,
    required FirestoreUserDatasource userDatasource,
  })  : _authDatasource = authDatasource,
        _userDatasource = userDatasource;

  @override
  Stream<AppUser?> get authStateChanges {
    return _authDatasource.authStateChanges.asyncMap((firebaseUser) async {
      if (firebaseUser == null) return null;
      return _loadOrCreateProfile(firebaseUser);
    });
  }

  Future<AppUser?> _loadOrCreateProfile(firebase_auth.User firebaseUser) async {
    UserModel? userModel =
        await _userDatasource.getUserProfile(firebaseUser.uid);

    if (userModel == null) {
      userModel = UserModel(
        id: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        displayName: firebaseUser.displayName,
        photoUrl: firebaseUser.photoURL,
        createdAt: DateTime.now(),
        lastActive: DateTime.now(),
      );
      await _userDatasource.createUserProfile(userModel);
    }

    return userModel.toEntity();
  }

  @override
  Future<void> signUpWithEmail({
    required String email,
    required String password,
  }) async {
    await _authDatasource.signUpWithEmail(
      email: email,
      password: password,
    );
  }

  @override
  Future<void> signInWithEmail({
    required String email,
    required String password,
  }) async {
    await _authDatasource.signInWithEmail(
      email: email,
      password: password,
    );
  }

  @override
  Future<void> signInWithGoogle() async {
    await _authDatasource.signInWithGoogle();
  }

  @override
  Future<void> signOut() async {
    await _authDatasource.signOut();
  }

  @override
  Future<void> resetPassword(String email) async {
    await _authDatasource.resetPassword(email);
  }

  @override
  Future<void> deleteAccount() async {
    final userId = _authDatasource.currentUser?.uid;
    if (userId == null) {
      throw Exception('No user signed in');
    }
    await _userDatasource.deleteUserProfile(userId);
    await _authDatasource.deleteAccount();
  }
}
