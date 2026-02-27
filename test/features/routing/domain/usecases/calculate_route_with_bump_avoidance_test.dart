import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import 'package:speed_bump_app/features/routing/domain/entities/route.dart';
import 'package:speed_bump_app/features/routing/domain/entities/route_preferences.dart';
import 'package:speed_bump_app/features/routing/domain/entities/speed_bump.dart';
import 'package:speed_bump_app/features/routing/domain/repositories/routing_repository.dart';
import 'package:speed_bump_app/features/routing/domain/repositories/speed_bump_repository.dart';
import 'package:speed_bump_app/features/routing/domain/usecases/calculate_route_with_bump_avoidance.dart';

double _metersToLat(double meters) => (meters / 6371000.0) * (180 / pi);

void main() {
  group('CalculateRouteWithBumpAvoidance', () {
    late CalculateRouteWithBumpAvoidance useCase;

    setUp(() {
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: _FakeRoutingRepository(),
        bumpRepo: _FakeSpeedBumpRepository(),
      );
    });

    test('when no bumps in bounds, returns single route with isSpeedBumpFree true', () async {
      final bumpRepo = _FakeSpeedBumpRepository()..bumps = [];
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: _FakeRoutingRepository(),
        bumpRepo: bumpRepo,
      );

      final result = await useCase.execute(
        origin: const LatLng(40.0094, -75.2194),
        destination: const LatLng(40.0150, -75.2100),
      );

      expect(result.primaryRoute.isSpeedBumpFree, isTrue);
      expect(result.primaryRoute.speedBumpCount, 0);
      expect(result.alternativeRoute, isNull);
    });

    test('when bump is on route, primary route has speedBumpCount and isSpeedBumpFree false', () async {
      // Route segment from (40.0093, -75.2193) to (40.0095, -75.2195); bump at (40.0094, -75.2194) is on it
      final routePoints = [
        const LatLng(40.0093, -75.2193),
        const LatLng(40.0095, -75.2195),
      ];
      final bump = SpeedBump(
        id: '1',
        location: const LatLng(40.0094, -75.2194),
        severity: 4,
        reportCount: 5,
        lastVerified: DateTime.now(),
        isVerified: true,
      );
      final routingRepo = _FakeRoutingRepository()..routePoints = routePoints;
      final bumpRepo = _FakeSpeedBumpRepository()..bumps = [bump];
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: routingRepo,
        bumpRepo: bumpRepo,
      );

      final result = await useCase.execute(
        origin: routePoints.first,
        destination: routePoints.last,
      );

      expect(result.primaryRoute.isSpeedBumpFree, isFalse);
      expect(result.primaryRoute.speedBumpCount, 1);
    });

    test('when bump is far from route, primary is treated as bump-free', () async {
      final routePoints = [
        const LatLng(40.0093, -75.2193),
        const LatLng(40.0095, -75.2195),
      ];
      // Bump far away (e.g. 1 degree ~ 111km)
      final bump = SpeedBump(
        id: '1',
        location: const LatLng(41.5, -76.0),
        severity: 4,
        reportCount: 5,
        lastVerified: DateTime.now(),
        isVerified: true,
      );
      final routingRepo = _FakeRoutingRepository()..routePoints = routePoints;
      final bumpRepo = _FakeSpeedBumpRepository()..bumps = [bump];
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: routingRepo,
        bumpRepo: bumpRepo,
      );

      final result = await useCase.execute(
        origin: routePoints.first,
        destination: routePoints.last,
      );

      expect(result.primaryRoute.isSpeedBumpFree, isTrue);
      expect(result.primaryRoute.speedBumpCount, 0);
      expect(result.alternativeRoute, isNull);
    });

    test('unverified or low-severity bumps are not used for avoidance', () async {
      final routePoints = [
        const LatLng(40.0093, -75.2193),
        const LatLng(40.0094, -75.2194),
        const LatLng(40.0095, -75.2195),
      ];
      final bump = SpeedBump(
        id: '1',
        location: const LatLng(40.0094, -75.2194),
        severity: 2,
        reportCount: 1,
        lastVerified: DateTime.now(),
        isVerified: false,
      );
      final routingRepo = _FakeRoutingRepository()..routePoints = routePoints;
      final bumpRepo = _FakeSpeedBumpRepository()..bumps = [bump];
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: routingRepo,
        bumpRepo: bumpRepo,
      );

      final result = await useCase.execute(
        origin: routePoints.first,
        destination: routePoints.last,
      );

      expect(result.primaryRoute.isSpeedBumpFree, isTrue);
      expect(result.primaryRoute.speedBumpCount, 0);
      expect(result.alternativeRoute, isNull);
    });

    test('avoidance waypoints are ordered along the route', () async {
      final routePoints = List.generate(
        20,
        (i) => LatLng(40.0 + i * 0.0001, -75.0),
      );
      final bumpA = SpeedBump(
        id: 'a',
        location: routePoints[10],
        severity: 4,
        reportCount: 1,
        lastVerified: DateTime.now(),
        isVerified: true,
      );
      final bumpB = SpeedBump(
        id: 'b',
        location: routePoints[5],
        severity: 4,
        reportCount: 1,
        lastVerified: DateTime.now(),
        isVerified: true,
      );
      final routingRepo = _FakeRoutingRepository()..routePoints = routePoints;
      final bumpRepo = _FakeSpeedBumpRepository()..bumps = [bumpA, bumpB];
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: routingRepo,
        bumpRepo: bumpRepo,
      );

      await useCase.execute(
        origin: routePoints.first,
        destination: routePoints.last,
      );

      final waypoints = routingRepo.lastWaypoints;
      expect(waypoints, isNotNull);
      expect(waypoints!.length, 4);
      expect(waypoints[0], routePoints[0]);
      expect(waypoints[1], routePoints[5]);
      expect(waypoints[2], routePoints[10]);
      expect(waypoints[3], routePoints[15]);
    });

    test('bump at 19.999m is detected', () async {
      final routePoints = [
        const LatLng(0.0, 0.0),
        const LatLng(0.0, 0.01),
      ];
      final bump = SpeedBump(
        id: 'near',
        location: LatLng(_metersToLat(19.999), 0.005),
        severity: 4,
        reportCount: 1,
        lastVerified: DateTime.now(),
        isVerified: true,
      );
      final routingRepo = _FakeRoutingRepository()..routePoints = routePoints;
      final bumpRepo = _FakeSpeedBumpRepository()..bumps = [bump];
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: routingRepo,
        bumpRepo: bumpRepo,
      );

      final result = await useCase.execute(
        origin: routePoints.first,
        destination: routePoints.last,
      );

      expect(result.primaryRoute.speedBumpCount, 1);
      expect(result.primaryRoute.isSpeedBumpFree, isFalse);
    });

    test('bump at 20.0001m is ignored', () async {
      final routePoints = [
        const LatLng(0.0, 0.0),
        const LatLng(0.0, 0.01),
      ];
      final bump = SpeedBump(
        id: 'far',
        location: LatLng(_metersToLat(20.0001), 0.005),
        severity: 4,
        reportCount: 1,
        lastVerified: DateTime.now(),
        isVerified: true,
      );
      final routingRepo = _FakeRoutingRepository()..routePoints = routePoints;
      final bumpRepo = _FakeSpeedBumpRepository()..bumps = [bump];
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: routingRepo,
        bumpRepo: bumpRepo,
      );

      final result = await useCase.execute(
        origin: routePoints.first,
        destination: routePoints.last,
      );

      expect(result.primaryRoute.speedBumpCount, 0);
      expect(result.primaryRoute.isSpeedBumpFree, isTrue);
    });

    test('fast mode ignores moderate bumps', () async {
      final routePoints = [
        const LatLng(40.0093, -75.2193),
        const LatLng(40.0095, -75.2195),
      ];
      final bump = SpeedBump(
        id: 'mid',
        location: const LatLng(40.0094, -75.2194),
        severity: 3,
        reportCount: 1,
        lastVerified: DateTime.now(),
        isVerified: true,
      );
      final routingRepo = _FakeRoutingRepository()..routePoints = routePoints;
      final bumpRepo = _FakeSpeedBumpRepository()..bumps = [bump];
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: routingRepo,
        bumpRepo: bumpRepo,
      );

      final result = await useCase.execute(
        origin: routePoints.first,
        destination: routePoints.last,
        avoidanceProfile: const RouteAvoidanceProfile(
          mode: RoutePreferenceMode.fast,
          vehicle: VehicleProfile.sedan,
        ),
      );

      expect(result.primaryRoute.speedBumpCount, 0);
      expect(result.primaryRoute.isSpeedBumpFree, isTrue);
    });

    test('smooth ride avoids even mild bumps', () async {
      final routePoints = [
        const LatLng(40.0093, -75.2193),
        const LatLng(40.0095, -75.2195),
      ];
      final bump = SpeedBump(
        id: 'mild',
        location: const LatLng(40.0094, -75.2194),
        severity: 1,
        reportCount: 1,
        lastVerified: DateTime.now(),
        isVerified: true,
      );
      final routingRepo = _FakeRoutingRepository()..routePoints = routePoints;
      final bumpRepo = _FakeSpeedBumpRepository()..bumps = [bump];
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: routingRepo,
        bumpRepo: bumpRepo,
      );

      final result = await useCase.execute(
        origin: routePoints.first,
        destination: routePoints.last,
        avoidanceProfile: const RouteAvoidanceProfile(
          mode: RoutePreferenceMode.smoothRide,
          vehicle: VehicleProfile.loweredCar,
        ),
      );

      expect(result.primaryRoute.speedBumpCount, 1);
      expect(result.primaryRoute.isSpeedBumpFree, isFalse);
    });

    test('integration: impossible to avoid - short route with bump in middle', () async {
      // Very short segment (bump directly on path) - both routes may still show bump
      final routePoints = [
        const LatLng(40.0094, -75.2194),
        const LatLng(40.00945, -75.21945),
        const LatLng(40.0095, -75.2195),
      ];
      final bump = SpeedBump(
        id: '1',
        location: const LatLng(40.00945, -75.21945),
        severity: 4,
        reportCount: 5,
        lastVerified: DateTime.now(),
        isVerified: true,
      );
      final routingRepo = _FakeRoutingRepository()..routePoints = routePoints;
      final bumpRepo = _FakeSpeedBumpRepository()..bumps = [bump];
      useCase = CalculateRouteWithBumpAvoidance(
        routingRepo: routingRepo,
        bumpRepo: bumpRepo,
      );

      final result = await useCase.execute(
        origin: routePoints.first,
        destination: routePoints.last,
      );

      expect(result.primaryRoute.speedBumpCount, 1);
      expect(result.primaryRoute.isSpeedBumpFree, isFalse);
      // Alternative may or may not avoid (depends on waypoint injection); no crash
      if (result.alternativeRoute != null) {
        expect(
          result.alternativeRoute!.speedBumpCount >= 0,
          isTrue,
        );
      }
    });
  });
}

