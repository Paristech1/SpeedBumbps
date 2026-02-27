// Basic smoke test for the SpeedBump app theme.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:speed_bump_app/core/theme/app_theme.dart';

void main() {
  test('AppTheme.dark produces a valid dark ThemeData', () {
    final theme = AppTheme.dark;
    expect(theme.brightness, Brightness.dark);
    expect(theme.scaffoldBackgroundColor, AppColors.darkBg);
    expect(theme.useMaterial3, isTrue);
  });

  test('AppTheme.light redirects to dark theme (dark-only design)', () {
    final light = AppTheme.light;
    final dark = AppTheme.dark;
    expect(light.brightness, dark.brightness);
  });
}
