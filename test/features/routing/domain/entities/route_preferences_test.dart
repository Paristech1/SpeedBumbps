import 'package:flutter_test/flutter_test.dart';

import 'package:speed_bump_app/features/routing/domain/entities/route_preferences.dart';

void main() {
  group('RouteAvoidanceProfile', () {
    test('defaults to cargo-conscious sedan (severity 3+)', () {
      const profile = RouteAvoidanceProfile();
      expect(profile.mode, RoutePreferenceMode.cargoConscious);
      expect(profile.vehicle, VehicleProfile.sedan);
      expect(profile.minSeverityToAvoid, 3);
    });

    test('smooth ride lowers threshold to 1', () {
      const profile = RouteAvoidanceProfile(
        mode: RoutePreferenceMode.smoothRide,
        vehicle: VehicleProfile.sedan,
      );
      expect(profile.minSeverityToAvoid, 1);
    });

    test('fast mode raises threshold to 4', () {
      const profile = RouteAvoidanceProfile(
        mode: RoutePreferenceMode.fast,
        vehicle: VehicleProfile.sedan,
      );
      expect(profile.minSeverityToAvoid, 4);
    });

    test('vehicle adjustments clamp to valid range', () {
      const bicycleSmooth = RouteAvoidanceProfile(
        mode: RoutePreferenceMode.smoothRide,
        vehicle: VehicleProfile.bicycle,
      );
      const suvFast = RouteAvoidanceProfile(
        mode: RoutePreferenceMode.fast,
        vehicle: VehicleProfile.suv,
      );

      expect(bicycleSmooth.minSeverityToAvoid, 1);
      expect(suvFast.minSeverityToAvoid, 5);
    });
  });
}
