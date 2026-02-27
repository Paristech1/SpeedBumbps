import 'dart:ui';
import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/entities/route.dart';
import '../../domain/entities/route_step.dart';

class DirectionsBottomSheet extends StatelessWidget {
  const DirectionsBottomSheet({
    super.key,
    required this.route,
    this.onClose,
  });

  final AppRoute route;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.4,
      minChildSize: 0.2,
      maxChildSize: 0.9,
      builder: (context, scrollController) {
        return ClipRRect(
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
            child: Container(
              decoration: BoxDecoration(
                color: AppColors.darkSurface.withOpacity(0.85),
                borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                border: Border(
                  top: BorderSide(
                    color: Colors.white.withOpacity(0.1),
                    width: 1,
                  ),
                ),
              ),
              child: Column(
                children: [
                  // Drag handle
                  Container(
                    margin: const EdgeInsets.symmetric(vertical: 10),
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: AppColors.textSecondary.withOpacity(0.4),
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  // Header row
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Smooth Ride',
                              style: TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text(
                              route.durationFormatted,
                              style: const TextStyle(
                                color: AppColors.textPrimary,
                                fontSize: 28,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            Text(
                              route.distanceFormatted,
                              style: TextStyle(
                                color: AppColors.textSecondary,
                                fontSize: 14,
                              ),
                            ),
                          ],
                        ),
                        if (route.speedBumpCount > 0)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.warningAmber.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: AppColors.warningAmber.withOpacity(0.3),
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.warning_amber_rounded,
                                  size: 16,
                                  color: AppColors.warningAmber,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  '${route.speedBumpCount} bumps',
                                  style: TextStyle(
                                    color: AppColors.warningAmber,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        if (route.isSpeedBumpFree)
                          Container(
                            padding: const EdgeInsets.symmetric(
                              horizontal: 14,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: AppColors.neonGreen.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(
                                color: AppColors.neonGreen.withOpacity(0.3),
                              ),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(
                                  Icons.check_circle,
                                  size: 16,
                                  color: AppColors.neonGreen,
                                ),
                                const SizedBox(width: 4),
                                Text(
                                  'Bump-free',
                                  style: TextStyle(
                                    color: AppColors.neonGreen,
                                    fontWeight: FontWeight.bold,
                                    fontSize: 13,
                                  ),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  // Start Navigation button
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
                    child: GradientButton(
                      onPressed: () {},
                      child: const Text(
                        'START NAVIGATION',
                        style: TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.bold,
                          fontSize: 16,
                          letterSpacing: 1,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Divider(
                    height: 1,
                    color: Colors.white.withOpacity(0.06),
                  ),
                  // Steps list
                  Expanded(
                    child: ListView.builder(
                      controller: scrollController,
                      itemCount: route.steps.length,
                      itemBuilder: (context, index) {
                        final step = route.steps[index];
                        return _StepTile(step: step);
                      },
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _StepTile extends StatelessWidget {
  const _StepTile({required this.step});

  final RouteStep step;

  @override
  Widget build(BuildContext context) {
    final miles = step.distanceMeters * 0.000621371;
    return ListTile(
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: AppColors.neonGreen.withOpacity(0.1),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(step.maneuverIcon, color: AppColors.neonGreen, size: 20),
      ),
      title: Text(
        step.instruction,
        style: const TextStyle(fontSize: 14, color: AppColors.textPrimary),
      ),
      subtitle: Text(
        '${miles.toStringAsFixed(1)} mi',
        style: TextStyle(fontSize: 12, color: AppColors.textSecondary),
      ),
    );
  }
}
