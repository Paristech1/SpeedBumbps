import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// Holds the [GoogleMapController] so the map screen can animate the camera.
final mapControllerProvider =
    StateProvider<GoogleMapController?>((ref) => null);
