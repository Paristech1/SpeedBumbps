import 'dart:io';

import 'package:image/image.dart' as img;
import 'package:path_provider/path_provider.dart';

/// Compresses images for submission (max 2MB, max 1920x1080).
class ImageCompressor {
  static const int maxBytes = 2 * 1024 * 1024;
  static const int maxWidth = 1920;
  static const int maxHeight = 1080;

  /// Compresses image to max 2MB and resizes to max 1920x1080.
  static Future<File> compress(File imageFile) async {
    try {
      final bytes = await imageFile.readAsBytes();
      img.Image? image = img.decodeImage(bytes);
      if (image == null) throw Exception('Failed to decode image');

      if (image.width > maxWidth || image.height > maxHeight) {
        image = img.copyResize(
          image,
          width: image.width > maxWidth ? maxWidth : null,
          height: image.height > maxHeight ? maxHeight : null,
        );
      }

      List<int> compressedBytes = img.encodeJpg(image, quality: 85);
      if (compressedBytes.length > maxBytes) {
        compressedBytes = img.encodeJpg(image, quality: 70);
      }
      if (compressedBytes.length > maxBytes) {
        throw Exception('Image is too large after compression (max 2MB).');
      }
      return _saveToTempFile(compressedBytes);
    } catch (e) {
      final size = await imageFile.length();
      if (size > maxBytes) {
        throw Exception('Image is too large (max 2MB).');
      }
      return imageFile;
    }
  }

  static Future<File> _saveToTempFile(List<int> bytes) async {
    final tempDir = await getTemporaryDirectory();
    final tempFile = File(
      '${tempDir.path}/compressed_${DateTime.now().millisecondsSinceEpoch}.jpg',
    );
    await tempFile.writeAsBytes(bytes);
    return tempFile;
  }
}
