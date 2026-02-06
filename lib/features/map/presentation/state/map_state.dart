import 'package:freezed_annotation/freezed_annotation.dart';

import '../../domain/entities/user_location.dart';

part 'map_state.freezed.dart';

@freezed
class MapState with _$MapState {
  const factory MapState.initial() = _Initial;
  const factory MapState.loading() = _Loading;
  const factory MapState.success(UserLocation location) = _Success;
  const factory MapState.noPermission() = _NoPermission;
  const factory MapState.serviceDisabled() = _ServiceDisabled;
  const factory MapState.error(String message) = _Error;
}
