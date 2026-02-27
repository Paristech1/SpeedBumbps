import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/entities/submission.dart';
import '../providers/user_submissions_provider.dart';

class SubmissionHistoryScreen extends ConsumerWidget {
  const SubmissionHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncSubmissions = ref.watch(userSubmissionsProvider);

    return Scaffold(
      backgroundColor: AppColors.darkBg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('My Submissions'),
      ),
      body: asyncSubmissions.when(
        loading: () => Center(
          child: CircularProgressIndicator(color: AppColors.neonGreen),
        ),
        error: (err, _) => Center(
          child: Text('Error: $err', style: TextStyle(color: AppColors.hazardRed)),
        ),
        data: (submissions) {
          if (submissions.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.photo_library_outlined,
                    size: 80,
                    color: AppColors.textSecondary.withOpacity(0.3),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No submissions yet',
                    style: TextStyle(
                      fontSize: 18,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Report a speed bump from the map screen',
                    style: TextStyle(color: AppColors.textSecondary.withOpacity(0.6)),
                  ),
                ],
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: submissions.length,
            itemBuilder: (context, index) {
              return _SubmissionListTile(
                submission: submissions[index],
                onTap: () => _showDetail(context, submissions[index]),
              );
            },
          );
        },
      ),
    );
  }

  void _showDetail(BuildContext context, Submission s) {
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: AppColors.darkSurface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          border: Border(
            top: BorderSide(color: Colors.white.withOpacity(0.1)),
          ),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: AppColors.textSecondary.withOpacity(0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                Icon(s.statusIcon, color: s.statusColor, size: 28),
                const SizedBox(width: 8),
                Text(
                  s.status.displayName,
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: s.statusColor,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(
              'Severity: ${s.severity}/5',
              style: TextStyle(color: AppColors.textPrimary),
            ),
            const SizedBox(height: 4),
            Text(
              'Location: ${s.location.latitude.toStringAsFixed(5)}, ${s.location.longitude.toStringAsFixed(5)}',
              style: TextStyle(color: AppColors.textSecondary),
            ),
            const SizedBox(height: 4),
            Text(
              'Submitted: ${_formatDate(s.submittedAt)}',
              style: TextStyle(color: AppColors.textSecondary),
            ),
            if (s.rejectionReason != null) ...[
              const SizedBox(height: 12),
              Text(
                'Reason: ${s.rejectionReason}',
                style: TextStyle(color: AppColors.hazardRed),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _formatDate(DateTime d) {
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')} '
        '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }
}

class _SubmissionListTile extends StatelessWidget {
  const _SubmissionListTile({
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
          'Severity ${submission.severity}/5',
          style: const TextStyle(color: AppColors.textPrimary),
        ),
        subtitle: Text(
          '${submission.status.displayName} · ${_shortDate(submission.submittedAt)}',
          style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
        ),
        trailing: Icon(Icons.chevron_right, color: AppColors.textSecondary),
        onTap: onTap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    );
  }

  String _shortDate(DateTime d) {
    return '${d.month}/${d.day}/${d.year}';
  }
}
