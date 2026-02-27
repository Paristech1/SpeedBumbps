import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../core/constants/map_constants.dart';
import '../../../../core/theme/app_theme.dart';
import '../../../submission/domain/entities/submission.dart';
import '../../data/repositories/firebase_admin_repository.dart';
import '../providers/pending_submissions_provider.dart';
import '../widgets/review_actions_bar.dart';

class ReviewSubmissionScreen extends ConsumerStatefulWidget {
  const ReviewSubmissionScreen({
    super.key,
    required this.submission,
  });

  final Submission submission;

  @override
  ConsumerState<ReviewSubmissionScreen> createState() =>
      _ReviewSubmissionScreenState();
}

class _ReviewSubmissionScreenState extends ConsumerState<ReviewSubmissionScreen> {
  bool _isLoading = false;
  final _rejectReasonController = TextEditingController();

  @override
  void dispose() {
    _rejectReasonController.dispose();
    super.dispose();
  }

  Future<void> _approve() async {
    setState(() => _isLoading = true);
    try {
      final adminId = 'admin';
      await ref.read(adminRepositoryProvider).approveSubmission(
            submissionId: widget.submission.id,
            adminId: adminId,
          );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Submission approved. User awarded points.'),
            backgroundColor: AppColors.neonGreen,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.hazardRed),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _reject() async {
    final reason = _rejectReasonController.text.trim();
    if (reason.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: const Text('Please enter a rejection reason'),
          backgroundColor: AppColors.warningAmber,
        ),
      );
      return;
    }
    setState(() => _isLoading = true);
    try {
      final adminId = 'admin';
      await ref.read(adminRepositoryProvider).rejectSubmission(
            submissionId: widget.submission.id,
            adminId: adminId,
            reason: reason,
          );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Submission rejected.'),
            backgroundColor: AppColors.warningAmber,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: AppColors.hazardRed),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = widget.submission;

    return Scaffold(
      backgroundColor: AppColors.darkBg,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        title: const Text('Review Submission'),
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Photo with neon border
                  Container(
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: AppColors.cyan.withOpacity(0.3),
                        width: 2,
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(14),
                      child: Image.network(
                        s.photoUrl,
                        height: 220,
                        fit: BoxFit.cover,
                        errorBuilder: (_, __, ___) => Container(
                          height: 220,
                          color: AppColors.darkSurface,
                          child: const Center(
                            child: Icon(Icons.broken_image, size: 48, color: AppColors.textSecondary),
                          ),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  // Info cards
                  Container(
                    padding: const EdgeInsets.all(16),
                    decoration: GlassmorphismDecoration.card(),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.warning_amber, color: AppColors.warningAmber, size: 20),
                            const SizedBox(width: 8),
                            Text(
                              'Severity: ${s.severity}/5',
                              style: const TextStyle(
                                color: AppColors.textPrimary,
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                        if (s.notes != null && s.notes!.isNotEmpty) ...[
                          const SizedBox(height: 12),
                          Text(
                            'Notes: ${s.notes}',
                            style: TextStyle(color: AppColors.textSecondary),
                          ),
                        ],
                        const SizedBox(height: 8),
                        Text(
                          'Submitted by: ${s.userEmail}',
                          style: TextStyle(color: AppColors.textSecondary, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Map
                  SizedBox(
                    height: 160,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(16),
                      child: GoogleMap(
                        initialCameraPosition: CameraPosition(
                          target: s.location,
                          zoom: 17,
                        ),
                        onMapCreated: (controller) {
                          controller.setMapStyle(MapConstants.darkMapStyle);
                        },
                        markers: {
                          Marker(
                            markerId: const MarkerId('submission'),
                            position: s.location,
                          ),
                        },
                        liteModeEnabled: true,
                        zoomControlsEnabled: false,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  // Rejection reason
                  Text(
                    'Rejection reason (if rejecting):',
                    style: TextStyle(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _rejectReasonController,
                    maxLines: 2,
                    style: const TextStyle(color: AppColors.textPrimary),
                    decoration: const InputDecoration(
                      hintText: 'e.g., Photo unclear, cannot verify speed bump',
                    ),
                  ),
                ],
              ),
            ),
          ),
          ReviewActionsBar(
            onApprove: _approve,
            onReject: _reject,
            isLoading: _isLoading,
          ),
        ],
      ),
    );
  }
}
