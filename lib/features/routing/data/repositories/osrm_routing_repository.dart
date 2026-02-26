import 'package:latlong2/latlong.dart';

import '../../domain/entities/route.dart';
import '../../domain/entities/route_step.dart';
import '../../domain/repositories/routing_repository.dart';
import '../datasources/osrm_directions_api.dart';

/// Uses OSRM (free, no API key) for routing.
class OsrmRoutingRepository implements RoutingRepository {
  OsrmRoutingRepository({OsrmDirectionsAPI? api})
      : _api = api ?? OsrmDirectionsAPI();

  final OsrmDirectionsAPI _api;

  @override
  Future<AppRoute> calculateRoute({
    required LatLng origin,
    required LatLng destination,
    List<LatLng>? waypoints,
  }) async {
    final result = await _api.getRoute(
      origin: origin,
      destination: destination,
      waypoints: waypoints,
    );

    final steps = result.steps.asMap().entries.map((e) {
      final i = e.key;
      final s = e.value;
      final nextLoc = i + 1 < result.steps.length
          ? result.steps[i + 1].location
          : result.polylinePoints.isNotEmpty
              ? result.polylinePoints.last
              : s.location;
      return RouteStep(
        instruction: _stripHtml(s.instruction),
        distanceMeters: s.distanceMeters,
        durationSeconds: s.durationSeconds,
        startLocation: s.location,
        endLocation: nextLoc,
        maneuver: 'straight',
      );
    }).toList();

    if (steps.isEmpty && result.polylinePoints.length >= 2) {
      steps.add(RouteStep(
        instruction: 'Head to destination',
        distanceMeters: result.distanceMeters,
        durationSeconds: result.durationSeconds,
        startLocation: result.polylinePoints.first,
        endLocation: result.polylinePoints.last,
        maneuver: 'straight',
      ));
    }

    return AppRoute(
      id: 'route_${DateTime.now().millisecondsSinceEpoch}',
      polylinePoints: result.polylinePoints,
      steps: steps,
      distanceMeters: result.distanceMeters,
      durationSeconds: result.durationSeconds,
      speedBumpCount: 0,
      isSpeedBumpFree: true,
      calculatedAt: DateTime.now(),
    );
  }

  String _stripHtml(String text) {
    return text
        .replaceAll(RegExp(r'<[^>]*>'), '')
        .replaceAll('&nbsp;', ' ')
        .replaceAll(RegExp(r'&\w+;'), '')
        .trim();
  }
}
