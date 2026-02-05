import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../domain/usecases/calculate_route_with_bump_avoidance.dart';
import 'routing_repository_provider.dart';
import 'speed_bump_repository_provider.dart';
import '../state/routing_state.dart';

final calculateRouteWithBumpAvoidanceProvider =
    Provider<CalculateRouteWithBumpAvoidance>((ref) {
  return CalculateRouteWithBumpAvoidance(
    routingRepo: ref.watch(routingRepositoryProvider),
    bumpRepo: ref.watch(speedBumpRepositoryProvider),
  );
});

const _cacheTtlMinutes = 15;

class RoutingNotifier extends StateNotifier<RoutingState> {
  RoutingNotifier(this._useCase) : super(const RoutingState.initial());

  final CalculateRouteWithBumpAvoidance _useCase;
  final Map<String, _CachedResult> _cache = {};

  static String _cacheKey(LatLng origin, LatLng destination) {
    return '${origin.latitude},${origin.longitude}-'
        '${destination.latitude},${destination.longitude}';
  }

  Future<void> calculateRoute({
    required LatLng origin,
    required LatLng destination,
  }) async {
    final key = _cacheKey(origin, destination);
    final cached = _cache[key];
    if (cached != null &&
        DateTime.now().difference(cached.timestamp).inMinutes < _cacheTtlMinutes) {
      state = RoutingState.success(cached.result);
      return;
    }

    state = const RoutingState.loading();
    try {
      final result = await _useCase.execute(
        origin: origin,
        destination: destination,
      );
      _cache[key] = _CachedResult(result: result, timestamp: DateTime.now());
      state = RoutingState.success(result);
    } catch (e, _) {
      state = RoutingState.error(e.toString());
    }
  }

  void clear() {
    state = const RoutingState.initial();
  }
}

class _CachedResult {
  _CachedResult({required this.result, required this.timestamp});
  final RouteCalculationResult result;
  final DateTime timestamp;
}

final routingProvider =
    StateNotifierProvider<RoutingNotifier, RoutingState>((ref) {
  return RoutingNotifier(ref.watch(calculateRouteWithBumpAvoidanceProvider));
});
