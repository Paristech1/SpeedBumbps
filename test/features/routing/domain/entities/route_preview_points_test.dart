import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:speed_bump_app/features/routing/domain/entities/route.dart';
import 'package:speed_bump_app/features/routing/domain/entities/route_step.dart';

void main() {
  group('AppRoute.previewPolylinePoints', () {
    test('returns provided polyline points when route geometry is available', () {
      final route = AppRoute(
        id: 'route-1',
        polylinePoints: const [
          LatLng(39.9500, -75.1600),
          LatLng(39.9520, -75.1500),
        ],
        steps: const [
          RouteStep(
            instruction: 'Head east',
            distanceMeters: 100,
            durationSeconds: 60,
            startLocation: LatLng(39.9500, -75.1600),
            endLocation: LatLng(39.9520, -75.1500),
            maneuver: 'straight',
          ),
        ],
        distanceMeters: 100,
        durationSeconds: 60,
        speedBumpCount: 0,
        isSpeedBumpFree: true,
        calculatedAt: DateTime(2026),
      );

      expect(route.previewPolylinePoints, route.polylinePoints);
    });

    test('falls back to deduplicated step coordinates when geometry is missing', () {
      final route = AppRoute(
        id: 'route-2',
        polylinePoints: const [],
        steps: const [
          RouteStep(
            instruction: 'Start',
            distanceMeters: 100,
            durationSeconds: 60,
            startLocation: LatLng(39.9500, -75.1600),
            endLocation: LatLng(39.9510, -75.1550),
            maneuver: 'depart',
          ),
          RouteStep(
            instruction: 'Continue',
            distanceMeters: 120,
            durationSeconds: 70,
            startLocation: LatLng(39.9510, -75.1550),
            endLocation: LatLng(39.9530, -75.1500),
            maneuver: 'straight',
          ),
        ],
        distanceMeters: 220,
        durationSeconds: 130,
        speedBumpCount: 0,
        isSpeedBumpFree: true,
        calculatedAt: DateTime(2026),
      );

      expect(
        route.previewPolylinePoints,
        const [
          LatLng(39.9500, -75.1600),
          LatLng(39.9510, -75.1550),
          LatLng(39.9530, -75.1500),
        ],
      );
    });
  });
}
