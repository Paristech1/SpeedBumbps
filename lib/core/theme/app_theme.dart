import 'dart:ui' show ImageFilter;
import 'package:flutter/material.dart';

/// ─── SpeedBump Dark-Premium Color Palette ───────────────────────────────────
class AppColors {
  AppColors._();

  // Backgrounds
  static const Color darkBg = Color(0xFF0D1117);
  static const Color darkSurface = Color(0xFF161B22);
  static const Color darkSurfaceLight = Color(0xFF1F2937);

  // Primary accents
  static const Color neonGreen = Color(0xFF00E676);
  static const Color cyan = Color(0xFF00E5FF);

  // CTA gradient endpoints
  static const Color gradientStart = Color(0xFFFF6B35);
  static const Color gradientEnd = Color(0xFF7C3AED);

  // Text
  static const Color textPrimary = Color(0xFFFFFFFF);
  static const Color textSecondary = Color(0xFF9CA3AF);

  // Semantic
  static const Color hazardRed = Color(0xFFEF4444);
  static const Color warningAmber = Color(0xFFF59E0B);
  static const Color success = Color(0xFF00E676);
  static const Color error = Color(0xFFEF4444);
  static const Color accuracyWarning = Color(0xFFF59E0B);

  // Legacy aliases (so existing code that references these still compiles)
  static const Color lightBackground = Color(0xFF0D1117);
  static const Color lightText = Color(0xFFFFFFFF);
  static const Color darkBackground = Color(0xFF0D1117);
  static const Color darkText = Color(0xFFFFFFFF);
}

/// ─── Reusable Gradients ─────────────────────────────────────────────────────
class AppGradients {
  AppGradients._();

  /// Orange → Purple CTA gradient (Start Navigation, Login, etc.)
  static const LinearGradient ctaGradient = LinearGradient(
    colors: [AppColors.gradientStart, AppColors.gradientEnd],
    begin: Alignment.centerLeft,
    end: Alignment.centerRight,
  );

  /// Subtle neon-green shimmer for highlights
  static const LinearGradient neonGreenShimmer = LinearGradient(
    colors: [AppColors.neonGreen, Color(0xFF00C853)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// Dark-to-transparent for overlays on map
  static const LinearGradient darkOverlay = LinearGradient(
    colors: [Color(0xCC0D1117), Color(0x000D1117)],
    begin: Alignment.bottomCenter,
    end: Alignment.topCenter,
  );
}

/// ─── Glassmorphism Helpers ──────────────────────────────────────────────────
class GlassmorphismDecoration {
  GlassmorphismDecoration._();

  /// Standard frosted-glass card decoration.
  static BoxDecoration card({
    double borderRadius = 20,
    Color? borderColor,
    double opacity = 0.12,
  }) {
    return BoxDecoration(
      color: AppColors.darkSurface.withValues(alpha: 0.7),
      borderRadius: BorderRadius.circular(borderRadius),
      border: Border.all(
        color: borderColor ?? Colors.white.withValues(alpha: opacity),
        width: 1,
      ),
      boxShadow: [
        BoxShadow(
          color: Colors.black.withValues(alpha: 0.25),
          blurRadius: 20,
          offset: const Offset(0, 4),
        ),
      ],
    );
  }

  /// Wraps a child in a ClipRRect + BackdropFilter for true blur.
  static Widget blurWrap({
    required Widget child,
    double borderRadius = 20,
    double sigma = 12,
  }) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(borderRadius),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: sigma, sigmaY: sigma),
        child: child,
      ),
    );
  }
}

/// ─── Gradient Button Helper ─────────────────────────────────────────────────
class GradientButton extends StatelessWidget {
  const GradientButton({
    super.key,
    required this.onPressed,
    required this.child,
    this.gradient,
    this.height = 56,
    this.borderRadius = 16,
    this.width,
  });

  final VoidCallback? onPressed;
  final Widget child;
  final Gradient? gradient;
  final double height;
  final double borderRadius;
  final double? width;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width ?? double.infinity,
      height: height,
      decoration: BoxDecoration(
        gradient: onPressed != null
            ? (gradient ?? AppGradients.ctaGradient)
            : null,
        color: onPressed == null ? AppColors.darkSurfaceLight : null,
        borderRadius: BorderRadius.circular(borderRadius),
        boxShadow: onPressed != null
            ? [
                BoxShadow(
                  color: AppColors.gradientStart.withValues(alpha: 0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ]
            : null,
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(borderRadius),
          child: Center(child: child),
        ),
      ),
    );
  }
}

