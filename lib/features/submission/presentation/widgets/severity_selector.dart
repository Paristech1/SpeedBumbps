import 'package:flutter/material.dart';

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

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? Theme.of(context).colorScheme.primary : Colors.grey.shade200,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '$level',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: selected ? Colors.white : Colors.black87,
                ),
              ),
              Text(
                level == 1 ? 'Mild' : level == 5 ? 'Severe' : '',
                style: TextStyle(
                  fontSize: 10,
                  color: selected ? Colors.white70 : Colors.black54,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
