import 'dart:io';

import 'package:exif/exif.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Extracts GPS and timestamp from image EXIF metadata.
class ExifExtractor {
  /// Extracts GPS coordinates from image file.
  /// Returns null if no GPS data found in EXIF.
  static Future<LatLng?> extractLocation(File imageFile) async {
    try {
      final bytes = await imageFile.readAsBytes();
      final data = await readExifFromBytes(bytes);

      if (data.isEmpty) return null;

      final gpsLatitude = data['GPS GPSLatitude'];
      final gpsLatitudeRef = data['GPS GPSLatitudeRef'];
      final gpsLongitude = data['GPS GPSLongitude'];
      final gpsLongitudeRef = data['GPS GPSLongitudeRef'];

      if (gpsLatitude == null || gpsLongitude == null) return null;

<<<<<<< HEAD
      final latValues = gpsLatitude.values;
      final lngValues = gpsLongitude.values;
      if (latValues is! IfdRatios || lngValues is! IfdRatios) return null;

      final latRatios = latValues.ratios;
      final lngRatios = lngValues.ratios;
      if (latRatios.length < 3 || lngRatios.length < 3) return null;

      double lat = _convertToDecimal(latRatios);
      double lng = _convertToDecimal(lngRatios);
=======
      final latRatios = gpsLatitude!.values is IfdRatios
          ? (gpsLatitude!.values as IfdRatios).ratios
          : null;
      final lngRatios = gpsLongitude!.values is IfdRatios
          ? (gpsLongitude!.values as IfdRatios).ratios
          : null;
      if (latRatios == null ||
          lngRatios == null ||
          latRatios.length < 3 ||
          lngRatios.length < 3) return null;

      double lat = _convertToDecimal(latRatios);
      double lng = _convertToDecimal(lngRatios);
>>>>>>> 7ae70b6 (Document setup and iOS target)

      if (gpsLatitudeRef?.printable == 'S') lat = -lat;
      if (gpsLongitudeRef?.printable == 'W') lng = -lng;

      return LatLng(lat, lng);
    } catch (e) {
      return null;
    }
  }

  static double _convertToDecimal(List<Ratio> ratios) {
    if (ratios.length < 3) throw Exception('Invalid GPS format');
    final degrees = ratios[0].numerator / ratios[0].denominator;
    final minutes = ratios[1].numerator / ratios[1].denominator;
    final seconds = ratios[2].numerator / ratios[2].denominator;
    return degrees + (minutes / 60.0) + (seconds / 3600.0);
  }

  /// Extracts photo timestamp from EXIF.
  static Future<DateTime?> extractTimestamp(File imageFile) async {
    try {
      final bytes = await imageFile.readAsBytes();
      final data = await readExifFromBytes(bytes);
      final dateTimeOriginal = data['EXIF DateTimeOriginal'];
      final dateTime = data['Image DateTime'];
      final dateString = dateTimeOriginal?.printable ?? dateTime?.printable;
      if (dateString == null) return null;
      return _parseExifDate(dateString);
    } catch (e) {
      return null;
    }
  }

  static DateTime _parseExifDate(String exifDate) {
    final parts = exifDate.trim().split(RegExp(r'\s+'));
    final dateParts = parts[0].split(':');
    if (dateParts.length < 3) return DateTime.now();
    final year = int.tryParse(dateParts[0]) ?? DateTime.now().year;
    final month = int.tryParse(dateParts[1]) ?? 1;
    final day = int.tryParse(dateParts[2]) ?? 1;
    if (parts.length < 2) {
      return DateTime(year, month, day);
    }
    final timeParts = parts[1].split(':');
    if (timeParts.length < 3) return DateTime(year, month, day);
    final hour = int.tryParse(timeParts[0]) ?? 0;
    final minute = int.tryParse(timeParts[1]) ?? 0;
    final second = int.tryParse(timeParts[2]) ?? 0;
    return DateTime(year, month, day, hour, minute, second);
  }
}
