import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:firebase_auth_mocks/firebase_auth_mocks.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:speed_bump_app/features/auth/data/datasources/firebase_auth_datasource.dart';
import 'package:speed_bump_app/features/auth/data/datasources/firestore_user_datasource.dart';
import 'package:speed_bump_app/features/auth/presentation/providers/auth_state_provider.dart';
import 'package:speed_bump_app/features/map/presentation/providers/location_provider.dart';
import 'package:speed_bump_app/features/map/presentation/screens/map_screen.dart';
import 'package:speed_bump_app/features/map/presentation/state/map_state.dart';
import 'package:speed_bump_app/features/routing/presentation/providers/speed_bump_repository_provider.dart';

void main() {
  testWidgets('MapScreen renders permission prompt', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          firebaseAuthDatasourceProvider.overrideWithValue(
            FirebaseAuthDatasource(firebaseAuth: MockFirebaseAuth(signedIn: false)),
          ),
          firestoreUserDatasourceProvider.overrideWithValue(
            FirestoreUserDatasource(firestore: FakeFirebaseFirestore()),
          ),
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
}
