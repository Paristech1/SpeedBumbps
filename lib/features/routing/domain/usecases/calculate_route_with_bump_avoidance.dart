import 'dart:math' show cos, sin, sqrt, asin, pi;

import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../entities/route.dart';
import '../entities/route_preferences.dart';
import '../entities/speed_bump.dart';
import '../repositories/routing_repository.dart';
import '../repositories/speed_bump_repository.dart';

/// Result of route calculation with optional alternative (bump-free) route.
class RouteCalculationResult {
  final AppRoute primaryRoute;
  final AppRoute? alternativeRoute;

  const RouteCalculationResult({
    required this.primaryRoute,
    this.alternativeRoute,
  });
}

/// Calculates route from origin to destination and optionally an alternative
/// route that avoids verified speed bumps via waypoint injection.
class CalculateRouteWithBumpAvoidance {
  CalculateRouteWithBumpAvoidance({
    required RoutingRepository routingRepo,
    required SpeedBumpRepository bumpRepo,
  })  : _routingRepo = routingRepo,
        _bumpRepo = bumpRepo;

  final RoutingRepository _routingRepo;
  final SpeedBumpRepository _bumpRepo;

  static const double _bumpProximityMeters = 20.0;
  static const int _waypointOffsetPoints = 5;
  static const double _boundsPaddingMeters = 200.0;

  /// Main execution: calculate route and avoid speed bumps when possible.
  Future<RouteCalculationResult> execute({
    required LatLng origin,
    required LatLng destination,
    RouteAvoidanceProfile? avoidanceProfile,
  }) async {
    final profile = avoidanceProfile ?? const RouteAvoidanceProfile();
    // Step 1: Default route
    final defaultRoute = await _routingRepo.calculateRoute(
      origin: origin,
      destination: destination,
    );

    // Step 2: Bumps in bounds
    final southwest = _boundsSouthwest(origin, destination);
    final northeast = _boundsNortheast(origin, destination);
    final expandedBounds = _expandBounds(
      southwest: southwest,
      northeast: northeast,
      paddingMeters: _boundsPaddingMeters,
    );
    final allBumps = await _bumpRepo.getBumpsInBounds(
      southwest: expandedBounds.southwest,
      northeast: expandedBounds.northeast,
    );
    final criticalBumps = allBumps
        .where((b) => b.shouldAvoidInRouting(minSeverity: profile.minSeverityToAvoid))
        .toList();

    // Step 3: Detect bumps on route
    final bumpsOnRoute = _detectBumpsOnRoute(
      routePoints: defaultRoute.polylinePoints,
      bumps: criticalBumps,
    );

    if (bumpsOnRoute.isEmpty) {
      return RouteCalculationResult(
        primaryRoute: defaultRoute.copyWith(
          isSpeedBumpFree: true,
          speedBumpCount: 0,
        ),
        alternativeRoute: null,
      );
    }

    // Step 4: Alternative route with avoidance waypoints
    final avoidanceWaypoints = _generateAvoidanceWaypoints(
      bumps: bumpsOnRoute,
      routePoints: defaultRoute.polylinePoints,
    );
    final sortedAvoidanceWaypoints = _sortWaypointsByRouteIndex(
      waypoints: avoidanceWaypoints,
      routePoints: defaultRoute.polylinePoints,
    );

    AppRoute alternativeRoute;
    try {
      alternativeRoute = await _routingRepo.calculateRoute(
        origin: origin,
        destination: destination,
        waypoints: sortedAvoidanceWaypoints,
      );
    } catch (_) {
      return RouteCalculationResult(
        primaryRoute: defaultRoute.copyWith(
          speedBumpCount: bumpsOnRoute.length,
          isSpeedBumpFree: false,
        ),
        alternativeRoute: null,
      );
    }

    final bumpsOnAlternative = _detectBumpsOnRoute(
      routePoints: alternativeRoute.polylinePoints,
      bumps: criticalBumps,
    );

    return RouteCalculationResult(
      primaryRoute: defaultRoute.copyWith(
        speedBumpCount: bumpsOnRoute.length,
        isSpeedBumpFree: false,
      ),
      alternativeRoute: alternativeRoute.copyWith(
        speedBumpCount: bumpsOnAlternative.length,
        isSpeedBumpFree: bumpsOnAlternative.isEmpty,
      ),
    );
  }

  /// Bumps that intersect the route (within [_bumpProximityMeters] of a segment).
  List<SpeedBump> _detectBumpsOnRoute({
    required List<LatLng> routePoints,
    required List<SpeedBump> bumps,
  }) {
    final intersecting = <SpeedBump>[];
    for (final bump in bumps) {
      for (int i = 0; i < routePoints.length - 1; i++) {
        final dist = _distanceToLineSegment(
          point: bump.location,
          lineStart: routePoints[i],
          lineEnd: routePoints[i + 1],
        );
        if (dist <= _bumpProximityMeters) {
          intersecting.add(bump);
          break;
        }
      }
    }
    return intersecting;
  }

