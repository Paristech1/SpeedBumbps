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
        instruction: _buildInstruction(s),
        distanceMeters: s.distanceMeters,
        durationSeconds: s.durationSeconds,
        startLocation: s.location,
        endLocation: nextLoc,
        maneuver: _osrmToManeuver(s.maneuverType, s.maneuverModifier),
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

  String _buildInstruction(OsrmStep s) {
    final raw = s.instruction.trim();
    if (s.name.isNotEmpty && !raw.contains(s.name)) {
      return '$raw onto ${s.name}';
    }
    return raw;
  }

  String _osrmToManeuver(String type, String modifier) {
    if (type == 'turn' || type == 'end of road' || type == 'fork') {
      return switch (modifier) {
        'left' => 'turn-left',
        'right' => 'turn-right',
        'slight left' => 'turn-slight-left',
        'slight right' => 'turn-slight-right',
        'sharp left' => 'turn-left',
        'sharp right' => 'turn-right',
        'uturn' => 'u-turn',
        _ => 'straight',
      };
    }
    if (type == 'roundabout' || type == 'rotary') return 'roundabout';
    if (type == 'merge') return 'merge';
    if (type == 'depart') return 'depart';
    if (type == 'arrive') return 'arrive';
    return 'straight';
  }
}
