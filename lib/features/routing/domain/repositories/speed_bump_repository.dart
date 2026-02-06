import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../entities/speed_bump.dart';

/// Abstract interface for querying speed bump data.
abstract class SpeedBumpRepository {
  /// Returns all known speed bumps.
  Future<List<SpeedBump>> getAllBumps();

  /// Returns speed bumps within the given bounding box.
  Future<List<SpeedBump>> getBumpsInBounds({
    required LatLng southwest,
    required LatLng northeast,
  });
}
