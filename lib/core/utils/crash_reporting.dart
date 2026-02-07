import 'dart:async';

import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import 'logger.dart';

class CrashReporting {
  CrashReporting._();

  static Future<void> initialize() async {
    FlutterError.onError = (details) {
      FlutterError.presentError(details);
      FirebaseCrashlytics.instance.recordFlutterFatalError(details);
    };

    PlatformDispatcher.instance.onError = (error, stack) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
      return true;
    };

    AppLogger.info('Crash reporting initialized', tag: 'CRASH');
  }

  static Future<void> recordHandled(
    Object error,
    StackTrace stackTrace, {
    String reason = 'handled_exception',
  }) async {
    await FirebaseCrashlytics.instance.recordError(
      error,
      stackTrace,
      reason: reason,
      fatal: false,
    );
  }

  static Future<void> setCollectionEnabledForBuild() async {
    await FirebaseCrashlytics.instance.setCrashlyticsCollectionEnabled(
      kReleaseMode,
    );
  }

  static void triggerTestCrash() {
    if (kDebugMode) {
      throw StateError('Intentional crash for Crashlytics verification');
    }
  }
}

class AnalyticsNavigationObserver extends NavigatorObserver {
  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _logRoute('push', route.settings.name);
    super.didPush(route, previousRoute);
  }

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) {
    _logRoute('pop', previousRoute?.settings.name);
    super.didPop(route, previousRoute);
  }

  void _logRoute(String action, String? routeName) {
    final safeRouteName = routeName ?? 'unknown_route';
    AppLogger.info('$action: $safeRouteName', tag: 'NAV');
    unawaited(
      FirebaseCrashlytics.instance.log('navigation_$action:$safeRouteName'),
    );
  }
}
