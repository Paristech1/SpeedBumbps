import 'package:latlong2/latlong.dart';

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

  /// Avoid verified bumps at or above [minSeverity].
  bool shouldAvoidInRouting({int minSeverity = 3}) {
    return isVerified && severity >= minSeverity;
  }
}
