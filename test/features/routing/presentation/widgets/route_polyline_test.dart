import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:speed_bump_app/features/routing/domain/entities/route.dart';
import 'package:speed_bump_app/features/routing/domain/entities/route_step.dart';
import 'package:speed_bump_app/features/routing/domain/usecases/calculate_route_with_bump_avoidance.dart';
import 'package:speed_bump_app/features/routing/presentation/widgets/route_polyline.dart';

void main() {
  group('RoutePolylineWidget', () {
    test('builds preview polylines for a confirmed route result', () {
      final primary = _buildRoute(
        id: 'primary-preview',
        points: const [LatLng(39.95, -75.16), LatLng(39.96, -75.15)],
        speedBumpCount: 2,
        isSpeedBumpFree: false,
      );
      final alternative = _buildRoute(
        id: 'alternative-preview',
        points: const [LatLng(39.95, -75.16), LatLng(39.965, -75.145)],
        speedBumpCount: 0,
        isSpeedBumpFree: true,
      );
      final result = RouteCalculationResult(
        primaryRoute: primary,
        alternativeRoute: alternative,
      );

      final polylines = RoutePolylineWidget.buildMultiRoutePolylines(
        result: result,
        selectedIndex: 0,
      );

      expect(polylines, hasLength(2));
      expect(polylines.last.points, primary.polylinePoints);
      expect(polylines.last.color, Colors.blue);
      expect(polylines.first.points, alternative.polylinePoints);
      expect(polylines.first.strokeWidth, 4);
      expect(polylines.last.strokeWidth, 6);
    });
  });
}

AppRoute _buildRoute({
  required String id,
  required List<LatLng> points,
  required int speedBumpCount,
  required bool isSpeedBumpFree,
}) {
  return AppRoute(
    id: id,
    polylinePoints: points,
    steps: [
      RouteStep(
        instruction: 'Head out',
        distanceMeters: 1200,
        durationSeconds: 180,
        startLocation: points.first,
        endLocation: points.last,
        maneuver: 'depart',
      ),
    ],
    distanceMeters: 1200,
    durationSeconds: 180,
    speedBumpCount: speedBumpCount,
    isSpeedBumpFree: isSpeedBumpFree,
    calculatedAt: DateTime(2026, 3, 19),
  );
}
