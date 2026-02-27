import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

class ReviewActionsBar extends StatelessWidget {
  const ReviewActionsBar({
    super.key,
    required this.onApprove,
    required this.onReject,
    this.isLoading = false,
  });

  final VoidCallback onApprove;
  final VoidCallback onReject;
  final bool isLoading;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.darkSurface,
        border: Border(
          top: BorderSide(color: Colors.white.withOpacity(0.06)),
        ),
      ),
      child: Row(
        children: [
          Expanded(
            child: OutlinedButton.icon(
              onPressed: isLoading ? null : onReject,
              icon: const Icon(Icons.close),
              label: const Text('Reject'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.hazardRed,
                side: const BorderSide(color: AppColors.hazardRed),
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(width: 16),
          Expanded(
            child: ElevatedButton.icon(
              onPressed: isLoading ? null : onApprove,
              icon: isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: AppColors.darkBg,
                      ),
                    )
                  : const Icon(Icons.check),
              label: Text(isLoading ? 'Processing...' : 'Approve'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.neonGreen,
                foregroundColor: AppColors.darkBg,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
