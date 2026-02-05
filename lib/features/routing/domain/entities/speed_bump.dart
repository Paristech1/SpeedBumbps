import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Speed bump hazard location.
class SpeedBump {
  final String id;
  final LatLng location;
  final int severity;
  final int reportCount;
  final DateTime lastVerified;
  final bool isVerified;

  const SpeedBump({
    required this.id,
    required this.location,
    required this.severity,
    required this.reportCount,
    required this.lastVerified,
    required this.isVerified,
  });

  /// Only avoid verified bumps in routing.
  bool get shouldAvoidInRouting => isVerified && severity >= 3;
}
