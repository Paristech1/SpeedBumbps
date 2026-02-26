import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Holds the [MapController] so the map screen can animate the camera.
final mapControllerProvider = StateProvider<MapController?>((ref) => null);
