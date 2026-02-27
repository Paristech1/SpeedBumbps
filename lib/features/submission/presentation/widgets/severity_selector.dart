import 'package:flutter/material.dart';

import '../../../../core/theme/app_theme.dart';

class SeveritySelector extends StatelessWidget {
  const SeveritySelector({
    super.key,
    required this.initialValue,
    required this.onChanged,
  });

  final int initialValue;
  final ValueChanged<int> onChanged;

  static const int minSeverity = 1;
  static const int maxSeverity = 5;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: List.generate(maxSeverity - minSeverity + 1, (index) {
        final level = index + minSeverity;
        return _SeverityChip(
          level: level,
          selected: initialValue == level,
          onTap: () => onChanged(level),
        );
      }),
    );
  }
}

class _SeverityChip extends StatelessWidget {
  const _SeverityChip({
    required this.level,
    required this.selected,
    required this.onTap,
  });

  final int level;
  final bool selected;
  final VoidCallback onTap;

  Color get _chipColor {
    switch (level) {
      case 1:
        return AppColors.neonGreen;
      case 2:
        return const Color(0xFF7CB342);
      case 3:
        return AppColors.warningAmber;
      case 4:
        return const Color(0xFFFF6B35);
      case 5:
        return AppColors.hazardRed;
      default:
        return AppColors.cyan;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? _chipColor : AppColors.darkSurfaceLight,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? _chipColor : Colors.white.withOpacity(0.08),
              width: selected ? 2 : 1,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$level',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: selected ? AppColors.darkBg : AppColors.textPrimary,
                ),
              ),
              Text(
                level == 1
                    ? 'Mild'
                    : level == 5
                        ? 'Severe'
                        : '',
                style: TextStyle(
                  fontSize: 10,
                  color: selected
                      ? AppColors.darkBg.withOpacity(0.7)
                      : AppColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
