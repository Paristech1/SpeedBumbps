import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../utils/geo_utils.dart';
import 'route_step.dart';

/// Represents a complete navigation route.
class AppRoute {
  final String id;
  final List<LatLng> polylinePoints;
  final List<RouteStep> steps;
  final double distanceMeters;
  final int durationSeconds;
  final int speedBumpCount;
  final bool isSpeedBumpFree;
  final DateTime calculatedAt;

  const AppRoute({
    required this.id,
    required this.polylinePoints,
    required this.steps,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.speedBumpCount,
    required this.isSpeedBumpFree,
    required this.calculatedAt,
  });

  /// Human-readable distance (e.g., "3.2 miles").
  String get distanceFormatted {
    final miles = distanceMeters * 0.000621371;
    return '${miles.toStringAsFixed(1)} mi';
  }

  /// Human-readable duration (e.g., "12 min").
  String get durationFormatted {
    final minutes = (durationSeconds / 60).round();
    return '$minutes min';
  }

  /// Point along the polyline at ~half travel distance (for summary chips).
  LatLng? get polylineMidpoint => midpointAlongPolyline(previewPolylinePoints);

  /// Points to use when rendering a visual route preview.
  ///
  /// OSRM normally provides `polylinePoints`, but we still want a visible route
  /// preview when the overview geometry is missing or incomplete. In that case,
  /// we fall back to the step start/end coordinates and deduplicate adjacent
  /// points so the map still has a valid polyline to draw.
  List<LatLng> get previewPolylinePoints {
    if (polylinePoints.length >= 2) {
      return polylinePoints;
    }

    final previewPoints = <LatLng>[];

    void addPoint(LatLng point) {
      if (previewPoints.isEmpty) {
        previewPoints.add(point);
        return;
      }

      final last = previewPoints.last;
      if (last.latitude == point.latitude && last.longitude == point.longitude) {
        return;
      }
      previewPoints.add(point);
    }

    for (final step in steps) {
      addPoint(step.startLocation);
      addPoint(step.endLocation);
    }

    return previewPoints;
  }

  /// Color for polyline display.
  Color get polylineColor {
    if (isSpeedBumpFree) return Colors.green;
    if (speedBumpCount > 5) return Colors.red;
    return Colors.blue;
  }

  AppRoute copyWith({
    String? id,
    List<LatLng>? polylinePoints,
    List<RouteStep>? steps,
    double? distanceMeters,
    int? durationSeconds,
    int? speedBumpCount,
    bool? isSpeedBumpFree,
    DateTime? calculatedAt,
  }) {
    return AppRoute(
      id: id ?? this.id,
      polylinePoints: polylinePoints ?? this.polylinePoints,
      steps: steps ?? this.steps,
      distanceMeters: distanceMeters ?? this.distanceMeters,
      durationSeconds: durationSeconds ?? this.durationSeconds,
      speedBumpCount: speedBumpCount ?? this.speedBumpCount,
      isSpeedBumpFree: isSpeedBumpFree ?? this.isSpeedBumpFree,
      calculatedAt: calculatedAt ?? this.calculatedAt,
    );
  }
}
