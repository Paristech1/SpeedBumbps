import 'package:flutter_test/flutter_test.dart';
import 'package:speed_bump_app/features/map/domain/entities/user_location.dart';

void main() {
  group('UserLocation', () {
    test('isHighAccuracy returns true when accuracy <= 20m', () {
      final location = UserLocation(
        latitude: 40.0,
        longitude: -75.0,
        accuracy: 15.0,
        timestamp: DateTime.now(),
      );
      expect(location.isHighAccuracy, isTrue);
    });

    test('isHighAccuracy returns true when accuracy equals 20m', () {
      final location = UserLocation(
        latitude: 40.0,
        longitude: -75.0,
        accuracy: 20.0,
        timestamp: DateTime.now(),
      );
      expect(location.isHighAccuracy, isTrue);
    });

    test('isHighAccuracy returns false when accuracy > 20m', () {
      final location = UserLocation(
        latitude: 40.0,
        longitude: -75.0,
        accuracy: 25.0,
        timestamp: DateTime.now(),
      );
      expect(location.isHighAccuracy, isFalse);
    });
  });
}
