import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/route.dart';
import '../state/routing_state.dart';
import 'routing_provider.dart';

/// Index of selected route: 0 = primary (fastest), 1 = alternative (bump-free).
final selectedRouteIndexProvider = StateProvider<int>((ref) => 0);

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
