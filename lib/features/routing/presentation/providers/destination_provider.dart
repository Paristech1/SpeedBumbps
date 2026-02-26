import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

/// User-selected destination (e.g. from map tap). Null when not set.
final destinationProvider = StateProvider<LatLng?>((ref) => null);
