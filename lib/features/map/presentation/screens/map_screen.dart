import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

import '../../../../core/constants/map_constants.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/entities/user_location.dart';
import '../../../routing/domain/utils/geo_utils.dart';
import '../../../routing/presentation/providers/destination_provider.dart';
import '../../../routing/presentation/providers/route_options_provider.dart';
import '../../../routing/presentation/providers/routing_provider.dart';
import '../../../routing/presentation/state/routing_state.dart';
import '../../../routing/presentation/widgets/directions_bottom_sheet.dart';
import '../../../routing/presentation/widgets/route_polyline.dart';
import '../providers/location_provider.dart';
import '../providers/map_controller_provider.dart';
import '../state/map_state.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  bool _hasAnimatedToUser = false;
  bool _destinationMode = false;
  bool _hasFittedRouteBounds = false;
  DateTime? _firstDeviationTime;
  DateTime? _lastRecalcTime;
  static const double _deviationThresholdMeters = 80.0;
  static const int _deviationDelaySeconds = 5;
  static const int _recalcCooldownSeconds = 30;

  static final CameraPosition _defaultPosition = CameraPosition(
    target: LatLng(MapConstants.defaultLat, MapConstants.defaultLng),
    zoom: MapConstants.defaultZoom,
  );

  @override
  Widget build(BuildContext context) {
    ref.listen(locationStreamProvider, (prev, next) {
      final mapState = next.valueOrNull;
      if (mapState == null) return;
      mapState.maybeWhen(
        success: (location) {
          final route = ref.read(selectedRouteProvider);
          final dest = ref.read(destinationProvider);
          if (route == null || dest == null) {
            _firstDeviationTime = null;
            return;
          }
          final dist = distanceFromPointToPolyline(
            LatLng(location.latitude, location.longitude),
            route.polylinePoints,
          );
          if (dist > _deviationThresholdMeters) {
            _firstDeviationTime ??= DateTime.now();
            final now = DateTime.now();
            if (_firstDeviationTime != null &&
                now.difference(_firstDeviationTime!).inSeconds >=
                    _deviationDelaySeconds &&
                (_lastRecalcTime == null ||
                    now.difference(_lastRecalcTime!).inSeconds >=
                        _recalcCooldownSeconds)) {
              ref.read(routingProvider.notifier).calculateRoute(
                    origin: LatLng(location.latitude, location.longitude),
                    destination: dest,
                  );
              _lastRecalcTime = now;
              _firstDeviationTime = null;
            }
          } else {
            _firstDeviationTime = null;
          }
        },
        orElse: () {},
      );
    });

    final locationState = ref.watch(locationStreamProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Speed Bump'),
        actions: [
          IconButton(
            icon: const Icon(Icons.person),
            onPressed: () => Navigator.of(context).pushNamed('/profile'),
            tooltip: 'Profile',
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => Navigator.of(context).pushNamed('/camera'),
        icon: const Icon(Icons.camera_alt),
        label: const Text('Report bump'),
      ),
      body: locationState.when(
        data: (mapState) => mapState.when(
          initial: () => _buildLoadingView(),
          loading: () => _buildLoadingView(),
          success: (location) => _buildMapView(location),
          noPermission: () => _buildPermissionDeniedView(),
          serviceDisabled: () => _buildServiceDisabledView(),
          error: (message) => _buildErrorView(message),
        ),
        loading: () => _buildLoadingView(),
        error: (error, stack) => _buildErrorView(error.toString()),
      ),
    );
  }

  Widget _buildMapView(UserLocation location) {
    final selectedRoute = ref.watch(selectedRouteProvider);
    final routingState = ref.watch(routingProvider);
    final hasAlternative = routingState.maybeWhen(
      success: (r) => r.alternativeRoute != null,
      orElse: () => false,
    );
    final showAlternative = ref.watch(selectedRouteIndexProvider) == 1;

    if (!_hasAnimatedToUser) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!_hasAnimatedToUser) {
          _hasAnimatedToUser = true;
          ref.read(mapControllerProvider)?.animateCamera(
                CameraUpdate.newLatLng(
                  LatLng(location.latitude, location.longitude),
                ),
              );
        }
      });
    }

    if (selectedRoute != null && !_hasFittedRouteBounds) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_hasFittedRouteBounds) return;
        final points = selectedRoute.polylinePoints;
        if (points.length >= 2) {
          _hasFittedRouteBounds = true;
          double minLat = points.first.latitude;
          double maxLat = points.first.latitude;
          double minLng = points.first.longitude;
          double maxLng = points.first.longitude;
          for (final p in points) {
            if (p.latitude < minLat) minLat = p.latitude;
            if (p.latitude > maxLat) maxLat = p.latitude;
            if (p.longitude < minLng) minLng = p.longitude;
            if (p.longitude > maxLng) maxLng = p.longitude;
          }
          ref.read(mapControllerProvider)?.animateCamera(
                CameraUpdate.newLatLngBounds(
                  LatLngBounds(
                    southwest: LatLng(minLat, minLng),
                    northeast: LatLng(maxLat, maxLng),
                  ),
                  100,
                ),
              );
        }
      });
    }

    final origin = selectedRoute != null && selectedRoute.polylinePoints.isNotEmpty
        ? selectedRoute.polylinePoints.first
        : null;
    final destination = selectedRoute != null && selectedRoute.polylinePoints.length >= 2
        ? selectedRoute.polylinePoints.last
        : null;

    Set<Polyline> polylines = {};
    Set<Marker> markers = {};
    if (selectedRoute != null) {
      polylines = {RoutePolylineWidget.createPolyline(selectedRoute)};
      if (origin != null) {
        markers.add(
          Marker(
            markerId: const MarkerId('origin'),
            position: origin,
            icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueGreen),
          ),
        );
      }
      if (destination != null) {
        markers.add(
          Marker(
            markerId: const MarkerId('destination'),
            position: destination,
            icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueRed),
          ),
        );
      }
    }

    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: _defaultPosition,
          onMapCreated: (controller) {
            ref.read(mapControllerProvider.notifier).state = controller;
          },
          onTap: (LatLng position) {
            if (_destinationMode) {
              setState(() => _destinationMode = false);
              ref.read(destinationProvider.notifier).state = position;
              ref.read(routingProvider.notifier).calculateRoute(
                    origin: LatLng(location.latitude, location.longitude),
                    destination: position,
                  );
            }
          },
          myLocationEnabled: true,
          myLocationButtonEnabled: true,
          mapType: MapType.normal,
          zoomControlsEnabled: false,
          compassEnabled: true,
          rotateGesturesEnabled: true,
          scrollGesturesEnabled: true,
          tiltGesturesEnabled: true,
          zoomGesturesEnabled: true,
          trafficEnabled: false,
          buildingsEnabled: true,
          mapToolbarEnabled: false,
          polylines: polylines,
          markers: markers,
        ),
        if (!location.isHighAccuracy) _buildAccuracyWarning(location.accuracy),
        if (_destinationMode)
          Positioned(
            top: 80,
            left: 16,
            right: 16,
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(12),
              elevation: 4,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    const Icon(Icons.touch_app, color: Colors.blue),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        'Tap on the map to set your destination',
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        if (routingState.maybeWhen(loading: () => true, orElse: () => false))
          const Positioned(
            top: 80,
            left: 0,
            right: 0,
            child: Center(
              child: Card(
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      SizedBox(width: 16),
                      Text('Calculating route...'),
                    ],
                  ),
                ),
              ),
            ),
          ),
        if (routingState.maybeWhen(
          error: (msg) => msg.isNotEmpty,
          orElse: () => false,
        ))
          Positioned(
            top: 80,
            left: 16,
            right: 16,
            child: Material(
              color: Colors.red[50],
              borderRadius: BorderRadius.circular(12),
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Icon(Icons.error_outline, color: Colors.red[800]),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Text(
                        routingState.maybeWhen(
                          error: (m) => m,
                          orElse: () => 'Route error',
                        ),
                        style: TextStyle(color: Colors.red[900], fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        if (selectedRoute != null) ...[
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: DirectionsBottomSheet(route: selectedRoute),
          ),
          if (hasAlternative)
            Positioned(
              top: 80,
              right: 16,
              child: Material(
                borderRadius: BorderRadius.circular(24),
                elevation: 2,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _RouteOptionChip(
                      label: 'Fastest',
                      selected: !showAlternative,
                      onTap: () =>
                          ref.read(selectedRouteIndexProvider.notifier).state = 0,
                    ),
                    _RouteOptionChip(
                      label: 'Bump-free',
                      selected: showAlternative,
                      onTap: () =>
                          ref.read(selectedRouteIndexProvider.notifier).state = 1,
                    ),
                  ],
                ),
              ),
            ),
        ],
        Positioned(
          bottom: selectedRoute != null ? 280 : 24,
          right: 16,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              if (selectedRoute == null)
                FloatingActionButton.extended(
                  onPressed: () => setState(() => _destinationMode = true),
                  icon: const Icon(Icons.navigation),
                  label: const Text('Set destination'),
                )
              else
                FloatingActionButton(
                  onPressed: () {
                    ref.read(destinationProvider.notifier).state = null;
                    ref.read(routingProvider.notifier).clear();
                    setState(() {
                      _hasFittedRouteBounds = false;
                      ref.read(selectedRouteIndexProvider.notifier).state = 0;
                    });
                  },
                  heroTag: 'clear',
                  child: const Icon(Icons.clear),
                ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildLoadingView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Text(
            'Finding your location...',
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ],
      ),
    );
  }

  Widget _buildPermissionDeniedView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.location_off, size: 64, color: AppColors.error),
            const SizedBox(height: 16),
            Text(
              'Location Permission Required',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Please enable location access in Settings to use this app.',
              style: Theme.of(context).textTheme.bodyLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                ref.invalidate(locationStreamProvider);
              },
              child: const Text('Grant Permission'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildServiceDisabledView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.gps_off, size: 64, color: AppColors.accuracyWarning),
            const SizedBox(height: 16),
            Text(
              'GPS is Turned Off',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              'Please enable GPS in your device settings.',
              style: Theme.of(context).textTheme.bodyLarge,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorView(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.error_outline, size: 64, color: AppColors.error),
            const SizedBox(height: 16),
            Text(
              'Something went wrong',
              style: Theme.of(context).textTheme.titleLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            Text(
              message,
              style: Theme.of(context).textTheme.bodyLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () {
                ref.invalidate(locationStreamProvider);
              },
              child: const Text('Try Again'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAccuracyWarning(double accuracy) {
    return Positioned(
      top: 50,
      right: 16,
      child: Material(
        color: Colors.transparent,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.accuracyWarning,
            borderRadius: BorderRadius.circular(20),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.warning, size: 16, color: Colors.white),
              const SizedBox(width: 4),
              Text(
                'GPS: ${accuracy.toInt()}m',
                style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 14,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  void dispose() {
    ref.read(mapControllerProvider.notifier).state?.dispose();
    ref.read(mapControllerProvider.notifier).state = null;
    super.dispose();
  }
}

class _RouteOptionChip extends StatelessWidget {
  const _RouteOptionChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(24),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: selected ? Theme.of(context).colorScheme.primaryContainer : null,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontWeight: selected ? FontWeight.bold : FontWeight.normal,
            color: selected ? Theme.of(context).colorScheme.onPrimaryContainer : null,
          ),
        ),
      ),
    );
  }
}
