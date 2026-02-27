import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_theme.dart';
import '../../../submission/domain/entities/submission.dart';
import '../providers/pending_submissions_provider.dart';
import '../widgets/submission_card.dart';
import 'review_submission_screen.dart';

class AdminDashboardScreen extends ConsumerWidget {
  const AdminDashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending = ref.watch(pendingSubmissionsProvider);

    return Scaffold(
      backgroundColor: AppColors.darkBg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.admin_panel_settings, color: AppColors.neonGreen, size: 22),
            const SizedBox(width: 8),
            const Text('Admin Dashboard'),
          ],
        ),
      ),
      body: pending.when(
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
                    Icons.check_circle_outline,
                    size: 100,
                    color: AppColors.neonGreen.withOpacity(0.3),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No Pending Submissions',
                    style: TextStyle(
                      fontSize: 20,
                      color: AppColors.textSecondary,
                    ),
                  ),
                ],
              ),
            );
          }
          return Column(
            children: [
              // Stats bar
              Container(
                margin: const EdgeInsets.all(16),
                padding: const EdgeInsets.all(20),
                decoration: GlassmorphismDecoration.card(),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceAround,
                  children: [
                    _Stat(
                      icon: Icons.pending_actions,
                      label: 'Pending',
                      value: submissions.length.toString(),
                      color: AppColors.warningAmber,
                    ),
                    _Stat(
                      icon: Icons.schedule,
                      label: 'Oldest',
                      value: _oldestTime(submissions),
                      color: AppColors.hazardRed,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: submissions.length,
                  itemBuilder: (context, index) {
                    return SubmissionCard(
                      submission: submissions[index],
                      onTap: () {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => ReviewSubmissionScreen(
                              submission: submissions[index],
                            ),
                          ),
                        );
                      },
                    );
                  },
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  static String _oldestTime(List<Submission> list) {
    if (list.isEmpty) return 'N/A';
    final d = DateTime.now().difference(list.first.submittedAt);
    if (d.inDays > 0) return '${d.inDays}d ago';
    if (d.inHours > 0) return '${d.inHours}h ago';
    return '${d.inMinutes}m ago';
  }
}

class _Stat extends StatelessWidget {
  const _Stat({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: color, size: 28),
        ),
        const SizedBox(height: 8),
        Text(
          value,
          style: TextStyle(
            fontSize: 24,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
        Text(
          label,
          style: TextStyle(color: AppColors.textSecondary),
        ),
      ],
    );
  }
}
