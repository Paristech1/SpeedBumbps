import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';
import 'package:speed_bump_app/features/auth/data/datasources/firebase_auth_datasource.dart';
import 'package:speed_bump_app/features/auth/data/datasources/firestore_user_datasource.dart';
import 'package:speed_bump_app/features/auth/presentation/providers/auth_state_provider.dart';
import 'package:speed_bump_app/features/map/presentation/providers/location_provider.dart';
import 'package:speed_bump_app/features/map/domain/entities/user_location.dart';
import 'package:speed_bump_app/features/map/presentation/screens/map_screen.dart';
import 'package:speed_bump_app/features/map/presentation/state/map_state.dart';
import 'package:speed_bump_app/features/routing/domain/entities/route.dart';
import 'package:speed_bump_app/features/routing/domain/entities/speed_bump.dart';
import 'package:speed_bump_app/features/routing/domain/entities/route_step.dart';
import 'package:speed_bump_app/features/routing/domain/usecases/calculate_route_with_bump_avoidance.dart';
import 'package:speed_bump_app/features/routing/domain/repositories/routing_repository.dart';
import 'package:speed_bump_app/features/routing/domain/repositories/speed_bump_repository.dart';
import 'package:speed_bump_app/features/routing/presentation/providers/routing_provider.dart';
import 'package:speed_bump_app/features/routing/presentation/state/routing_state.dart';
import 'package:speed_bump_app/features/routing/presentation/providers/speed_bump_repository_provider.dart';

void main() {
  group('MapScreen', () {
    final authOverrides = [
      firebaseAuthDatasourceProvider.overrideWithValue(
        FirebaseAuthDatasource(firebaseAuth: MockFirebaseAuth(signedIn: false)),
      ),
      firestoreUserDatasourceProvider.overrideWithValue(
        FirestoreUserDatasource(firestore: FakeFirebaseFirestore()),
      ),
    ];

    testWidgets('Shows permission denied screen when no permission', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...authOverrides,
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(const MapState.noPermission()),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
          ],
          child: const MaterialApp(
            home: MapScreen(showBaseMap: false),
          ),
        ),
      );

      await tester.pump();

      expect(find.text('Location Permission Required'), findsOneWidget);
      expect(find.byIcon(Icons.location_off), findsOneWidget);
    });

    testWidgets('Shows loading when loading state', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...authOverrides,
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(const MapState.loading()),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
          ],
          child: const MaterialApp(
            home: MapScreen(showBaseMap: false),
          ),
        ),
      );

      await tester.pump();

      expect(find.text('Finding your location...'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('Shows GPS off screen when service disabled', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...authOverrides,
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(const MapState.serviceDisabled()),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
          ],
          child: const MaterialApp(
            home: MapScreen(showBaseMap: false),
          ),
        ),
      );

      await tester.pump();

      expect(find.text('GPS is Turned Off'), findsOneWidget);
      expect(find.byIcon(Icons.gps_off), findsOneWidget);
    });

    testWidgets('Shows error screen with Try Again button', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...authOverrides,
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(const MapState.error('Test error')),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
          ],
          child: const MaterialApp(
            home: MapScreen(showBaseMap: false),
          ),
        ),
      );

      await tester.pump();

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Test error'), findsOneWidget);
      expect(find.text('Try Again'), findsOneWidget);
    });

    testWidgets('renders a route preview polyline after route confirmation', (tester) async {
      final route = AppRoute(
        id: 'preview-route',
        polylinePoints: const [],
        steps: const [
          RouteStep(
            instruction: 'Depart',
            distanceMeters: 100,
            durationSeconds: 60,
            startLocation: LatLng(39.9500, -75.1600),
            endLocation: LatLng(39.9510, -75.1550),
            maneuver: 'depart',
          ),
          RouteStep(
            instruction: 'Arrive',
            distanceMeters: 100,
            durationSeconds: 60,
            startLocation: LatLng(39.9510, -75.1550),
            endLocation: LatLng(39.9520, -75.1500),
            maneuver: 'arrive',
          ),
        ],
        distanceMeters: 200,
        durationSeconds: 120,
        speedBumpCount: 0,
        isSpeedBumpFree: true,
        calculatedAt: DateTime(2026),
      );
      final result = RouteCalculationResult(primaryRoute: route);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...authOverrides,
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(
                MapState.success(
                  UserLocation(
                    latitude: 39.9500,
                    longitude: -75.1600,
                    accuracy: 5,
                    timestamp: DateTime(2026),
                  ),
                ),
              ),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
            routingProvider.overrideWith((ref) => _TestRoutingNotifier(
                  RoutingState.success(result),
                )),
          ],
          child: const MaterialApp(
            home: MapScreen(showBaseMap: false),
          ),
        ),
      );

      await tester.pumpAndSettle();

      final polylineLayer = tester.widget<PolylineLayer<int>>(
        find.byWidgetPredicate((widget) => widget is PolylineLayer<int>),
      );

      expect(polylineLayer.polylines, hasLength(1));
      expect(
        polylineLayer.polylines.single.points,
        route.previewPolylinePoints,
      );
      expect(find.text('2 min'), findsOneWidget);
    });
  });
}

class _TestRoutingNotifier extends RoutingNotifier {
  _TestRoutingNotifier(RoutingState initialState)
      : super(_NoopCalculateRouteWithBumpAvoidance()) {
    state = initialState;
  }
}

class _NoopCalculateRouteWithBumpAvoidance extends CalculateRouteWithBumpAvoidance {
  _NoopCalculateRouteWithBumpAvoidance()
      : super(
          routingRepo: _UnsupportedRoutingRepository(),
          bumpRepo: _UnsupportedSpeedBumpRepository(),
        );
}

class _UnsupportedRoutingRepository
    implements RoutingRepository {
  @override
  Future<AppRoute> calculateRoute({
    required LatLng origin,
    required LatLng destination,
    List<LatLng>? waypoints,
  }) {
    throw UnimplementedError();
  }
}

class _UnsupportedSpeedBumpRepository
    implements SpeedBumpRepository {
  @override
  Future<List<SpeedBump>> getAllBumps() {
    throw UnimplementedError();
  }

  @override
  Future<List<SpeedBump>> getBumpsInBounds({
    required LatLng southwest,
    required LatLng northeast,
  }) {
    throw UnimplementedError();
  }
}
