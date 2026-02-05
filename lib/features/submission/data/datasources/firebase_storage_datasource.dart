import 'dart:io';

import 'package:firebase_storage/firebase_storage.dart';

class FirebaseStorageDatasource {
  FirebaseStorageDatasource({
    FirebaseStorage? storage,
  }) : _storage = storage ?? FirebaseStorage.instance;

  final FirebaseStorage _storage;

  /// Upload photo to Firebase Storage.
  /// Path: submissions/{userId}/{timestamp}.jpg
  Future<String> uploadSubmissionPhoto({
    required File photoFile,
    required String userId,
  }) async {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    final fileName = '$timestamp.jpg';
    final ref = _storage.ref().child('submissions').child(userId).child(fileName);
    final metadata = SettableMetadata(
      contentType: 'image/jpeg',
      customMetadata: {'uploadedAt': DateTime.now().toIso8601String()},
    );
    final snapshot = await ref.putFile(photoFile, metadata).whenComplete(() => null);
    return snapshot.ref.getDownloadURL();
  }

  Future<void> deleteSubmissionPhoto(String photoUrl) async {
    try {
      final ref = _storage.refFromURL(photoUrl);
      await ref.delete();
    } catch (_) {}
  }
}
