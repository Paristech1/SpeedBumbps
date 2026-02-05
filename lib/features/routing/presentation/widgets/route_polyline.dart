import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../domain/entities/route.dart';

/// Builds [Polyline] and [Set<Polyline>] from [AppRoute] for the map.
class RoutePolylineWidget {
  RoutePolylineWidget._();

  /// Converts [route] to a [Polyline] for Google Maps.
  static Polyline createPolyline(AppRoute route) {
    return Polyline(
      polylineId: PolylineId(route.id),
      points: route.polylinePoints,
      color: route.polylineColor,
      width: 6,
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
