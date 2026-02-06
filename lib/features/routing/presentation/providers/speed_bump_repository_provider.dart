import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/speed_bump.dart';
import '../../domain/repositories/speed_bump_repository.dart';
import '../../data/repositories/asset_speed_bump_repository.dart';

final speedBumpRepositoryProvider = Provider<SpeedBumpRepository>((ref) {
  return AssetSpeedBumpRepository();
});

final speedBumpsProvider = FutureProvider<List<SpeedBump>>((ref) async {
  final repo = ref.watch(speedBumpRepositoryProvider);
  return repo.getAllBumps();
});
