import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/routes/app_router.dart';
import 'features/map/presentation/screens/map_screen.dart';
import 'core/theme/app_theme.dart';
import 'core/utils/crash_reporting.dart';
import 'core/utils/logger.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  Object? firebaseInitError;
  var crashReportingEnabled = false;

  await runZonedGuarded(() async {
    try {
      await Firebase.initializeApp();
    } catch (error, stackTrace) {
      firebaseInitError = error;
      AppLogger.error(
        'Firebase initialization failed; running without Crashlytics.',
        tag: 'MAIN',
        error: error,
        stackTrace: stackTrace,
      );
    }

    if (firebaseInitError == null) {
      try {
        await CrashReporting.setCollectionEnabledForBuild();
        await CrashReporting.initialize();
        crashReportingEnabled = true;
      } catch (error, stackTrace) {
        AppLogger.error(
          'Crash reporting init failed.',
          tag: 'CRASH',
          error: error,
          stackTrace: stackTrace,
        );
      }
    }

    runApp(
      ProviderScope(
        child: SpeedBumpApp(firebaseInitError: firebaseInitError),
      ),
    );
  }, (error, stackTrace) async {
    AppLogger.error(
      'Uncaught zone exception',
      tag: 'MAIN',
      error: error,
      stackTrace: stackTrace,
    );
    if (crashReportingEnabled) {
      await CrashReporting.recordHandled(
        error,
        stackTrace,
        reason: 'main_zone_uncaught',
      );
    }
  });
}

class SpeedBumpApp extends StatelessWidget {
  const SpeedBumpApp({super.key, this.firebaseInitError});

  final Object? firebaseInitError;

  @override
  Widget build(BuildContext context) {
    // Allow app to run without Firebase for development
    return MaterialApp(
      title: 'Speed Bump',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      navigatorObservers: firebaseInitError == null ? [AnalyticsNavigationObserver()] : [],
      home: const MapScreen(),
      routes: AppRouter.routes,
    );
  }
}
