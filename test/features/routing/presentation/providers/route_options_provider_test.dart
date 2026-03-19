import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';
import 'package:speed_bump_app/features/routing/domain/entities/route.dart';
import 'package:speed_bump_app/features/routing/domain/entities/route_preferences.dart';
import 'package:speed_bump_app/features/routing/domain/entities/route_step.dart';
import 'package:speed_bump_app/features/routing/domain/entities/speed_bump.dart';
import 'package:speed_bump_app/features/routing/domain/repositories/routing_repository.dart';
import 'package:speed_bump_app/features/routing/domain/repositories/speed_bump_repository.dart';
import 'package:speed_bump_app/features/routing/domain/usecases/calculate_route_with_bump_avoidance.dart';
import 'package:speed_bump_app/features/routing/presentation/providers/route_options_provider.dart';
import 'package:speed_bump_app/features/routing/presentation/providers/routing_provider.dart';

void main() {
  group('routeCalculationResultProvider', () {
    test(
      'keeps the last successful route available while recalculating',
      () async {
        final initialPrimary = _buildRoute(
          id: 'primary-initial',
          points: const [LatLng(39.95, -75.16), LatLng(39.96, -75.15)],
          speedBumpCount: 1,
          isSpeedBumpFree: false,
        );
        final initialAlternative = _buildRoute(
          id: 'alternative-initial',
          points: const [LatLng(39.95, -75.16), LatLng(39.965, -75.145)],
          speedBumpCount: 0,
          isSpeedBumpFree: true,
        );
        final nextPrimary = _buildRoute(
          id: 'primary-next',
          points: const [LatLng(39.97, -75.14), LatLng(39.98, -75.13)],
          speedBumpCount: 0,
          isSpeedBumpFree: true,
        );
        final nextAlternative = _buildRoute(
          id: 'alternative-next',
          points: const [LatLng(39.97, -75.14), LatLng(39.985, -75.125)],
          speedBumpCount: 0,
          isSpeedBumpFree: true,
        );
        final initialPendingAlternative = Completer<AppRoute>();
        final nextPendingAlternative = Completer<AppRoute>();
        final routingRepo = _SequencedRoutingRepository(
          responses: [
            Future<AppRoute>.value(initialPrimary),
            initialPendingAlternative.future,
            Future<AppRoute>.value(nextPrimary),
            nextPendingAlternative.future,
          ],
        );
        final container = ProviderContainer(
          overrides: [
            calculateRouteWithBumpAvoidanceProvider.overrideWithValue(
              CalculateRouteWithBumpAvoidance(
                routingRepo: routingRepo,
                bumpRepo: _StaticSpeedBumpRepository(
                  bumpsInBounds: [
                    SpeedBump(
                      id: 'bump-1',
                      location: const LatLng(39.955, -75.155),
                      severity: 4,
                      reportCount: 3,
                      lastVerified: DateTime(2026, 3, 1),
                      isVerified: true,
                    ),
                    SpeedBump(
                      id: 'bump-2',
                      location: const LatLng(39.975, -75.135),
                      severity: 4,
                      reportCount: 2,
                      lastVerified: DateTime(2026, 3, 1),
                      isVerified: true,
                    ),
                  ],
                ),
              ),
            ),
          ],
        );
        addTearDown(container.dispose);

        const profile = RouteAvoidanceProfile();

        final firstCalculation =
            container.read(routingProvider.notifier).calculateRoute(
                  origin: const LatLng(39.95, -75.16),
                  destination: const LatLng(39.96, -75.15),
                  avoidanceProfile: profile,
                );
        initialPendingAlternative.complete(initialAlternative);
        await firstCalculation;

        expect(
          container.read(routeCalculationResultProvider)?.primaryRoute.id,
          'primary-initial',
        );
        expect(
          container.read(routeCalculationResultProvider)?.alternativeRoute?.id,
          'alternative-initial',
        );

        container.read(selectedRouteIndexProvider.notifier).state = 1;
        final secondCalculation =
            container.read(routingProvider.notifier).calculateRoute(
                  origin: const LatLng(39.97, -75.14),
                  destination: const LatLng(39.98, -75.13),
                  avoidanceProfile: profile,
                );
        await Future<void>.delayed(Duration.zero);

        expect(
          container.read(routeCalculationResultProvider)?.primaryRoute.id,
          'primary-initial',
          reason:
              'The last confirmed route should remain available as the preview.',
        );
        expect(
          container.read(selectedRouteProvider)?.id,
          'alternative-initial',
        );

        nextPendingAlternative.complete(nextAlternative);
        await secondCalculation;

        expect(
          container.read(routeCalculationResultProvider)?.primaryRoute.id,
          'primary-next',
        );
        expect(
          container.read(routeCalculationResultProvider)?.alternativeRoute?.id,
          'alternative-next',
        );
        expect(container.read(selectedRouteProvider)?.id, 'alternative-next');
      },
    );
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

class _SequencedRoutingRepository implements RoutingRepository {
  _SequencedRoutingRepository({required List<Future<AppRoute>> responses})
      : _responses = List.of(responses);

  final List<Future<AppRoute>> _responses;
  int _callCount = 0;

  @override
  Future<AppRoute> calculateRoute({
    required LatLng origin,
    required LatLng destination,
    List<LatLng>? waypoints,
  }) {
    if (_callCount >= _responses.length) {
      throw StateError('No routing response configured for call $_callCount');
    }
    return _responses[_callCount++];
  }
}

class _StaticSpeedBumpRepository implements SpeedBumpRepository {
  _StaticSpeedBumpRepository({this.bumpsInBounds = const []});

  final List<SpeedBump> bumpsInBounds;

  @override
  Future<List<SpeedBump>> getAllBumps() async => bumpsInBounds;

  @override
  Future<List<SpeedBump>> getBumpsInBounds({
    required LatLng southwest,
    required LatLng northeast,
  }) async =>
      bumpsInBounds;
}
