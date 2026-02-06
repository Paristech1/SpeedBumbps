import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../data/repositories/geolocator_location_repository.dart';
import '../../domain/repositories/location_repository.dart';
import '../state/map_state.dart';

final locationRepositoryProvider = Provider<LocationRepository>((ref) {
  return GeolocatorLocationRepository();
});

final locationStreamProvider = StreamProvider.autoDispose<MapState>((ref) async* {
  final repository = ref.read(locationRepositoryProvider);

  final serviceEnabled = await repository.isLocationServiceEnabled();
  if (!serviceEnabled) {
    yield const MapState.serviceDisabled();
    return;
  }

  final hasPermission = await repository.requestPermission();
  if (!hasPermission) {
    yield const MapState.noPermission();
    return;
  }

  yield const MapState.loading();

  try {
    await for (final location in repository.watchLocationUpdates()) {
      yield MapState.success(location);
    }
  } catch (e, _) {
    yield MapState.error(e.toString());
  }
});
