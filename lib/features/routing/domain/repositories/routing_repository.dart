import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../entities/route.dart';

/// Abstract interface for calculating routes.
abstract class RoutingRepository {
  /// Calculates a route from [origin] to [destination].
  /// [waypoints] are optional intermediate points (e.g. for speed bump avoidance).
  Future<AppRoute> calculateRoute({
    required LatLng origin,
    required LatLng destination,
    List<LatLng>? waypoints,
  });
}
