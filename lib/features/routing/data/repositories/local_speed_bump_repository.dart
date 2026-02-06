import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../domain/entities/speed_bump.dart';
import '../../domain/repositories/speed_bump_repository.dart';

/// In-memory implementation of [SpeedBumpRepository].
/// For Phase 2, uses an empty list or optional test bumps in Bala Cynwyd area.
class LocalSpeedBumpRepository implements SpeedBumpRepository {
  LocalSpeedBumpRepository({List<SpeedBump>? initialBumps})
      : _bumps = List.of(initialBumps ?? _defaultTestBumps);

  static List<SpeedBump> get _defaultTestBumps {
    // Optional: a few test bumps near Bala Cynwyd (MapConstants.defaultLat/Lng)
    // Use empty list for "no bumps" behavior; uncomment to test avoidance.
    return [
      // SpeedBump(
      //   id: 'test-1',
      //   location: LatLng(40.0094, -75.2194),
      //   severity: 4,
      //   reportCount: 5,
      //   lastVerified: DateTime.now(),
      //   isVerified: true,
      // ),
    ];
  }

  final List<SpeedBump> _bumps;

  @override
  Future<List<SpeedBump>> getAllBumps() async {
    return List.of(_bumps);
  }

  @override
  Future<List<SpeedBump>> getBumpsInBounds({
    required LatLng southwest,
    required LatLng northeast,
  }) async {
    final minLat = southwest.latitude;
    final maxLat = northeast.latitude;
    final minLng = southwest.longitude;
    final maxLng = northeast.longitude;

    return _bumps.where((b) {
      final lat = b.location.latitude;
      final lng = b.location.longitude;
      return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    }).toList();
  }
}
