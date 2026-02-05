import 'package:freezed_annotation/freezed_annotation.dart';

import '../../domain/usecases/calculate_route_with_bump_avoidance.dart';

part 'routing_state.freezed.dart';

@freezed
class RoutingState with _$RoutingState {
  const RoutingState._();
  const factory RoutingState.initial() = _Initial;
  const factory RoutingState.loading() = _Loading;
  const factory RoutingState.success(RouteCalculationResult result) = _Success;
  const factory RoutingState.error(String message) = _Error;
}
