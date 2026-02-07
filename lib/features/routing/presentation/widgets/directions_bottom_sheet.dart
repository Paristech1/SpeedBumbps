import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../domain/entities/route.dart';
import '../../domain/entities/route_preferences.dart';
import '../../domain/entities/route_step.dart';
import '../providers/route_options_provider.dart';

class DirectionsBottomSheet extends ConsumerWidget {
  const DirectionsBottomSheet({
    super.key,
    required this.route,
    this.onClose,
  });

  final AppRoute route;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final avoidanceProfile = ref.watch(routeAvoidanceProfileProvider);
    return DraggableScrollableSheet(
      initialChildSize: 0.4,
      minChildSize: 0.2,
      maxChildSize: 0.9,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            boxShadow: [
              BoxShadow(
                color: Colors.black26,
                blurRadius: 10,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: Column(
            children: [
              Container(
                margin: const EdgeInsets.symmetric(vertical: 8),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          route.durationFormatted,
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                        ),
                        Text(
                          route.distanceFormatted,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                                color: Colors.grey[600],
                              ),
                        ),
                      ],
                    ),
                    if (route.speedBumpCount > 0)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.orange[100],
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.warning_amber_rounded,
                              size: 16,
                              color: Colors.orange[900],
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '${route.speedBumpCount} bumps',
                              style: TextStyle(
                                color: Colors.orange[900],
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                    if (route.isSpeedBumpFree)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: Colors.green[100],
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Icon(
                              Icons.check_circle,
                              size: 16,
                              color: Colors.green[900],
                            ),
                            const SizedBox(width: 4),
                            Text(
                              'Bump-free',
                              style: TextStyle(
                                color: Colors.green[900],
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: _PreferencesSection(
                  avoidanceProfile: avoidanceProfile,
                  onModeSelected: (mode) => ref
                      .read(routePreferenceModeProvider.notifier)
                      .state = mode,
                  onVehicleSelected: (vehicle) => ref
                      .read(vehicleProfileProvider.notifier)
                      .state = vehicle,
                ),
              ),
              const Divider(height: 1),
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  itemCount: route.steps.length,
                  itemBuilder: (context, index) {
                    final step = route.steps[index];
                    return _StepTile(step: step);
                  },
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _StepTile extends StatelessWidget {
  const _StepTile({required this.step});

  final RouteStep step;

  @override
  Widget build(BuildContext context) {
    final miles = step.distanceMeters * 0.000621371;
    return ListTile(
      leading: Icon(step.maneuverIcon, color: Colors.blue),
      title: Text(
        step.instruction,
        style: const TextStyle(fontSize: 14),
      ),
      subtitle: Text(
        '${miles.toStringAsFixed(1)} mi',
        style: TextStyle(fontSize: 12, color: Colors.grey[600]),
      ),
    );
  }
}

class _PreferencesSection extends StatelessWidget {
  const _PreferencesSection({
    required this.avoidanceProfile,
    required this.onModeSelected,
    required this.onVehicleSelected,
  });

  final RouteAvoidanceProfile avoidanceProfile;
  final ValueChanged<RoutePreferenceMode> onModeSelected;
  final ValueChanged<VehicleProfile> onVehicleSelected;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Route preferences',
          style: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: RoutePreferenceMode.values.map((mode) {
            return ChoiceChip(
              label: Text(_modeLabel(mode)),
              selected: avoidanceProfile.mode == mode,
              onSelected: (_) => onModeSelected(mode),
            );
          }).toList(),
        ),
        const SizedBox(height: 12),
        Text(
          'Vehicle profile',
          style: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          children: VehicleProfile.values.map((vehicle) {
            return ChoiceChip(
              label: Text(_vehicleLabel(vehicle)),
              selected: avoidanceProfile.vehicle == vehicle,
              onSelected: (_) => onVehicleSelected(vehicle),
            );
          }).toList(),
        ),
        const SizedBox(height: 8),
        Text(
          'Avoiding bumps rated ${avoidanceProfile.minSeverityToAvoid}+',
          style: textTheme.bodySmall?.copyWith(color: Colors.grey[600]),
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  String _modeLabel(RoutePreferenceMode mode) {
    return switch (mode) {
      RoutePreferenceMode.smoothRide => 'Smooth',
      RoutePreferenceMode.cargoConscious => 'Cargo',
      RoutePreferenceMode.fast => 'Fast',
    };
  }

  String _vehicleLabel(VehicleProfile vehicle) {
    return switch (vehicle) {
      VehicleProfile.sedan => 'Sedan',
      VehicleProfile.suv => 'SUV',
      VehicleProfile.loweredCar => 'Lowered',
      VehicleProfile.motorcycle => 'Motorcycle',
      VehicleProfile.bicycle => 'Bicycle',
    };
  }
}
