import 'package:flutter/material.dart';
import 'package:freezed_annotation/freezed_annotation.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import 'submission_status.dart';

part 'submission.freezed.dart';

@freezed
class Submission with _$Submission {
  const factory Submission({
    required String id,
    required String userId,
    required String userEmail,
    required String photoUrl,
    required LatLng location,
    required int severity,
    String? notes,
    required SubmissionStatus status,
    required DateTime submittedAt,
    DateTime? reviewedAt,
    String? reviewedBy,
    String? rejectionReason,
    String? createdSpeedBumpId,
  }) = _Submission;

  const Submission._();

  bool get isPending => status == SubmissionStatus.pending;
  bool get isApproved => status == SubmissionStatus.approved;
  bool get isRejected => status == SubmissionStatus.rejected;

  Color get statusColor {
    switch (status) {
      case SubmissionStatus.pending:
        return Colors.orange;
      case SubmissionStatus.approved:
        return Colors.green;
      case SubmissionStatus.rejected:
        return Colors.red;
    }
  }

  IconData get statusIcon {
    switch (status) {
      case SubmissionStatus.pending:
        return Icons.pending;
      case SubmissionStatus.approved:
        return Icons.check_circle;
      case SubmissionStatus.rejected:
        return Icons.cancel;
    }
  }
}
