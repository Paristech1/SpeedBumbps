import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/route.dart';
import '../../domain/entities/route_preferences.dart';
import '../../domain/usecases/calculate_route_with_bump_avoidance.dart';
import 'routing_provider.dart';
import '../state/routing_state.dart';

/// Index of selected route: 0 = primary (fastest), 1 = alternative (bump-free).
final selectedRouteIndexProvider = StateProvider<int>((ref) => 0);

/// Route preference mode (Smooth Ride, Cargo-Conscious, Fast).
final routePreferenceModeProvider =
    StateProvider<RoutePreferenceMode>((ref) => RoutePreferenceMode.cargoConscious);

/// Vehicle profile selection.
final vehicleProfileProvider =
    StateProvider<VehicleProfile>((ref) => VehicleProfile.sedan);

/// Combined avoidance profile derived from preference + vehicle.
final routeAvoidanceProfileProvider = Provider<RouteAvoidanceProfile>((ref) {
  final mode = ref.watch(routePreferenceModeProvider);
  final vehicle = ref.watch(vehicleProfileProvider);
  return RouteAvoidanceProfile(mode: mode, vehicle: vehicle);
});

/// Full routing result (primary + optional alternative) when calculation succeeded.
final routeCalculationResultProvider = Provider<RouteCalculationResult?>((ref) {
  final routingState = ref.watch(routingProvider);
  return routingState.maybeWhen(
    success: (result) => result,
    orElse: () => null,
  );
});

/// The currently selected route to display (primary or alternative).
/// Only valid when [routingProvider] is success; otherwise null.
final selectedRouteProvider = Provider<AppRoute?>((ref) {
  final routingState = ref.watch(routingProvider);
  return routingState.maybeWhen(
    success: (result) {
      final index = ref.watch(selectedRouteIndexProvider);
      if (index == 1 && result.alternativeRoute != null) {
        return result.alternativeRoute;
      }
      return result.primaryRoute;
    },
    orElse: () => null,
  );
});
