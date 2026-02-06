import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../auth/presentation/providers/auth_state_provider.dart';
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
    final adminId = _currentAdminId();
    if (adminId == null) {
      _showAuthRequired();
      return;
    }
    setState(() => _isLoading = true);
    try {
      await ref.read(adminRepositoryProvider).approveSubmission(
            submissionId: widget.submission.id,
            adminId: adminId,
          );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Submission approved. User awarded points.'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
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
        const SnackBar(
          content: Text('Please enter a rejection reason'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }
    final adminId = _currentAdminId();
    if (adminId == null) {
      _showAuthRequired();
      return;
    }
    setState(() => _isLoading = true);
    try {
      await ref.read(adminRepositoryProvider).rejectSubmission(
            submissionId: widget.submission.id,
            adminId: adminId,
            reason: reason,
          );
      if (mounted) {
        Navigator.of(context).pop();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Submission rejected.'),
            backgroundColor: Colors.orange,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e'), backgroundColor: Colors.red),
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
      appBar: AppBar(
        title: const Text('Review Submission'),
        backgroundColor: Colors.deepPurple,
        foregroundColor: Colors.white,
      ),
      body: Column(
        children: [
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.network(
                      s.photoUrl,
                      height: 220,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => const SizedBox(
                        height: 220,
                        child: Center(
                          child: Icon(Icons.broken_image, size: 48),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'Severity: ${s.severity}/5',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  if (s.notes != null && s.notes!.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Text('Notes: ${s.notes}'),
                    ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 160,
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: GoogleMap(
                        initialCameraPosition: CameraPosition(
                          target: s.location,
                          zoom: 17,
                        ),
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
                  const SizedBox(height: 16),
                  Text(
                    'Rejection reason (if rejecting):',
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  const SizedBox(height: 4),
                  TextField(
                    controller: _rejectReasonController,
                    maxLines: 2,
                    decoration: const InputDecoration(
                      hintText: 'e.g., Photo unclear, cannot verify speed bump',
                      border: OutlineInputBorder(),
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

  String? _currentAdminId() {
    final authState = ref.read(authStateProvider);
    return authState.maybeWhen(
      authenticated: (user) => user.id,
      orElse: () => null,
    );
  }

  void _showAuthRequired() {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Please sign in to perform admin actions.'),
        backgroundColor: Colors.red,
      ),
    );
  }
}
