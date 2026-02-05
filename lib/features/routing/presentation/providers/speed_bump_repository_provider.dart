import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/repositories/speed_bump_repository.dart';
import '../../data/repositories/local_speed_bump_repository.dart';

final speedBumpRepositoryProvider = Provider<SpeedBumpRepository>((ref) {
  return LocalSpeedBumpRepository();
});
