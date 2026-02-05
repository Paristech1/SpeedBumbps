/// API keys and configuration. Do not commit real keys to version control.
/// Use environment variables or secure storage in CI/production.
class ApiConstants {
  ApiConstants._();

  /// Google Directions API key for route calculation.
  /// Set via environment variable or replace at build time.
  static const String googleDirectionsApiKey = String.fromEnvironment(
    'GOOGLE_DIRECTIONS_API_KEY',
    defaultValue: '',
  );
}
