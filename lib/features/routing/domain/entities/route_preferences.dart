import 'package:flutter/foundation.dart';

@immutable
class RouteAvoidanceProfile {
  const RouteAvoidanceProfile({
    this.mode = RoutePreferenceMode.cargoConscious,
    this.vehicle = VehicleProfile.sedan,
  });

  final RoutePreferenceMode mode;
  final VehicleProfile vehicle;

  int get minSeverityToAvoid {
    final base = switch (mode) {
      RoutePreferenceMode.smoothRide => 1,
      RoutePreferenceMode.cargoConscious => 3,
      RoutePreferenceMode.fast => 4,
    };
    final adjust = switch (vehicle) {
      VehicleProfile.loweredCar => -1,
      VehicleProfile.motorcycle => -1,
      VehicleProfile.bicycle => -2,
      VehicleProfile.suv => 1,
      VehicleProfile.sedan => 0,
    };
    final value = base + adjust;
    if (value < 1) return 1;
    if (value > 5) return 5;
    return value;
  }

  String get cacheKey => '${mode.name}-${vehicle.name}';

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is RouteAvoidanceProfile &&
        other.mode == mode &&
        other.vehicle == vehicle;
  }

  @override
  int get hashCode => Object.hash(mode, vehicle);
}

enum RoutePreferenceMode { smoothRide, cargoConscious, fast }

enum VehicleProfile { sedan, suv, loweredCar, motorcycle, bicycle }
