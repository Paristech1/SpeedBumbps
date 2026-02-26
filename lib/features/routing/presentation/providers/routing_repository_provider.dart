import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/repositories/routing_repository.dart';
import '../../data/repositories/osrm_routing_repository.dart';

final routingRepositoryProvider = Provider<RoutingRepository>((ref) {
  return OsrmRoutingRepository();
});
