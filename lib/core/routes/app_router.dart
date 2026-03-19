import 'package:flutter/material.dart';

import '../../features/auth/presentation/screens/auth_screen.dart';
import '../../features/auth/presentation/screens/profile_screen.dart';
import '../../features/map/presentation/screens/map_screen.dart';

/// Named route builders.
class AppRouter {
  AppRouter._();

  static Map<String, WidgetBuilder> get routes => {
        '/home': (context) => const MapScreen(),
        '/auth': (context) => const AuthScreen(),
        '/profile': (context) => const ProfileScreen(),
      };
}
