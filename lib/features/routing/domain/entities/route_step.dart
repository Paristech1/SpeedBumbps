import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

/// Turn-by-turn navigation instruction.
class RouteStep {
  final String instruction;
  final double distanceMeters;
  final int durationSeconds;
  final LatLng startLocation;
  final LatLng endLocation;
  final String maneuver;

  const RouteStep({
    required this.instruction,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.startLocation,
    required this.endLocation,
    required this.maneuver,
  });

  /// Icon for the maneuver.
  IconData get maneuverIcon {
    return switch (maneuver) {
      'turn-left' => Icons.turn_left,
      'turn-right' => Icons.turn_right,
      'turn-slight-left' => Icons.turn_slight_left,
      'turn-slight-right' => Icons.turn_slight_right,
      'u-turn' => Icons.u_turn_left,
      'roundabout' => Icons.roundabout_left,
      'merge' => Icons.merge,
      'depart' => Icons.trip_origin,
      'arrive' => Icons.location_on,
      _ => Icons.straight,
    };
  }
}