/// ─── App Theme ──────────────────────────────────────────────────────────────
class AppTheme {
  AppTheme._();

  static ThemeData get light => dark; // Redirect to dark — dark-only design

  static ThemeData get dark => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: AppColors.darkBg,
        colorScheme: const ColorScheme.dark(
          primary: AppColors.neonGreen,
          secondary: AppColors.cyan,
          surface: AppColors.darkSurface,
          error: AppColors.hazardRed,
          onPrimary: AppColors.darkBg,
          onSecondary: AppColors.darkBg,
          onSurface: AppColors.textPrimary,
          onError: Colors.white,
        ),
        // App Bar
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.transparent,
          elevation: 0,
          scrolledUnderElevation: 0,
          centerTitle: true,
          titleTextStyle: TextStyle(
            color: AppColors.textPrimary,
            fontSize: 22,
            fontWeight: FontWeight.bold,
            letterSpacing: 0.5,
          ),
          iconTheme: IconThemeData(color: AppColors.textPrimary),
        ),
        // Card
        cardTheme: CardThemeData(
          color: AppColors.darkSurface,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
          ),
        ),
        // Elevated Button
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.neonGreen,
            foregroundColor: AppColors.darkBg,
            elevation: 0,
            textStyle: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        // Outlined Button
        outlinedButtonTheme: OutlinedButtonThemeData(
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.textPrimary,
            side: BorderSide(color: Colors.white.withValues(alpha: 0.2)),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        // Text Button
        textButtonTheme: TextButtonThemeData(
          style: TextButton.styleFrom(
            foregroundColor: AppColors.cyan,
          ),
        ),
        // Floating Action Button
        floatingActionButtonTheme: FloatingActionButtonThemeData(
          backgroundColor: AppColors.darkSurface,
          foregroundColor: AppColors.neonGreen,
          elevation: 4,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
            side: const BorderSide(color: AppColors.cyan, width: 2),
          ),
        ),
        // Input
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: AppColors.darkSurfaceLight,
          labelStyle: const TextStyle(color: AppColors.textSecondary),
          hintStyle: TextStyle(color: AppColors.textSecondary.withValues(alpha: 0.6)),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.1)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.neonGreen, width: 2),
          ),
          errorBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: AppColors.hazardRed),
          ),
        ),
        // Tab Bar
        tabBarTheme: TabBarThemeData(
          labelColor: AppColors.neonGreen,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.neonGreen,
          indicatorSize: TabBarIndicatorSize.label,
          dividerColor: Colors.white.withValues(alpha: 0.05),
        ),
        // Bottom Sheet
        bottomSheetTheme: const BottomSheetThemeData(
          backgroundColor: Colors.transparent,
          modalBackgroundColor: Colors.transparent,
          elevation: 0,
        ),
        // Divider
        dividerTheme: DividerThemeData(
          color: Colors.white.withValues(alpha: 0.08),
          thickness: 1,
        ),
        // Dialog
        dialogTheme: DialogThemeData(
          backgroundColor: AppColors.darkSurface,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20),
          ),
          titleTextStyle: const TextStyle(
            color: AppColors.textPrimary,
            fontSize: 20,
            fontWeight: FontWeight.bold,
          ),
        ),
        // Snackbar
        snackBarTheme: SnackBarThemeData(
          backgroundColor: AppColors.darkSurfaceLight,
          contentTextStyle: const TextStyle(color: AppColors.textPrimary),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          behavior: SnackBarBehavior.floating,
        ),
        // Text
        textTheme: _textTheme(),
        // ListTile
        listTileTheme: const ListTileThemeData(
          iconColor: AppColors.neonGreen,
          textColor: AppColors.textPrimary,
        ),
        // Progress
        progressIndicatorTheme: const ProgressIndicatorThemeData(
          color: AppColors.neonGreen,
          linearTrackColor: AppColors.darkSurfaceLight,
        ),
      );

  static TextTheme _textTheme() {
    return const TextTheme(
      titleLarge: TextStyle(
        fontSize: 22,
        fontWeight: FontWeight.bold,
        color: AppColors.textPrimary,
        letterSpacing: 0.3,
      ),
      titleMedium: TextStyle(
        fontSize: 18,
        fontWeight: FontWeight.w600,
        color: AppColors.textPrimary,
      ),
      bodyLarge: TextStyle(
        fontSize: 16,
        color: AppColors.textPrimary,
      ),
      bodyMedium: TextStyle(
        fontSize: 14,
        color: AppColors.textSecondary,
      ),
      labelLarge: TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.bold,
        color: AppColors.textPrimary,
      ),
    );
  }
}
