import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../core/theme/app_theme.dart';
import '../../domain/entities/route.dart';

/// Builds [Polyline] and [Set<Polyline>] from [AppRoute] for the map.
class RoutePolylineWidget {
  RoutePolylineWidget._();

  /// Converts [route] to a [Polyline] for Google Maps.
  /// Bump-free routes are neon green; routes with bumps are cyan.
  static Polyline createPolyline(AppRoute route) {
    return Polyline(
      polylineId: PolylineId(route.id),
      points: route.polylinePoints,
      color: route.isSpeedBumpFree
          ? const Color(0xFF00E676) // neon green
          : const Color(0xFF00E5FF), // cyan
      width: 8,
      startCap: Cap.roundCap,
      endCap: Cap.roundCap,
      jointType: JointType.round,
      patterns: route.isSpeedBumpFree
          ? []
          : [PatternItem.dash(20), PatternItem.gap(10)],
    );
  }

  /// Builds a set of polylines for multiple routes.
  static Set<Polyline> createMultiplePolylines(List<AppRoute> routes) {
    return routes.map(createPolyline).toSet();
  }
}
