import 'package:geolocator/geolocator.dart';

import '../../domain/entities/user_location.dart';
import '../../domain/repositories/location_repository.dart';

/// [LocationRepository] implementation using the Geolocator plugin.
class GeolocatorLocationRepository implements LocationRepository {
  @override
  Future<UserLocation> getCurrentLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw LocationServiceDisabledException();
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        throw LocationPermissionDeniedException();
      }
    }
    if (permission == LocationPermission.deniedForever) {
      throw LocationPermissionDeniedException();
    }

    final position = await Geolocator.getCurrentPosition();
    return _positionToUserLocation(position);
  }

  @override
  Stream<UserLocation> watchLocationUpdates() {
    const locationSettings = LocationSettings(
      accuracy: LocationAccuracy.high,
      distanceFilter: 10,
    );
    return Geolocator.getPositionStream(locationSettings: locationSettings)
        .map(_positionToUserLocation);
  }

  @override
  Future<bool> isLocationServiceEnabled() async {
    return Geolocator.isLocationServiceEnabled();
  }

  @override
  Future<bool> requestPermission() async {
    final permission = await Geolocator.requestPermission();
    return permission == LocationPermission.always ||
        permission == LocationPermission.whileInUse;
  }

  UserLocation _positionToUserLocation(Position position) {
    return UserLocation(
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      timestamp: position.timestamp,
    );
  }
}

/// Thrown when device location/GPS is disabled.
class LocationServiceDisabledException implements Exception {
  @override
  String toString() => 'Location services are disabled';
}

/// Thrown when the user has denied location permission.
class LocationPermissionDeniedException implements Exception {
  @override
  String toString() => 'Location permissions are denied';
}
