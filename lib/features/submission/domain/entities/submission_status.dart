/// Status of a speed bump report submission.
enum SubmissionStatus {
  pending,
  approved,
  rejected;

  String get displayName {
    switch (this) {
      case SubmissionStatus.pending:
        return 'Under Review';
      case SubmissionStatus.approved:
        return 'Approved';
      case SubmissionStatus.rejected:
        return 'Rejected';
    }
  }
}
