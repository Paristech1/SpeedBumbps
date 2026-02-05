import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:speed_bump_app/features/map/presentation/providers/location_provider.dart';
import 'package:speed_bump_app/features/map/presentation/screens/map_screen.dart';
import 'package:speed_bump_app/features/map/presentation/state/map_state.dart';

void main() {
  group('MapScreen', () {
    testWidgets('Shows permission denied screen when no permission', (tester) async {
      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            locationStreamProvider.overrideWith(
              (ref) => Stream.value(const MapState.noPermission()),
            ),
          ],
          child: const MaterialApp(
            home: MapScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

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
          ],
          child: const MaterialApp(
            home: MapScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

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
          ],
          child: const MaterialApp(
            home: MapScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

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
          ],
          child: const MaterialApp(
            home: MapScreen(),
          ),
        ),
      );

      await tester.pumpAndSettle();

      expect(find.text('Something went wrong'), findsOneWidget);
      expect(find.text('Test error'), findsOneWidget);
      expect(find.text('Try Again'), findsOneWidget);
    });
  });
}