  /// Waypoints to force route around bumps (~50 m before/after each bump).
  List<LatLng> _generateAvoidanceWaypoints({
    required List<SpeedBump> bumps,
    required List<LatLng> routePoints,
  }) {
    if (routePoints.isEmpty || bumps.isEmpty) return const <LatLng>[];

    final indexed = <_IndexedWaypoint>[];
    for (final bump in bumps) {
      final idx = _findClosestPointIndex(
        target: bump.location,
        points: routePoints,
      );
      final before = idx - _waypointOffsetPoints;
      if (before >= 0 && before < routePoints.length) {
        indexed.add(_IndexedWaypoint(before, routePoints[before]));
      }
      final after = idx + _waypointOffsetPoints;
      if (after >= 0 && after < routePoints.length) {
        indexed.add(_IndexedWaypoint(after, routePoints[after]));
      }
    }

    indexed.sort((a, b) => a.index.compareTo(b.index));

    final waypoints = <LatLng>[];
    LatLng? last;
    for (final item in indexed) {
      if (last == null ||
          last.latitude != item.point.latitude ||
          last.longitude != item.point.longitude) {
        waypoints.add(item.point);
        last = item.point;
      }
    }
    return waypoints;
  }

  /// Sorts waypoints by their closest index along the route polyline.
  List<LatLng> _sortWaypointsByRouteIndex({
    required List<LatLng> waypoints,
    required List<LatLng> routePoints,
  }) {
    if (waypoints.isEmpty || routePoints.isEmpty) {
      return List<LatLng>.of(waypoints);
    }

    final indexed = waypoints
        .map((point) => _IndexedWaypoint(
              _findClosestPointIndex(target: point, points: routePoints),
              point,
            ))
        .toList()
      ..sort((a, b) => a.index.compareTo(b.index));

    final sorted = <LatLng>[];
    LatLng? last;
    for (final item in indexed) {
      if (last == null ||
          last.latitude != item.point.latitude ||
          last.longitude != item.point.longitude) {
        sorted.add(item.point);
        last = item.point;
      }
    }
    return sorted;
  }

  /// Perpendicular distance from point to line segment (meters).
  /// Uses linear interpolation on lat/lng then Haversine (valid for short segments).
  double _distanceToLineSegment({
    required LatLng point,
    required LatLng lineStart,
    required LatLng lineEnd,
  }) {
    final dx = lineEnd.longitude - lineStart.longitude;
    final dy = lineEnd.latitude - lineStart.latitude;
    final lenSq = dx * dx + dy * dy;
    if (lenSq == 0) {
      return _haversineDistance(point, lineStart);
    }
    var t = ((point.longitude - lineStart.longitude) * dx +
            (point.latitude - lineStart.latitude) * dy) /
        lenSq;
    t = t.clamp(0.0, 1.0);
    final closest = LatLng(
      lineStart.latitude + t * dy,
      lineStart.longitude + t * dx,
    );
    return _haversineDistance(point, closest);
  }

  /// Haversine distance between two points in meters.
  double _haversineDistance(LatLng p1, LatLng p2) {
    const r = 6371000.0; // meters
    final lat1 = p1.latitude * pi / 180;
    final lat2 = p2.latitude * pi / 180;
    final dLat = (p2.latitude - p1.latitude) * pi / 180;
    final dLon = (p2.longitude - p1.longitude) * pi / 180;
    final a = sin(dLat / 2) * sin(dLat / 2) +
        cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2);
    final c = 2 * asin(sqrt(a));
    return r * c;
  }

  int _findClosestPointIndex({
    required LatLng target,
    required List<LatLng> points,
  }) {
    double minDist = double.infinity;
    int idx = 0;
    for (var i = 0; i < points.length; i++) {
      final d = _haversineDistance(target, points[i]);
      if (d < minDist) {
        minDist = d;
        idx = i;
      }
    }
    return idx;
  }

  LatLng _boundsSouthwest(LatLng a, LatLng b) {
    return LatLng(
      a.latitude < b.latitude ? a.latitude : b.latitude,
      a.longitude < b.longitude ? a.longitude : b.longitude,
    );
  }

  LatLng _boundsNortheast(LatLng a, LatLng b) {
    return LatLng(
      a.latitude > b.latitude ? a.latitude : b.latitude,
      a.longitude > b.longitude ? a.longitude : b.longitude,
    );
  }

  _Bounds _expandBounds({
    required LatLng southwest,
    required LatLng northeast,
    required double paddingMeters,
  }) {
    final midLat = (southwest.latitude + northeast.latitude) / 2;
    final dLat = paddingMeters / 111320.0;
    final cosLat = cos(midLat * pi / 180).abs().clamp(0.1, 1.0);
    final dLng = paddingMeters / (111320.0 * cosLat);
    return _Bounds(
      southwest: LatLng(
        southwest.latitude - dLat,
        southwest.longitude - dLng,
      ),
      northeast: LatLng(
        northeast.latitude + dLat,
        northeast.longitude + dLng,
      ),
    );
  }
}

class _IndexedWaypoint {
  const _IndexedWaypoint(this.index, this.point);
  final int index;
  final LatLng point;
}

class _Bounds {
  const _Bounds({required this.southwest, required this.northeast});
  final LatLng southwest;
  final LatLng northeast;
}
