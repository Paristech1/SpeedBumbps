import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

import 'package:speed_bump_app/core/theme/app_theme.dart';

void main() {
  group('AppColors', () {
    test('neonGreen matches #00E676', () {
      expect(AppColors.neonGreen, equals(const Color(0xFF00E676)));
    });

    test('cyan matches #00E5FF', () {
      expect(AppColors.cyan, equals(const Color(0xFF00E5FF)));
    });

    test('darkBg matches #0D1117', () {
      expect(AppColors.darkBg, equals(const Color(0xFF0D1117)));
    });

    test('darkSurface matches #161B22', () {
      expect(AppColors.darkSurface, equals(const Color(0xFF161B22)));
    });

    test('gradientStart matches #FF6B35', () {
      expect(AppColors.gradientStart, equals(const Color(0xFFFF6B35)));
    });

    test('gradientEnd matches #7C3AED', () {
      expect(AppColors.gradientEnd, equals(const Color(0xFF7C3AED)));
    });

    test('hazardRed matches #EF4444', () {
      expect(AppColors.hazardRed, equals(const Color(0xFFEF4444)));
    });

    test('warningAmber matches #F59E0B', () {
      expect(AppColors.warningAmber, equals(const Color(0xFFF59E0B)));
    });
  });

  group('AppGradients', () {
    test('ctaGradient has two colors: gradientStart and gradientEnd', () {
      expect(AppGradients.ctaGradient.colors.length, 2);
      expect(AppGradients.ctaGradient.colors[0], AppColors.gradientStart);
      expect(AppGradients.ctaGradient.colors[1], AppColors.gradientEnd);
    });

    test('neonGreenShimmer has two green shades', () {
      expect(AppGradients.neonGreenShimmer.colors.length, 2);
      expect(AppGradients.neonGreenShimmer.colors[0], AppColors.neonGreen);
    });

    test('darkOverlay fades from opaque dark to transparent ', () {
      expect(AppGradients.darkOverlay.colors.length, 2);
      expect(AppGradients.darkOverlay.colors[1].a, 0.0);
    });
  });

  group('GlassmorphismDecoration', () {
    test('card() returns a BoxDecoration with borderRadius and translucent color', () {
      final dec = GlassmorphismDecoration.card();
      expect(dec, isA<BoxDecoration>());
      expect(dec.borderRadius, BorderRadius.circular(20));
      expect(dec.color, isNotNull);
      // Color should be semi-transparent (opacity < 1)
      expect(dec.color!.a, lessThan(1.0));
    });

    test('card() respects custom borderRadius', () {
      final dec = GlassmorphismDecoration.card(borderRadius: 8);
      expect(dec.borderRadius, BorderRadius.circular(8));
    });

    test('card() has a single BoxShadow', () {
      final dec = GlassmorphismDecoration.card();
      expect(dec.boxShadow, isNotNull);
      expect(dec.boxShadow!.length, 1);
    });

    test('card() has a Border with opacity-based color', () {
      final dec = GlassmorphismDecoration.card();
      expect(dec.border, isNotNull);
    });
  });

  group('AppTheme.dark', () {
    test('has Brightness.dark', () {
      final theme = AppTheme.dark;
      expect(theme.brightness, Brightness.dark);
    });

    test('scaffoldBackgroundColor is AppColors.darkBg', () {
      final theme = AppTheme.dark;
      expect(theme.scaffoldBackgroundColor, AppColors.darkBg);
    });

    test('colorScheme.primary is neonGreen', () {
      final theme = AppTheme.dark;
      expect(theme.colorScheme.primary, AppColors.neonGreen);
    });

    test('colorScheme.secondary is cyan', () {
      final theme = AppTheme.dark;
      expect(theme.colorScheme.secondary, AppColors.cyan);
    });

    test('colorScheme.error is hazardRed', () {
      final theme = AppTheme.dark;
      expect(theme.colorScheme.error, AppColors.hazardRed);
    });

    test('appBarTheme has transparent background', () {
      final theme = AppTheme.dark;
      expect(theme.appBarTheme.backgroundColor, Colors.transparent);
    });

    test('appBarTheme has zero elevation values', () {
      final theme = AppTheme.dark;
      expect(theme.appBarTheme.elevation, 0);
      expect(theme.appBarTheme.scrolledUnderElevation, 0);
    });

    test('floatingActionButtonTheme has cyan border', () {
      final theme = AppTheme.dark;
      final shape = theme.floatingActionButtonTheme.shape as RoundedRectangleBorder;
      expect(shape.side.color, AppColors.cyan);
    });

    test('inputDecorationTheme has filled fields with darkSurfaceLight', () {
      final theme = AppTheme.dark;
      expect(theme.inputDecorationTheme.filled, isTrue);
      expect(theme.inputDecorationTheme.fillColor, AppColors.darkSurfaceLight);
    });

    test('tabBarTheme uses neonGreen for labels/indicator', () {
      final theme = AppTheme.dark;
      expect(theme.tabBarTheme.labelColor, AppColors.neonGreen);
      expect(theme.tabBarTheme.indicatorColor, AppColors.neonGreen);
    });

    test('cardTheme uses darkSurface background with zero elevation', () {
      final theme = AppTheme.dark;
      expect(theme.cardTheme.color, AppColors.darkSurface);
      expect(theme.cardTheme.elevation, 0);
    });

    test('snackBarTheme uses floating behavior', () {
      final theme = AppTheme.dark;
      expect(theme.snackBarTheme.behavior, SnackBarBehavior.floating);
    });

    test('progressIndicatorTheme uses neonGreen', () {
      final theme = AppTheme.dark;
      expect(theme.progressIndicatorTheme.color, AppColors.neonGreen);
    });

    test('useMaterial3 is true', () {
      final theme = AppTheme.dark;
      expect(theme.useMaterial3, isTrue);
    });

    test('light theme redirects to dark theme', () {
      expect(AppTheme.light.brightness, Brightness.dark);
    });
  });

  group('GradientButton widget', () {
    testWidgets('renders child and responds to taps', (tester) async {
      var tapped = false;

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: Scaffold(
            body: Center(
              child: GradientButton(
                onPressed: () => tapped = true,
                child: const Text('Test'),
              ),
            ),
          ),
        ),
      );

      expect(find.text('Test'), findsOneWidget);
      await tester.tap(find.text('Test'));
      expect(tapped, isTrue);
    });

    testWidgets('disabled when onPressed is null', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: const Scaffold(
            body: Center(
              child: GradientButton(
                onPressed: null,
                child: Text('Disabled'),
              ),
            ),
          ),
        ),
      );

      expect(find.text('Disabled'), findsOneWidget);
      // The InkWell should have null onTap
      final inkWell = tester.widget<InkWell>(find.byType(InkWell));
      expect(inkWell.onTap, isNull);
    });
  });
}
