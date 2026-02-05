import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../../core/constants/firebase_constants.dart';
import '../models/user_model.dart';

class FirestoreUserDatasource {
  final FirebaseFirestore _firestore;

  FirestoreUserDatasource({
    FirebaseFirestore? firestore,
  }) : _firestore = firestore ?? FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> get _usersCollection =>
      _firestore.collection(FirebaseConstants.usersCollection);

  Future<void> createUserProfile(UserModel user) async {
    try {
      await _usersCollection.doc(user.id).set(user.toJson());
    } catch (e) {
      throw Exception('Failed to create user profile: $e');
    }
  }

  Future<UserModel?> getUserProfile(String userId) async {
    try {
      final doc = await _usersCollection.doc(userId).get();

      if (!doc.exists || doc.data() == null) {
        return null;
      }

      return UserModel.fromJson(doc.data()!);
    } catch (e) {
      throw Exception('Failed to fetch user profile: $e');
    }
  }

  Future<void> updateUserProfile(
    String userId,
    Map<String, dynamic> updates,
  ) async {
    try {
      await _usersCollection.doc(userId).update(updates);
    } catch (e) {
      throw Exception('Failed to update user profile: $e');
    }
  }

  Stream<UserModel?> watchUserProfile(String userId) {
    return _usersCollection.doc(userId).snapshots().map((snapshot) {
      if (!snapshot.exists || snapshot.data() == null) {
        return null;
      }
      return UserModel.fromJson(snapshot.data()!);
    });
  }

  Future<void> deleteUserProfile(String userId) async {
    try {
      await _usersCollection.doc(userId).delete();
    } catch (e) {
      throw Exception('Failed to delete user profile: $e');
    }
  }

  Future<void> incrementReputation(String userId, int points) async {
    try {
      await _usersCollection.doc(userId).update({
        FirebaseConstants.fieldReputationScore: FieldValue.increment(points),
        FirebaseConstants.fieldLastActive: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      throw Exception('Failed to update reputation: $e');
    }
  }

  Future<void> incrementReportCount(String userId) async {
    try {
      await _usersCollection.doc(userId).update({
        FirebaseConstants.fieldTotalReports: FieldValue.increment(1),
        FirebaseConstants.fieldLastActive: FieldValue.serverTimestamp(),
      });
    } catch (e) {
      throw Exception('Failed to update report count: $e');
    }
  }
}
