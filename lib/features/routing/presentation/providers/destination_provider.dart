import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

/// User-selected destination (e.g. from map tap). Null when not set.
final destinationProvider = StateProvider<LatLng?>((ref) => null);
