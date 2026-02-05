/// Represents the user's GPS coordinates.
class UserLocation {
  final double latitude;
  final double longitude;
  final double accuracy; // in meters
  final DateTime timestamp;

  const UserLocation({
    required this.latitude,
    required this.longitude,
    required this.accuracy,
    required this.timestamp,
  });

  /// True if accuracy is good enough for speed bump detection (<= 20 m).
  bool get isHighAccuracy => accuracy <= 20.0;
}
