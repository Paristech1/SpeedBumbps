import 'dart:async';

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
import 'package:speed_bump_app/features/map/domain/entities/user_location.dart';
import 'package:speed_bump_app/features/map/presentation/providers/location_provider.dart';
import 'package:speed_bump_app/features/map/presentation/screens/map_screen.dart';
import 'package:speed_bump_app/features/map/presentation/state/map_state.dart';
import 'package:speed_bump_app/features/routing/presentation/providers/route_options_provider.dart';
import 'package:speed_bump_app/features/routing/presentation/providers/speed_bump_repository_provider.dart';

Widget _buildTestMapScreen() =>
    const MapScreen(tileLayerBuilder: _emptyTileLayer);

Widget _emptyTileLayer() => const SizedBox.shrink();

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

    testWidgets('Shows permission denied screen when no permission', (
      tester,
    ) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...authOverrides,
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(const MapState.noPermission()),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
          ],
          child: MaterialApp(home: _buildTestMapScreen()),
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
          child: MaterialApp(home: _buildTestMapScreen()),
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
          child: MaterialApp(home: _buildTestMapScreen()),
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
          child: MaterialApp(home: _buildTestMapScreen()),
        ),
      );

      await tester.pump();

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Test error'), findsOneWidget);
      expect(find.text('Try Again'), findsOneWidget);
    });

    testWidgets('Shows a route preview after a route is confirmed', (
      tester,
    ) async {
      const previewPoints = [
        LatLng(39.9526, -75.1652),
        LatLng(39.9626, -75.1552),
      ];
      final location = UserLocation(
        latitude: 39.9526,
        longitude: -75.1652,
        accuracy: 5,
        timestamp: DateTime(2026, 3, 19),
      );

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            ...authOverrides,
            pendingRoutePreviewProvider.overrideWith((ref) => previewPoints),
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(MapState.success(location)),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
          ],
          child: MaterialApp(home: _buildTestMapScreen()),
        ),
      );

      await tester.pumpAndSettle();

      final polylineLayer = tester.widget<PolylineLayer<int>>(
        find.byType(PolylineLayer<int>),
      );
      expect(polylineLayer.polylines, hasLength(1));
      expect(polylineLayer.polylines.single.points, previewPoints);
      expect(polylineLayer.polylines.single.borderStrokeWidth, 2);
    });
  });
}
