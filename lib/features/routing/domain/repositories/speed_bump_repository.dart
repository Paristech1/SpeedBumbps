import 'package:latlong2/latlong.dart';

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
