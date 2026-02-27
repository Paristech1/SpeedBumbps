/// Map configuration: zoom levels, default camera position, map styling.
class MapConstants {
  MapConstants._();

  /// Default zoom when no user location (e.g. Bala Cynwyd, PA).
  static const double defaultZoom = 15.0;

  /// Default latitude (Bala Cynwyd, PA).
  static const double defaultLat = 40.0094;

  /// Default longitude (Bala Cynwyd, PA).
  static const double defaultLng = -75.2194;

  /// Zoom level when centering on user location.
  static const double userLocationZoom = 15.0;

  /// Camera animation duration in milliseconds.
  static const int cameraAnimationMs = 800;

  /// Dark-mode Google Maps style JSON.
  static const String darkMapStyle = '''
[
  {"elementType":"geometry","stylers":[{"color":"#0d1117"}]},
  {"elementType":"labels.text.fill","stylers":[{"color":"#8b949e"}]},
  {"elementType":"labels.text.stroke","stylers":[{"color":"#0d1117"}]},
  {"featureType":"administrative","elementType":"geometry.stroke","stylers":[{"color":"#21262d"}]},
  {"featureType":"administrative.land_parcel","elementType":"labels.text.fill","stylers":[{"color":"#6e7681"}]},
  {"featureType":"landscape","elementType":"geometry","stylers":[{"color":"#161b22"}]},
  {"featureType":"poi","elementType":"geometry","stylers":[{"color":"#1f2937"}]},
  {"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#6e7681"}]},
  {"featureType":"poi.park","elementType":"geometry.fill","stylers":[{"color":"#0d2818"}]},
  {"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#3fb950"}]},
  {"featureType":"road","elementType":"geometry","stylers":[{"color":"#21262d"}]},
  {"featureType":"road","elementType":"geometry.stroke","stylers":[{"color":"#30363d"}]},
  {"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#8b949e"}]},
  {"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#30363d"}]},
  {"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#484f58"}]},
  {"featureType":"transit","elementType":"geometry","stylers":[{"color":"#21262d"}]},
  {"featureType":"transit.station","elementType":"labels.text.fill","stylers":[{"color":"#8b949e"}]},
  {"featureType":"water","elementType":"geometry","stylers":[{"color":"#040d21"}]},
  {"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#388bfd"}]}
]
''';
}
