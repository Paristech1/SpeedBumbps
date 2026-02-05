import 'dart:convert';

import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:http/http.dart' as http;

import '../../../../core/constants/api_constants.dart';
import '../models/directions_response.dart';

class GoogleDirectionsAPI {
  static const String _baseUrl =
      'https://maps.googleapis.com/maps/api/directions/json';

  /// Fetches directions from origin to destination.
  /// [waypoints] are optional intermediate points (e.g. for speed bump avoidance).
  Future<DirectionsResponse> getDirections({
    required LatLng origin,
    required LatLng destination,
    List<LatLng>? waypoints,
    bool alternatives = true,
  }) async {
    final key = ApiConstants.googleDirectionsApiKey;
    if (key.isEmpty) {
      throw DirectionsException(
        'Google Directions API key not set. Use --dart-define=GOOGLE_DIRECTIONS_API_KEY=...',
      );
    }

    final queryParams = <String, String>{
      'origin': '${origin.latitude},${origin.longitude}',
      'destination': '${destination.latitude},${destination.longitude}',
      'mode': 'driving',
      'alternatives': alternatives.toString(),
      'key': key,
    };

    if (waypoints != null && waypoints.isNotEmpty) {
      queryParams['waypoints'] = waypoints
          .map((wp) => '${wp.latitude},${wp.longitude}')
          .join('|');
    }

    final uri = Uri.parse(_baseUrl).replace(queryParameters: queryParams);
    final response = await http.get(uri);

    if (response.statusCode != 200) {
      throw DirectionsException(
        'Failed to fetch directions: ${response.statusCode}',
      );
    }

    final json = jsonDecode(response.body) as Map<String, dynamic>;
    return DirectionsResponse.fromJson(json);
  }

  /// Decodes Google's encoded polyline to a list of [LatLng].
  /// See https://developers.google.com/maps/documentation/utilities/polylinealgorithm
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