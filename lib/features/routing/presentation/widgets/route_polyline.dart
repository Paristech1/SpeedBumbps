import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';

import '../../domain/entities/route.dart';

/// Builds [Polyline] for flutter_map from [AppRoute].
class RoutePolylineWidget {
  RoutePolylineWidget._();

  /// Converts [route] to a [Polyline] for flutter_map.
  static Polyline createPolyline(AppRoute route) {
    return Polyline(
      points: route.polylinePoints,
      color: route.polylineColor,
      strokeWidth: 6,
    );
  }
}
