import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../core/constants/firebase_constants.dart';

/// Creates speed bump documents in Firestore (e.g. when admin approves a submission).
class FirestoreSpeedBumpDatasource {
  FirestoreSpeedBumpDatasource({
    FirebaseFirestore? firestore,
  }) : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _col =>
      _firestore.collection(FirebaseConstants.speedBumpsCollection);

  /// Creates a new speed bump from an approved submission.
  Future<String> createSpeedBump({
    required String id,
    required LatLng location,
    required int severity,
  }) async {
    final now = DateTime.now();
    await _col.doc(id).set({
      FirebaseConstants.fieldId: id,
      FirebaseConstants.fieldLocation: {
        'latitude': location.latitude,
        'longitude': location.longitude,
      },
      FirebaseConstants.fieldSeverity: severity,
      FirebaseConstants.fieldReportCount: 1,
      FirebaseConstants.fieldLastVerified: Timestamp.fromDate(now),
      FirebaseConstants.fieldIsVerified: true,
    });
    return id;
  }
}
