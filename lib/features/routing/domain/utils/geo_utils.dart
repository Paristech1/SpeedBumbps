import 'dart:math' show asin, cos, sin, sqrt;

import 'package:latlong2/latlong.dart';

/// Minimum distance in meters from [point] to any segment of the polyline.
double distanceFromPointToPolyline(LatLng point, List<LatLng> polylinePoints) {
  if (polylinePoints.isEmpty) return double.infinity;
  if (polylinePoints.length == 1) return _haversine(point, polylinePoints.first);

  double minDist = double.infinity;
  for (int i = 0; i < polylinePoints.length - 1; i++) {
    final d = _distanceToSegment(
      point,
      polylinePoints[i],
      polylinePoints[i + 1],
    );
    if (d < minDist) minDist = d;
  }
  return minDist;
}

double _haversine(LatLng p1, LatLng p2) {
  const r = 6371000.0;
  final lat1 = p1.latitude * pi / 180;
  final lat2 = p2.latitude * pi / 180;
  final dLat = (p2.latitude - p1.latitude) * pi / 180;
  final dLon = (p2.longitude - p1.longitude) * pi / 180;
  final a = sin(dLat / 2) * sin(dLat / 2) +
      cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2);
  final c = 2 * asin(sqrt(a));
  return r * c;
}

double _distanceToSegment(LatLng point, LatLng lineStart, LatLng lineEnd) {
  final dx = lineEnd.longitude - lineStart.longitude;
  final dy = lineEnd.latitude - lineStart.latitude;
  final lenSq = dx * dx + dy * dy;
  if (lenSq == 0) return _haversine(point, lineStart);
  var t = ((point.longitude - lineStart.longitude) * dx +
          (point.latitude - lineStart.latitude) * dy) /
      lenSq;
  t = t.clamp(0.0, 1.0);
  final closest = LatLng(
    lineStart.latitude + t * dy,
    lineStart.longitude + t * dx,
  );
  return _haversine(point, closest);
}

/// Geographic point at ~half the path length along [points] (for map labels).
LatLng? midpointAlongPolyline(List<LatLng> points) {
  if (points.isEmpty) return null;
  if (points.length == 1) return points.first;
  var total = 0.0;
  final segLens = <double>[];
  for (var i = 0; i < points.length - 1; i++) {
    final d = _haversine(points[i], points[i + 1]);
    segLens.add(d);
    total += d;
  }
  if (total <= 0) return points[points.length ~/ 2];
  var target = total / 2;
  for (var i = 0; i < segLens.length; i++) {
    final len = segLens[i];
    if (target <= len) {
      final t = len == 0 ? 0.0 : target / len;
      final a = points[i];
      final b = points[i + 1];
      return LatLng(
        a.latitude + t * (b.latitude - a.latitude),
        a.longitude + t * (b.longitude - a.longitude),
      );
    }
    target -= len;
  }
  return points.last;
}
