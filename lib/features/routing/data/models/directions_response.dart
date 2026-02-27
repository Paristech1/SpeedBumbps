/// Parsed Google Directions API (JSON) response.
/// Structure matches https://developers.google.com/maps/documentation/directions
class DirectionsResponse {
  final String status;
  final List<RouteDto> routes;

  const DirectionsResponse({
    required this.status,
    required this.routes,
  });

  factory DirectionsResponse.fromJson(Map<String, dynamic> json) {
    final status = json['status'] as String? ?? '';
    if (status != 'OK' && status != 'ZERO_RESULTS') {
      throw DirectionsException('Directions API status: $status');
    }
    final routesList = json['routes'] as List<dynamic>? ?? [];
    final routes = routesList
        .map((e) => RouteDto.fromJson(e as Map<String, dynamic>))
        .toList();
    return DirectionsResponse(status: status, routes: routes);
  }
}

class RouteDto {
  final List<LegDto> legs;
  final String? overviewPolylinePoints;

  const RouteDto({
    required this.legs,
    this.overviewPolylinePoints,
  });

  factory RouteDto.fromJson(Map<String, dynamic> json) {
    final legsList = json['legs'] as List<dynamic>? ?? [];
    final legs = legsList
        .map((e) => LegDto.fromJson(e as Map<String, dynamic>))
        .toList();
    final overview = json['overview_polyline'] as Map<String, dynamic>?;
    final overviewPolylinePoints =
        overview?['points'] as String?;
    return RouteDto(legs: legs, overviewPolylinePoints: overviewPolylinePoints);
  }
}

class LegDto {
  final List<StepDto> steps;
  final ValueDto distance;
  final ValueDto duration;

  const LegDto({
    required this.steps,
    required this.distance,
    required this.duration,
  });

  factory LegDto.fromJson(Map<String, dynamic> json) {
    final stepsList = json['steps'] as List<dynamic>? ?? [];
    final steps = stepsList
        .map((e) => StepDto.fromJson(e as Map<String, dynamic>))
        .toList();
    final distance = ValueDto.fromJson(
      (json['distance'] as Map<String, dynamic>?) ?? {},
    );
    final duration = ValueDto.fromJson(
      (json['duration'] as Map<String, dynamic>?) ?? {},
    );
    return LegDto(steps: steps, distance: distance, duration: duration);
  }
}

class StepDto {
  final String htmlInstruction;
  final ValueDto distance;
  final ValueDto duration;
  final LatLngDto startLocation;
  final LatLngDto endLocation;
  final String? maneuver;

  const StepDto({
    required this.htmlInstruction,
    required this.distance,
    required this.duration,
    required this.startLocation,
    required this.endLocation,
    this.maneuver,
  });

  factory StepDto.fromJson(Map<String, dynamic> json) {
    final html = json['html_instructions'] as String? ?? '';
    final distance = ValueDto.fromJson(
      (json['distance'] as Map<String, dynamic>?) ?? {},
    );
    final duration = ValueDto.fromJson(
      (json['duration'] as Map<String, dynamic>?) ?? {},
    );
    final start = (json['start_location'] as Map<String, dynamic>?) ?? {};
    final end = (json['end_location'] as Map<String, dynamic>?) ?? {};
    final maneuver = json['maneuver'] as String?;
    return StepDto(
      htmlInstruction: html,
      distance: distance,
      duration: duration,
      startLocation: LatLngDto.fromJson(start),
      endLocation: LatLngDto.fromJson(end),
      maneuver: maneuver,
    );
  }
}

class ValueDto {
  final int value;
  final String text;

  const ValueDto({required this.value, required this.text});

  factory ValueDto.fromJson(Map<String, dynamic> json) {
    return ValueDto(
      value: (json['value'] as num?)?.toInt() ?? 0,
      text: json['text'] as String? ?? '',
    );
  }
}

class LatLngDto {
  final double lat;
  final double lng;

  const LatLngDto({required this.lat, required this.lng});

  factory LatLngDto.fromJson(Map<String, dynamic> json) {
    return LatLngDto(
      lat: (json['lat'] as num?)?.toDouble() ?? 0.0,
      lng: (json['lng'] as num?)?.toDouble() ?? 0.0,
    );
  }
}

class DirectionsException implements Exception {
  final String message;
  DirectionsException(this.message);
  @override
  String toString() => 'DirectionsException: $message';
}
