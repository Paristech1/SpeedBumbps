import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';

import 'package:speed_bump_app/core/theme/app_theme.dart';
import 'package:speed_bump_app/features/auth/presentation/screens/splash_screen.dart';

void main() {
  group('SplashScreen', () {
    testWidgets('renders SpeedBump title text', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: const SplashScreen(),
        ),
      );

      expect(find.text('SpeedBump'), findsOneWidget);
    });

    testWidgets('renders Drive Smoother, Together subtitle', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: const SplashScreen(),
        ),
      );

      expect(find.text('Drive Smoother, Together'), findsOneWidget);
    });

    testWidgets('renders a circular progress indicator', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: const SplashScreen(),
        ),
      );

      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('renders speed icon', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: const SplashScreen(),
        ),
      );

      expect(find.byIcon(Icons.speed), findsOneWidget);
    });

    testWidgets('uses dark background color', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark,
          home: const SplashScreen(),
        ),
      );

      final scaffold = tester.widget<Scaffold>(find.byType(Scaffold));
      expect(scaffold.backgroundColor, AppColors.darkBg);
    });
  });
}
