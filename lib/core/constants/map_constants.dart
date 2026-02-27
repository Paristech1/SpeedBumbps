/// Map configuration: zoom levels, default camera position.
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
}
