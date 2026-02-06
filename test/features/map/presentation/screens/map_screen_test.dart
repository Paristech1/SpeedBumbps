import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:speed_bump_app/features/map/presentation/providers/location_provider.dart';
import 'package:speed_bump_app/features/map/presentation/screens/map_screen.dart';
import 'package:speed_bump_app/features/map/presentation/state/map_state.dart';
import 'package:speed_bump_app/features/routing/presentation/providers/speed_bump_repository_provider.dart';

void main() {
  group('MapScreen', () {
    testWidgets('Shows permission denied screen when no permission', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(const MapState.noPermission()),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
          ],
          child: const MaterialApp(
            home: MapScreen(),
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
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(const MapState.loading()),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
          ],
          child: const MaterialApp(
            home: MapScreen(),
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
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(const MapState.serviceDisabled()),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
          ],
          child: const MaterialApp(
            home: MapScreen(),
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
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(const MapState.error('Test error')),
            ),
            speedBumpsProvider.overrideWith((ref) async => []),
          ],
          child: const MaterialApp(
            home: MapScreen(),
          ),
        ),
      );

      await tester.pump();

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Test error'), findsOneWidget);
      expect(find.text('Try Again'), findsOneWidget);
    });
  });
}
