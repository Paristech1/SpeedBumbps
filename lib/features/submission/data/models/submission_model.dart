import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../core/constants/firebase_constants.dart';
import '../../domain/entities/submission.dart';
import '../../domain/entities/submission_status.dart';

/// Firestore-compatible submission model.
class SubmissionModel {
  const SubmissionModel({
    required this.id,
    required this.userId,
    required this.userEmail,
    required this.photoUrl,
    required this.latitude,
    required this.longitude,
    required this.severity,
    this.notes,
    required this.status,
    required this.submittedAt,
    this.reviewedAt,
    this.reviewedBy,
    this.rejectionReason,
    this.createdSpeedBumpId,
  });

  final String id;
  final String userId;
  final String userEmail;
  final String photoUrl;
  final double latitude;
  final double longitude;
  final int severity;
  final String? notes;
  final SubmissionStatus status;
  final DateTime submittedAt;
  final DateTime? reviewedAt;
  final String? reviewedBy;
  final String? rejectionReason;
  final String? createdSpeedBumpId;

  LatLng get location => LatLng(latitude, longitude);

  Submission toEntity() {
    return Submission(
      id: id,
      userId: userId,
      userEmail: userEmail,
      photoUrl: photoUrl,
      location: location,
      severity: severity,
      notes: notes,
      status: status,
      submittedAt: submittedAt,
      reviewedAt: reviewedAt,
      reviewedBy: reviewedBy,
      rejectionReason: rejectionReason,
      createdSpeedBumpId: createdSpeedBumpId,
    );
  }

  factory SubmissionModel.fromEntity(Submission e) {
    return SubmissionModel(
      id: e.id,
      userId: e.userId,
      userEmail: e.userEmail,
      photoUrl: e.photoUrl,
      latitude: e.location.latitude,
      longitude: e.location.longitude,
      severity: e.severity,
      notes: e.notes,
      status: e.status,
      submittedAt: e.submittedAt,
      reviewedAt: e.reviewedAt,
      reviewedBy: e.reviewedBy,
      rejectionReason: e.rejectionReason,
      createdSpeedBumpId: e.createdSpeedBumpId,
    );
  }

  factory SubmissionModel.fromJson(Map<String, dynamic> json) {
    final id = json[FirebaseConstants.fieldId] as String? ?? '';
    final statusStr = json[FirebaseConstants.fieldStatus] as String? ?? 'pending';
    final status = statusStr == 'approved'
        ? SubmissionStatus.approved
        : statusStr == 'rejected'
            ? SubmissionStatus.rejected
            : SubmissionStatus.pending;
    final loc = json[FirebaseConstants.fieldLocation];
    double lat = 0, lng = 0;
    if (loc is Map) {
      lat = (loc['latitude'] as num?)?.toDouble() ?? 0;
      lng = (loc['longitude'] as num?)?.toDouble() ?? 0;
    }
    return SubmissionModel(
      id: id,
      userId: json[FirebaseConstants.fieldUserId] as String? ?? '',
      userEmail: json[FirebaseConstants.fieldUserEmail] as String? ?? '',
      photoUrl: json[FirebaseConstants.fieldPhotoUrl] as String? ?? '',
      latitude: lat,
      longitude: lng,
      severity: (json[FirebaseConstants.fieldSeverity] as int?) ?? 3,
      notes: json[FirebaseConstants.fieldNotes] as String?,
      status: status,
      submittedAt: _dateRequired(json[FirebaseConstants.fieldSubmittedAt]),
      reviewedAt: _dateFromJson(json[FirebaseConstants.fieldReviewedAt]),
      reviewedBy: json[FirebaseConstants.fieldReviewedBy] as String?,
      rejectionReason: json[FirebaseConstants.fieldRejectionReason] as String?,
      createdSpeedBumpId: json[FirebaseConstants.fieldCreatedSpeedBumpId] as String?,
    );
  }

  static DateTime? _dateFromJson(dynamic value) {
    if (value == null) return null;
    if (value is Timestamp) return value.toDate();
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  static DateTime _dateRequired(dynamic value) {
    final d = _dateFromJson(value);
    return d ?? DateTime.now();
  }

  Map<String, dynamic> toJson() {
    return {
      FirebaseConstants.fieldId: id,
      FirebaseConstants.fieldUserId: userId,
      FirebaseConstants.fieldUserEmail: userEmail,
      FirebaseConstants.fieldPhotoUrl: photoUrl,
      FirebaseConstants.fieldLocation: {'latitude': latitude, 'longitude': longitude},
      FirebaseConstants.fieldSeverity: severity,
      FirebaseConstants.fieldNotes: notes,
      FirebaseConstants.fieldStatus: status.name,
      FirebaseConstants.fieldSubmittedAt: Timestamp.fromDate(submittedAt),
      if (reviewedAt != null) FirebaseConstants.fieldReviewedAt: Timestamp.fromDate(reviewedAt!),
      FirebaseConstants.fieldReviewedBy: reviewedBy,
      FirebaseConstants.fieldRejectionReason: rejectionReason,
      FirebaseConstants.fieldCreatedSpeedBumpId: createdSpeedBumpId,
    };
  }
}
