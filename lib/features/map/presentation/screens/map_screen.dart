import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../../../core/constants/map_constants.dart';
import '../../../auth/presentation/providers/auth_state_provider.dart';
import '../../../auth/presentation/state/auth_state.dart';
import '../../../../core/theme/app_theme.dart';
import '../../domain/entities/user_location.dart';
import '../../../routing/domain/entities/speed_bump.dart';
import '../../../routing/domain/utils/geo_utils.dart';
import '../../../routing/presentation/providers/destination_provider.dart';
import '../../../routing/presentation/providers/route_options_provider.dart';
import '../../../routing/presentation/providers/routing_provider.dart';
import '../../../routing/presentation/providers/speed_bump_repository_provider.dart';
import '../../../routing/presentation/state/routing_state.dart';
import '../../../routing/presentation/widgets/directions_bottom_sheet.dart';
import '../../../routing/presentation/widgets/route_polyline.dart';
import '../../../routing/domain/entities/route_preferences.dart';
import '../providers/location_provider.dart';
import '../state/map_state.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen>
    with WidgetsBindingObserver {
  bool _hasAnimatedToUser = false;
  bool _destinationMode = false;
  bool _hasFittedRouteBounds = false;
  DateTime? _firstDeviationTime;
  DateTime? _lastRecalcTime;
  String? _lastRouteId;
  UserLocation? _lastLocation;
  List<Marker> _speedBumpMarkers = const [];
  String? _speedBumpError;
  MapController? _mapController;
  ProviderSubscription<AsyncValue<MapState>>? _locationSub;
  ProviderSubscription<AsyncValue<List<SpeedBump>>>? _bumpsSub;
  ProviderSubscription<RouteAvoidanceProfile>? _routePrefsSub;
  static const double _deviationThresholdMeters = 80.0;
  static const int _deviationDelaySeconds = 5;
  static const int _recalcCooldownSeconds = 30;

  static const LatLng _defaultCenter =
      LatLng(MapConstants.defaultLat, MapConstants.defaultLng);

  @override
  void initState() {
    super.initState();
    _mapController = MapController();
    WidgetsBinding.instance.addObserver(this);
    _locationSub = ref.listenManual(locationStreamProvider, _handleLocationUpdate);
    _bumpsSub = ref.listenManual<AsyncValue<List<SpeedBump>>>(
        speedBumpsProvider, (prev, next) {
      next.when(
        data: (bumps) {
          if (!mounted) return;
          setState(() {
            _speedBumpMarkers = _buildSpeedBumpMarkers(bumps);
            _speedBumpError = null;
          });
        },
        loading: () {},
        error: (error, _) {
          if (!mounted) return;
          setState(() {
            _speedBumpError = error.toString();
          });
        },
      );
    }, fireImmediately: true);
    _routePrefsSub = ref.listenManual<RouteAvoidanceProfile>(
      routeAvoidanceProfileProvider,
      (prev, next) {
        if (prev == null) return;
        if (prev.mode == next.mode && prev.vehicle == next.vehicle) return;
        _recalculateRouteForPreferences(next);
      },
    );
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(locationStreamProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final locationState = ref.watch(locationStreamProvider);

    final authState = ref.watch(authStateProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Speed Bump'),
      ),
      drawer: Drawer(
        child: ListView(
          padding: EdgeInsets.zero,
          children: [
            DrawerHeader(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.primaryContainer,
              ),
              child: Text(
                'Speed Bump',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            ListTile(
              leading: const Icon(Icons.login),
              title: const Text('Log in'),
              onTap: () {
                Navigator.pop(context);
                Navigator.pushNamed(context, '/auth');
              },
            ),
            authState.maybeWhen(
              authenticated: (_) => ListTile(
                leading: const Icon(Icons.person),
                title: const Text('Profile'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.pushNamed(context, '/profile');
                },
              ),
              orElse: () => const SizedBox.shrink(),
            ),
            ListTile(
              leading: const Icon(Icons.map),
              title: const Text('Philly Speed Bumps'),
              onTap: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
      floatingActionButton: null,
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
    _lastLocation = location;
    final selectedRoute = ref.watch(selectedRouteProvider);
    final routingState = ref.watch(routingProvider);
    final hasAlternative = routingState.maybeWhen(
      success: (r) => r.alternativeRoute != null,
      orElse: () => false,
    );
    final showAlternative = ref.watch(selectedRouteIndexProvider) == 1;

    _tryAnimateToUser(location);

    if (selectedRoute?.id != _lastRouteId) {
      _hasFittedRouteBounds = false;
      _lastRouteId = selectedRoute?.id;
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
          _mapController?.fitCamera(
            CameraFit.bounds(
              bounds: LatLngBounds(
                LatLng(minLat, minLng),
                LatLng(maxLat, maxLng),
              ),
              padding: const EdgeInsets.all(100),
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

    final markers = <Marker>[..._speedBumpMarkers];
    if (origin != null) {
      markers.add(
        Marker(
          point: origin,
          width: 32,
          height: 32,
          child: const Icon(Icons.trip_origin, color: Colors.green, size: 32),
        ),
      );
    }
    if (destination != null) {
      markers.add(
        Marker(
          point: destination,
          width: 32,
          height: 32,
          child: const Icon(Icons.location_on, color: Colors.red, size: 32),
        ),
      );
    }
    markers.add(
      Marker(
        point: LatLng(location.latitude, location.longitude),
        width: 24,
        height: 24,
        child: const Icon(Icons.my_location, color: Colors.blue, size: 24),
      ),
    );

    final polylines = selectedRoute != null
        ? [RoutePolylineWidget.createPolyline(selectedRoute)]
        : <Polyline>[];

    return Stack(
      children: [
        FlutterMap(
          options: MapOptions(
            initialCenter: _defaultCenter,
            initialZoom: MapConstants.defaultZoom,
            onTap: (_, position) {
              if (_destinationMode) {
                setState(() => _destinationMode = false);
                ref.read(destinationProvider.notifier).state = position;
                final origin = _isInPhiladelphiaArea(location.latitude, location.longitude)
                    ? LatLng(location.latitude, location.longitude)
                    : _defaultCenter;
                ref.read(routingProvider.notifier).calculateRoute(
                      origin: origin,
                      destination: position,
                      avoidanceProfile: ref.read(routeAvoidanceProfileProvider),
                    );
              }
            },
          ),
          mapController: _mapController,
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.speedbumpapp.speed_bump_app',
            ),
            PolylineLayer(polylines: polylines),
            MarkerLayer(markers: markers),
          ],
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
        if (_speedBumpError != null)
          Positioned(
            top: 140,
            left: 16,
            right: 16,
            child: Material(
              color: Colors.orange[50],
              borderRadius: BorderRadius.circular(12),
              elevation: 2,
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber_rounded, color: Colors.orange[800]),
                    const SizedBox(width: 12),
                    const Expanded(
                      child: Text(
                        'Speed bump data failed to load.',
                        style: TextStyle(fontSize: 13),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        if (selectedRoute != null) ...[
          Positioned.fill(
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
              Material(
                elevation: 2,
                borderRadius: BorderRadius.circular(8),
                child: IconButton(
                  icon: const Icon(Icons.my_location),
                  onPressed: () {
                    final loc = _lastLocation;
                    if (loc != null) {
                      _mapController?.move(
                        LatLng(loc.latitude, loc.longitude),
                        MapConstants.userLocationZoom,
                      );
                    }
                  },
                  tooltip: 'Center on my location',
                ),
              ),
              const SizedBox(height: 8),
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

  void _handleLocationUpdate(AsyncValue<MapState>? prev, AsyncValue<MapState> next) {
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
                  avoidanceProfile: ref.read(routeAvoidanceProfileProvider),
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
  }

  static bool _isInPhiladelphiaArea(double lat, double lng) {
    return lat >= 39.8 && lat <= 40.2 && lng >= -75.4 && lng <= -74.9;
  }

  void _tryAnimateToUser(UserLocation location) {
    if (_hasAnimatedToUser) return;
    final controller = _mapController;
    if (controller == null) return;
    _hasAnimatedToUser = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      if (_isInPhiladelphiaArea(location.latitude, location.longitude)) {
        controller.move(
          LatLng(location.latitude, location.longitude),
          MapConstants.userLocationZoom,
        );
      }
    });
  }

  void _recalculateRouteForPreferences(RouteAvoidanceProfile profile) {
    final location = _lastLocation;
    final dest = ref.read(destinationProvider);
    if (location == null || dest == null) return;
    ref.read(routingProvider.notifier).calculateRoute(
          origin: LatLng(location.latitude, location.longitude),
          destination: dest,
          avoidanceProfile: profile,
        );
  }

  List<Marker> _buildSpeedBumpMarkers(List<SpeedBump> bumps) {
    return bumps.map((bump) {
      return Marker(
        point: bump.location,
        width: 24,
        height: 24,
        child: const Icon(Icons.speed, color: Colors.orange, size: 24),
      );
    }).toList();
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
            const Icon(Icons.location_off, size: 64, color: AppColors.error),
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
            const Icon(Icons.gps_off, size: 64, color: AppColors.accuracyWarning),
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
            const Icon(Icons.error_outline, size: 64, color: AppColors.error),
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
    WidgetsBinding.instance.removeObserver(this);
    _locationSub?.close();
    _bumpsSub?.close();
    _routePrefsSub?.close();
    _mapController?.dispose();
    _mapController = null;
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
