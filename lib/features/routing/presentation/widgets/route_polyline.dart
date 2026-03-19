import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../domain/entities/route.dart';
import '../../domain/usecases/calculate_route_with_bump_avoidance.dart';

/// Builds [Polyline]s for flutter_map from route calculation results.
class RoutePolylineWidget {
  RoutePolylineWidget._();

  /// Converts [route] to a [Polyline] for flutter_map.
  static Polyline<int> createPolyline(AppRoute route) {
    return Polyline(
      points: route.polylinePoints,
      color: route.polylineColor,
      strokeWidth: 6,
      hitValue: 0,
    );
  }

  /// Straight-line preview shown while a confirmed route request is loading.
  static Polyline<int>? createPreviewPolyline(List<LatLng>? previewPoints) {
    if (previewPoints == null || previewPoints.length < 2) return null;
    return Polyline(
      points: previewPoints,
      color: Colors.blue.withValues(alpha: 0.75),
      strokeWidth: 5,
      borderColor: Colors.white.withValues(alpha: 0.7),
      borderStrokeWidth: 2,
      hitValue: -1,
    );
  }

  /// Primary and optional alternative routes: unselected drawn first (behind),
  /// selected on top. [hitValue] is route index (0 = primary, 1 = alternative).
  static List<Polyline<int>> buildMultiRoutePolylines({
    required RouteCalculationResult result,
    required int selectedIndex,
  }) {
    final polylines = <Polyline<int>>[];
    void addRoute(AppRoute route, int index, {required bool selected}) {
      if (route.polylinePoints.length < 2) return;
      final baseColor = route.polylineColor;
      polylines.add(
        Polyline(
          points: route.polylinePoints,
          color: selected ? baseColor : baseColor.withValues(alpha: 0.38),
          strokeWidth: selected ? 6 : 4,
          hitValue: index,
        ),
      );
    }

    final primary = result.primaryRoute;
    final alt = result.alternativeRoute;

    if (alt == null) {
      addRoute(primary, 0, selected: true);
      return polylines;
    }

    if (selectedIndex == 0) {
      addRoute(alt, 1, selected: false);
      addRoute(primary, 0, selected: true);
    } else {
      addRoute(primary, 0, selected: false);
      addRoute(alt, 1, selected: true);
    }
    return polylines;
  }
}
