import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../domain/entities/route.dart';
import '../../domain/entities/route_preferences.dart';
import '../../domain/usecases/calculate_route_with_bump_avoidance.dart';
import 'routing_provider.dart';
import '../state/routing_state.dart';

/// Index of selected route: 0 = primary (fastest), 1 = alternative (bump-free).
final selectedRouteIndexProvider = StateProvider<int>((ref) => 0);

/// Route preference mode (Smooth Ride, Cargo-Conscious, Fast).
final routePreferenceModeProvider = StateProvider<RoutePreferenceMode>(
  (ref) => RoutePreferenceMode.cargoConscious,
);

/// Vehicle profile selection.
final vehicleProfileProvider = StateProvider<VehicleProfile>(
  (ref) => VehicleProfile.sedan,
);

/// Straight-line preview shown while a confirmed route request is still loading.
final pendingRoutePreviewProvider = StateProvider<List<LatLng>?>((ref) => null);

/// Combined avoidance profile derived from preference + vehicle.
final routeAvoidanceProfileProvider = Provider<RouteAvoidanceProfile>((ref) {
  final mode = ref.watch(routePreferenceModeProvider);
  final vehicle = ref.watch(vehicleProfileProvider);
  return RouteAvoidanceProfile(mode: mode, vehicle: vehicle);
});

/// Last successfully calculated route, kept around while recalculations are in flight.
final persistedRouteCalculationResultProvider =
    Provider<RouteCalculationResult?>((ref) {
  ref.watch(routingProvider);
  return ref.read(routingProvider.notifier).lastSuccessfulResult;
});

/// Full routing result (primary + optional alternative) when calculation succeeded.
/// Falls back to the last successful route during transient loading/error states.
final routeCalculationResultProvider = Provider<RouteCalculationResult?>((ref) {
  final routingState = ref.watch(routingProvider);
  return routingState.maybeWhen(
    success: (result) => result,
    orElse: () => ref.watch(persistedRouteCalculationResultProvider),
  );
});

/// The currently selected route to display (primary or alternative).
/// Falls back to the last successful route while a recalculation is pending.
final selectedRouteProvider = Provider<AppRoute?>((ref) {
  final result = ref.watch(routeCalculationResultProvider);
  if (result == null) return null;

  final index = ref.watch(selectedRouteIndexProvider);
  if (index == 1 && result.alternativeRoute != null) {
    return result.alternativeRoute;
  }
  return result.primaryRoute;
});
