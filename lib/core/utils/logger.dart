import 'dart:developer' as developer;

import 'package:flutter/foundation.dart';

/// Lightweight logger that only emits logs in debug/profile builds.
class AppLogger {
  AppLogger._();

  static void debug(String message, {String tag = 'APP'}) {
    _log('DEBUG', message, tag: tag);
  }

  static void info(String message, {String tag = 'APP'}) {
    _log('INFO', message, tag: tag);
  }

  static void warn(String message, {String tag = 'APP'}) {
    _log('WARN', message, tag: tag);
  }

  static void error(
    String message, {
    String tag = 'APP',
    Object? error,
    StackTrace? stackTrace,
  }) {
    _log('ERROR', message, tag: tag, error: error, stackTrace: stackTrace);
  }

  static void _log(
    String level,
    String message, {
    required String tag,
    Object? error,
    StackTrace? stackTrace,
  }) {
    if (kReleaseMode) {
      return;
    }

    developer.log(
      '[$level] $message',
      name: tag,
      error: error,
      stackTrace: stackTrace,
    );
  }
}
