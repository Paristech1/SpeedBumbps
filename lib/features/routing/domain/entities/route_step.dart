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
    switch (maneuver) {
      case 'turn-left':
        return Icons.turn_left;
      case 'turn-right':
        return Icons.turn_right;
      case 'turn-slight-left':
        return Icons.turn_slight_left;
      case 'turn-slight-right':
        return Icons.turn_slight_right;
      default:
        return Icons.straight;
    }
  }
}
