import 'package:flutter/material.dart';

import '../../../submission/domain/entities/submission.dart';

class SubmissionCard extends StatelessWidget {
  const SubmissionCard({
    super.key,
    required this.submission,
    required this.onTap,
  });

  final Submission submission;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: submission.statusColor.withOpacity(0.2),
          child: Icon(submission.statusIcon, color: submission.statusColor),
        ),
        title: Text(
          'Severity ${submission.severity}/5 · ${submission.userEmail}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        subtitle: Text(
          '${submission.location.latitude.toStringAsFixed(4)}, ${submission.location.longitude.toStringAsFixed(4)}',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