class _FakeRoutingRepository implements RoutingRepository {
  List<LatLng> routePoints = [
    const LatLng(40.009, -75.22),
    const LatLng(40.015, -75.21),
  ];
  List<LatLng>? lastWaypoints;
  int callCount = 0;

  @override
  Future<AppRoute> calculateRoute({
    required LatLng origin,
    required LatLng destination,
    List<LatLng>? waypoints,
  }) async {
    callCount += 1;
    lastWaypoints = waypoints;
    return AppRoute(
      id: 'fake-route',
      polylinePoints: List.of(routePoints),
      steps: const [],
      distanceMeters: 5000,
      durationSeconds: 600,
      speedBumpCount: 0,
      isSpeedBumpFree: true,
      calculatedAt: DateTime.now(),
    );
  }
}

class _FakeSpeedBumpRepository implements SpeedBumpRepository {
  List<SpeedBump> bumps = [];

  @override
  Future<List<SpeedBump>> getAllBumps() async {
    return List.of(bumps);
  }

  @override
  Future<List<SpeedBump>> getBumpsInBounds({
    required LatLng southwest,
    required LatLng northeast,
  }) async {
    return bumps.where((b) {
      final lat = b.location.latitude;
      final lng = b.location.longitude;
      return lat >= southwest.latitude &&
          lat <= northeast.latitude &&
          lng >= southwest.longitude &&
          lng <= northeast.longitude;
    }).toList();
  }
}
