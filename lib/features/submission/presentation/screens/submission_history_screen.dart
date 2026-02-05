import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../domain/entities/submission.dart';
import '../providers/user_submissions_provider.dart';

class SubmissionHistoryScreen extends ConsumerWidget {
  const SubmissionHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncSubmissions = ref.watch(userSubmissionsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('My Submissions'),
      ),
      body: asyncSubmissions.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (err, _) => Center(child: Text('Error: $err')),
        data: (submissions) {
          if (submissions.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.photo_library_outlined,
                    size: 80,
                    color: Colors.grey[400],
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No submissions yet',
                    style: TextStyle(
                      fontSize: 18,
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Report a speed bump from the map screen',
                    style: TextStyle(color: Colors.grey[500]),
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
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
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
            const SizedBox(height: 12),
            Text('Severity: ${s.severity}/5'),
            Text(
                'Location: ${s.location.latitude.toStringAsFixed(5)}, ${s.location.longitude.toStringAsFixed(5)}'),
            Text('Submitted: ${_formatDate(s.submittedAt)}'),
            if (s.rejectionReason != null) ...[
              const SizedBox(height: 8),
              Text(
                'Reason: ${s.rejectionReason}',
                style: TextStyle(color: Colors.red.shade700),
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
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: submission.statusColor.withOpacity(0.2),
          child: Icon(submission.statusIcon, color: submission.statusColor),
        ),
        title: Text('Severity ${submission.severity}/5'),
        subtitle: Text(
          '${submission.status.displayName} · ${_shortDate(submission.submittedAt)}',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }

  String _shortDate(DateTime d) {
    return '${d.month}/${d.day}/${d.year}';
  }
}
