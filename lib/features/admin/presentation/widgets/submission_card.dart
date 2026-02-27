import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
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
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: AppColors.darkSurface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white.withOpacity(0.06)),
      ),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: submission.statusColor.withOpacity(0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(submission.statusIcon, color: submission.statusColor),
        ),
        title: Text(
          'Severity ${submission.severity}/5 · ${submission.userEmail}',
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(color: AppColors.textPrimary),
        ),
        subtitle: Text(
          '${submission.location.latitude.toStringAsFixed(4)}, ${submission.location.longitude.toStringAsFixed(4)}',
          style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
        ),
        trailing: Icon(Icons.chevron_right, color: AppColors.textSecondary),
        onTap: onTap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }
}
