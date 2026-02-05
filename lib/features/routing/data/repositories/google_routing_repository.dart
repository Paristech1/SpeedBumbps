import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../domain/entities/route.dart';
import '../../domain/repositories/routing_repository.dart';
import '../datasources/google_directions_api.dart';
import '../models/directions_response.dart';
import '../models/route_model.dart';

class GoogleRoutingRepository implements RoutingRepository {
  GoogleRoutingRepository({GoogleDirectionsAPI? api})
      : _api = api ?? GoogleDirectionsAPI();

  final GoogleDirectionsAPI _api;

  @override
  Future<AppRoute> calculateRoute({
    required LatLng origin,
    required LatLng destination,
    List<LatLng>? waypoints,
  }) async {
    final response = await _api.getDirections(
      origin: origin,
      destination: destination,
      waypoints: waypoints,
      alternatives: false,
    );

    if (response.routes.isEmpty) {
      throw DirectionsException('No routes returned');
    }

    final routeDto = response.routes.first;
    final encoded = routeDto.overviewPolylinePoints ?? '';
    final polylinePoints = encoded.isEmpty ? <LatLng>[] : _api.decodePolyline(encoded);

    return RouteModel.toAppRoute(
      response: response,
      polylinePoints: polylinePoints,
      speedBumpCount: 0,
      isSpeedBumpFree: true,
    );
  }
}
