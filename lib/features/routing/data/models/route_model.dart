import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../domain/entities/route.dart' as domain;
import '../../domain/entities/route_step.dart';
import 'directions_response.dart';

/// Maps Directions API response to domain [AppRoute] and [RouteStep].
class RouteModel {
  /// Builds a single [domain.AppRoute] from the first route in [response],
  /// using [polylinePoints] (decoded from overview_polyline).
  static domain.AppRoute toAppRoute({
    required DirectionsResponse response,
    required List<LatLng> polylinePoints,
    String? routeId,
    int speedBumpCount = 0,
    bool isSpeedBumpFree = true,
  }) {
    if (response.routes.isEmpty) {
      throw DirectionsException('No routes in response');
    }
    final routeDto = response.routes.first;
    final legs = routeDto.legs;
    num totalDistance = 0;
    num totalDuration = 0;
    final allSteps = <RouteStep>[];

    for (final leg in legs) {
      totalDistance += leg.distance.value;
      totalDuration += leg.duration.value;
      for (final stepDto in leg.steps) {
        allSteps.add(_stepFromDto(stepDto));
      }
    }

    final id = routeId ?? 'route_${DateTime.now().millisecondsSinceEpoch}';
    return domain.AppRoute(
      id: id,
      polylinePoints: polylinePoints,
      steps: allSteps,
      distanceMeters: totalDistance.toDouble(),
      durationSeconds: totalDuration.toInt(),
      speedBumpCount: speedBumpCount,
      isSpeedBumpFree: isSpeedBumpFree,
      calculatedAt: DateTime.now(),
    );
  }

  static RouteStep _stepFromDto(StepDto dto) {
    final instruction = _stripHtml(dto.htmlInstruction);
    final maneuver = dto.maneuver ?? 'straight';
    return RouteStep(
      instruction: instruction,
      distanceMeters: dto.distance.value.toDouble(),
      durationSeconds: dto.duration.value,
      startLocation: LatLng(dto.startLocation.lat, dto.startLocation.lng),
      endLocation: LatLng(dto.endLocation.lat, dto.endLocation.lng),
      maneuver: maneuver,
    );
  }

  static String _stripHtml(String html) {
    return html
        .replaceAll(RegExp(r'<[^>]*>'), '')
        .replaceAll('&nbsp;', ' ')
        .replaceAll(RegExp(r'&\w+;'), '')
        .trim();
  }
}
