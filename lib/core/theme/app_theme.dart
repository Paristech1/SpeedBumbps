import 'package:flutter/material.dart';

/// App-wide colors and theme (light/dark).
class AppColors {
  AppColors._();

  static const Color lightBackground = Color(0xFFFFFFFF);
  static const Color lightText = Color(0xFF000000);

  static const Color darkBackground = Color(0xFF121212);
  static const Color darkText = Color(0xFFFFFFFF);

  static const Color accuracyWarning = Color(0xFFFF9800);
  static const Color error = Color(0xFFD32F2F);
  static const Color success = Color(0xFF4CAF50);
}

class AppTheme {
  AppTheme._();

  static ThemeData get light => ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        scaffoldBackgroundColor: AppColors.lightBackground,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.success,
          brightness: Brightness.light,
          error: AppColors.error,
        ),
        textTheme: _textTheme(AppColors.lightText),
      );

  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.darkBackground,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.success,
          brightness: Brightness.dark,
          error: AppColors.error,
        ),
        textTheme: _textTheme(AppColors.darkText),
      );

  static TextTheme _textTheme(Color textColor) {
    return TextTheme(
      titleLarge: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: textColor),
      bodyLarge: TextStyle(fontSize: 16, color: textColor),
      labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: textColor),
    );
  }
}
