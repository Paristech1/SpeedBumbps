import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

/// OSRM (Open Source Routing Machine) - free, no API key required.
/// Uses public demo: https://router.project-osrm.org
class OsrmDirectionsAPI {
  static const String _baseUrl = 'https://router.project-osrm.org/route/v1/driving';

  /// Fetches route from origin to destination.
  /// [waypoints] are optional intermediate points (e.g. for speed bump avoidance).
  Future<OsrmRouteResult> getRoute({
    required LatLng origin,
    required LatLng destination,
    List<LatLng>? waypoints,
  }) async {
    final coords = <String>[];
    coords.add('${origin.longitude},${origin.latitude}');
    if (waypoints != null && waypoints.isNotEmpty) {
      for (final wp in waypoints) {
        coords.add('${wp.longitude},${wp.latitude}');
      }
    }
    coords.add('${destination.longitude},${destination.latitude}');

    final path = coords.join(';');
    final uri = Uri.parse('$_baseUrl/$path').replace(
      queryParameters: {'overview': 'full', 'geometries': 'polyline', 'steps': 'true'},
    );

    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw DirectionsException('OSRM request failed: ${response.statusCode}');
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    final code = json['code'] as String? ?? '';
    if (code != 'Ok') {
      throw DirectionsException('OSRM error: $code');
    }

    final routes = json['routes'] as List<dynamic>? ?? [];
    if (routes.isEmpty) {
      throw DirectionsException('No routes returned');
    }

    final route = routes.first as Map<String, dynamic>;
    final geometry = route['geometry'] as String? ?? '';
    final distance = (route['distance'] as num?)?.toDouble() ?? 0.0;
    final duration = (route['duration'] as num?)?.toDouble() ?? 0.0;
    final legs = route['legs'] as List<dynamic>? ?? [];

    final polylinePoints = geometry.isEmpty ? <LatLng>[] : decodePolyline(geometry);

    final steps = <OsrmStep>[];
    for (final leg in legs) {
      final legMap = leg as Map<String, dynamic>;
      final legSteps = legMap['steps'] as List<dynamic>? ?? [];
      for (final s in legSteps) {
        final stepMap = s as Map<String, dynamic>;
        final maneuver = stepMap['maneuver'] as Map<String, dynamic>? ?? {};
        final instruction = maneuver['instruction'] as String? ?? 'Continue';
        final stepDistance = (stepMap['distance'] as num?)?.toDouble() ?? 0.0;
        final stepDuration = (stepMap['duration'] as num?)?.toDouble() ?? 0.0;
        final loc = stepMap['location'] as List<dynamic>?;
        final lon = (loc?.isNotEmpty == true ? loc![0] : 0.0) as num;
        final lat = (loc != null && loc.length > 1 ? loc[1] : 0.0) as num;
        steps.add(OsrmStep(
          instruction: instruction,
          distanceMeters: stepDistance,
          durationSeconds: stepDuration.toInt(),
          location: LatLng(lat.toDouble(), lon.toDouble()),
        ));
      }
    }

    if (steps.isEmpty && polylinePoints.length >= 2) {
      steps.add(OsrmStep(
        instruction: 'Head to destination',
        distanceMeters: distance,
        durationSeconds: duration.toInt(),
        location: polylinePoints.last,
      ));
    }

    return OsrmRouteResult(
      polylinePoints: polylinePoints,
      distanceMeters: distance,
      durationSeconds: duration.toInt(),
      steps: steps,
    );
  }

  /// Decodes encoded polyline (same algorithm as Google).
  List<LatLng> decodePolyline(String encoded) {
    final points = <LatLng>[];
    int index = 0;
    final len = encoded.length;
    int lat = 0;
    int lng = 0;

    while (index < len) {
      int b;
      int shift = 0;
      int result = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      final dlat = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      final dlng = (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      lng += dlng;

      points.add(LatLng(lat / 1e5, lng / 1e5));
    }

    return points;
  }
}

class OsrmRouteResult {
  final List<LatLng> polylinePoints;
  final double distanceMeters;
  final int durationSeconds;
  final List<OsrmStep> steps;

  OsrmRouteResult({
    required this.polylinePoints,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.steps,
  });
}

class OsrmStep {
  final String instruction;
  final double distanceMeters;
  final int durationSeconds;
  final LatLng location;

  OsrmStep({
    required this.instruction,
    required this.distanceMeters,
    required this.durationSeconds,
    required this.location,
  });
}

class DirectionsException implements Exception {
  final String message;
  DirectionsException(this.message);
  @override
  String toString() => 'DirectionsException: $message';
}
