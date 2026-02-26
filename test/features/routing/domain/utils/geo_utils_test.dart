import 'package:flutter_test/flutter_test.dart';
import 'package:latlong2/latlong.dart';

import 'package:speed_bump_app/features/routing/domain/utils/geo_utils.dart';

void main() {
  group('distanceFromPointToPolyline', () {
    test('returns infinity for empty polyline', () {
      expect(
        distanceFromPointToPolyline(const LatLng(40, -75), []),
        double.infinity,
      );
    });

    test('returns distance to single point', () {
      final point = const LatLng(40.0, -75.0);
      final poly = [const LatLng(40.001, -75.0)]; // ~111 m north
      final d = distanceFromPointToPolyline(point, poly);
      expect(d, greaterThan(100));
      expect(d, lessThan(150));
    });

    test('returns perpendicular distance to segment', () {
      // Point (40.0094, -75.2194) on segment from (40.0093,-75.2193) to (40.0095,-75.2195)
      final point = const LatLng(40.0094, -75.2194);
      final poly = [
        const LatLng(40.0093, -75.2193),
        const LatLng(40.0095, -75.2195),
      ];
      final d = distanceFromPointToPolyline(point, poly);
      expect(d, lessThan(30)); // midpoint is close to segment
    });

    test('returns distance to nearest segment when multiple segments', () {
      final point = const LatLng(40.0, -75.0);
      final poly = [
        const LatLng(41.0, -76.0), // far
        const LatLng(41.0, -74.0),
        const LatLng(40.0, -75.0), // close to point
        const LatLng(40.0, -74.0),
      ];
      final d = distanceFromPointToPolyline(point, poly);
      expect(d, lessThan(100));
    });
  });
}
