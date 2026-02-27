import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

class GeocodingResult {
  final String displayName;
  final String shortName;
  final LatLng location;

  const GeocodingResult({
    required this.displayName,
    required this.shortName,
    required this.location,
  });
}

class NominatimGeocodingApi {
  static const String _baseUrl = 'https://nominatim.openstreetmap.org';
  static const _phillyBounds = '39.87,-75.28,40.14,-74.96';

  Future<List<GeocodingResult>> search(String query) async {
    if (query.trim().length < 2) return const [];

    final uri = Uri.parse('$_baseUrl/search').replace(
      queryParameters: {
        'q': '$query, Philadelphia, PA',
        'format': 'json',
        'addressdetails': '1',
        'limit': '5',
        'viewbox': _phillyBounds,
        'bounded': '1',
      },
    );

    final response = await http.get(uri, headers: {
      'User-Agent': 'SpeedBumpApp/1.0 (contact@speedbumpapp.com)',
    });

    if (response.statusCode != 200) return const [];

    final results = jsonDecode(response.body) as List<dynamic>;
    return results.map<GeocodingResult>((item) {
      final map = item as Map<String, dynamic>;
      final lat = double.parse(map['lat'] as String);
      final lon = double.parse(map['lon'] as String);
      final display = map['display_name'] as String? ?? '';
      final address = map['address'] as Map<String, dynamic>?;
      final road = address?['road'] as String?;
      final houseNumber = address?['house_number'] as String?;
      final neighbourhood = address?['neighbourhood'] as String?;

      String short;
      if (road != null) {
        short = houseNumber != null ? '$houseNumber $road' : road;
        if (neighbourhood != null) short = '$short, $neighbourhood';
      } else {
        final parts = display.split(',');
        short = parts.length >= 2
            ? '${parts[0].trim()}, ${parts[1].trim()}'
            : parts.first.trim();
      }

      return GeocodingResult(
        displayName: display,
        shortName: short,
        location: LatLng(lat, lon),
      );
    }).toList();
  }
}
