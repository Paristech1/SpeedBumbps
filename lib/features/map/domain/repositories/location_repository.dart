import '../entities/user_location.dart';

/// Abstract location contract — no platform or Flutter imports.
abstract class LocationRepository {
  /// Single location snapshot.
  Future<UserLocation> getCurrentLocation();

  /// Stream of location updates (e.g. every 10 m).
  Stream<UserLocation> watchLocationUpdates();

  /// Whether device location/GPS is enabled.
  Future<bool> isLocationServiceEnabled();

  /// Request location permission; returns true if granted.
  Future<bool> requestPermission();
}
