import 'dart:async';

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
import '../../../routing/presentation/widgets/route_polyline.dart';
import '../../../routing/domain/entities/route_preferences.dart';
import '../../../routing/domain/entities/route.dart';
import '../../../routing/domain/usecases/calculate_route_with_bump_avoidance.dart';
import '../../../routing/presentation/widgets/route_planning_sheet.dart';
import '../providers/location_provider.dart';
import '../state/map_state.dart';

class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({
    super.key,
    this.showBaseMap = true,
  });

  final bool showBaseMap;

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen>
    with WidgetsBindingObserver {
  bool _hasAnimatedToUser = false;
  bool _hasFittedRouteBounds = false;
  DateTime? _firstDeviationTime;
  DateTime? _lastRecalcTime;
  String? _lastFitBoundsKey;
  final LayerHitNotifier<int> _polylineHitNotifier = ValueNotifier(null);
  UserLocation? _lastLocation;
  List<Marker> _speedBumpMarkers = const [];
  String? _speedBumpError;
  MapController? _mapController;
  ProviderSubscription<AsyncValue<MapState>>? _locationSub;
  ProviderSubscription<AsyncValue<List<SpeedBump>>>? _bumpsSub;
  String? _originLabel;
  String? _destinationLabel;
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
    _locationSub =
        ref.listenManual(locationStreamProvider, _handleLocationUpdate);
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
          setState(() => _speedBumpError = error.toString());
        },
      );
    }, fireImmediately: true);
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
    return Scaffold(
      drawer: _buildDrawer(context),
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

  Widget _buildDrawer(BuildContext context) {
    final authState = ref.watch(authStateProvider);
    return Drawer(
      child: ListView(
        padding: EdgeInsets.zero,
        children: [
          DrawerHeader(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primaryContainer,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                const Icon(Icons.speed, size: 36),
                const SizedBox(height: 8),
                Text('Speed Bump',
                    style: Theme.of(context).textTheme.headlineSmall),
                Text('Navigate Philly bump-free',
                    style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
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
            orElse: () => ListTile(
              leading: const Icon(Icons.login),
              title: const Text('Log in'),
              onTap: () {
                Navigator.pop(context);
                Navigator.pushNamed(context, '/auth');
              },
            ),
          ),
        ],
      ),
    );
  }

  // ---------- Map view with search bar + route display ----------

  Widget _buildMapView(UserLocation location) {
    _lastLocation = location;
    final selectedRoute = ref.watch(selectedRouteProvider);
    final routeResult = ref.watch(routeCalculationResultProvider);
    final selectedRouteIndex = ref.watch(selectedRouteIndexProvider);
    final routingState = ref.watch(routingProvider);
    final hasAlternative = routingState.maybeWhen(
      success: (r) => r.alternativeRoute != null,
      orElse: () => false,
    );
    final showAlternative = selectedRouteIndex == 1;

    _tryAnimateToUser(location);
    _tryFitRouteBounds(routeResult);

    final markers = _buildMarkers(
      context,
      location,
      selectedRoute,
      routeResult,
      selectedRouteIndex,
    );
    final polylines = routeResult == null
        ? <Polyline<int>>[]
        : RoutePolylineWidget.buildMultiRoutePolylines(
            result: routeResult,
            selectedIndex: selectedRouteIndex,
          );

    return Stack(
      children: [
        // --- Map ---
        FlutterMap(
          options: const MapOptions(
            initialCenter: _defaultCenter,
            initialZoom: MapConstants.defaultZoom,
          ),
          mapController: _mapController,
          children: [
            if (widget.showBaseMap)
              TileLayer(
                urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.speedbumpapp.speed_bump_app',
              ),
            GestureDetector(
              behavior: HitTestBehavior.translucent,
              onTap: () {
                final hit = _polylineHitNotifier.value;
                if (hit == null || hit.hitValues.isEmpty) return;
                final idx = hit.hitValues.first;
                ref.read(selectedRouteIndexProvider.notifier).state = idx;
              },
              child: PolylineLayer<int>(
                hitNotifier: _polylineHitNotifier,
                polylines: polylines,
              ),
            ),
            MarkerLayer(markers: markers),
          ],
        ),

        // --- Top search bar ---
        Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          left: 12,
          right: 12,
          child: _buildSearchBar(context, location, selectedRoute),
        ),

        // --- GPS accuracy warning ---
        if (!location.isHighAccuracy)
          Positioned(
            top: MediaQuery.of(context).padding.top + 72,
            right: 16,
            child: _buildAccuracyBadge(location.accuracy),
          ),

        // --- Loading indicator ---
        if (routingState.maybeWhen(loading: () => true, orElse: () => false))
          Positioned(
            top: MediaQuery.of(context).padding.top + 72,
            left: 0,
            right: 0,
            child: const Center(
              child: Card(
                child: Padding(
                  padding: EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                      SizedBox(width: 12),
                      Text('Finding best route...'),
                    ],
                  ),
                ),
              ),
            ),
          ),

        // --- Error banner ---
        if (routingState.maybeWhen(
          error: (msg) => msg.isNotEmpty,
          orElse: () => false,
        ))
          Positioned(
            top: MediaQuery.of(context).padding.top + 72,
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
                    const SizedBox(width: 8),
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

        // --- Speed bump error ---
        if (_speedBumpError != null)
          Positioned(
            top: MediaQuery.of(context).padding.top + 120,
            left: 16,
            right: 16,
            child: Material(
              color: Colors.orange[50],
              borderRadius: BorderRadius.circular(12),
              elevation: 2,
              child: const Padding(
                padding: EdgeInsets.all(12),
                child: Row(
                  children: [
                    Icon(Icons.warning_amber_rounded, color: Colors.orange),
                    SizedBox(width: 8),
                    Text('Speed bump data failed to load.',
                        style: TextStyle(fontSize: 13)),
                  ],
                ),
              ),
            ),
          ),

        // --- Route result card ---
        if (selectedRoute != null)
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _buildRouteResultCard(
              context,
              selectedRoute,
              hasAlternative,
              showAlternative,
            ),
          ),

        // --- My location button ---
        Positioned(
          bottom: selectedRoute != null ? 200 : 24,
          right: 16,
          child: Material(
            elevation: 3,
            borderRadius: BorderRadius.circular(28),
            color: Theme.of(context).colorScheme.surface,
            child: InkWell(
              borderRadius: BorderRadius.circular(28),
              onTap: () {
                final loc = _lastLocation;
                if (loc != null) {
                  _mapController?.move(
                    LatLng(loc.latitude, loc.longitude),
                    MapConstants.userLocationZoom,
                  );
                }
              },
              child: const Padding(
                padding: EdgeInsets.all(12),
                child: Icon(Icons.my_location, size: 22),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ---------- Search bar ----------

  Widget _buildSearchBar(
      BuildContext context, UserLocation location, AppRoute? currentRoute) {
    return Material(
      elevation: 4,
      borderRadius: BorderRadius.circular(28),
      color: Theme.of(context).colorScheme.surface,
      child: InkWell(
        borderRadius: BorderRadius.circular(28),
        onTap: currentRoute != null
            ? null
            : () => _openRoutePlanning(context, location),
        child: Container(
          height: 52,
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Row(
            children: [
              Builder(
                builder: (ctx) => IconButton(
                  icon: const Icon(Icons.menu, size: 22),
                  onPressed: () => Scaffold.of(ctx).openDrawer(),
                ),
              ),
              const SizedBox(width: 4),
              Expanded(
                child: currentRoute != null
                    ? _buildRouteLabels()
                    : Text(
                        'Where to in Philly?',
                        style: TextStyle(
                          fontSize: 16,
                          color: Colors.grey[600],
                        ),
                      ),
              ),
              if (currentRoute != null)
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  tooltip: 'Clear route',
                  onPressed: _clearRoute,
                )
              else
                IconButton(
                  icon: const Icon(Icons.directions, size: 22),
                  tooltip: 'Plan route',
                  onPressed: () => _openRoutePlanning(context, location),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildRouteLabels() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          _originLabel ?? 'My Location',
          style: const TextStyle(fontSize: 12, color: Colors.green),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
        Text(
          _destinationLabel ?? 'Destination',
          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ],
    );
  }

  // ---------- Route result card ----------

  Widget _buildRouteResultCard(
    BuildContext context,
    AppRoute route,
    bool hasAlternative,
    bool showAlternative,
  ) {
    return Container(
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 10, offset: Offset(0, -2)),
        ],
      ),
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 12),

            // Route summary
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        route.durationFormatted,
                        style: Theme.of(context)
                            .textTheme
                            .headlineSmall
                            ?.copyWith(fontWeight: FontWeight.bold),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        route.distanceFormatted,
                        style: TextStyle(color: Colors.grey[600], fontSize: 14),
                      ),
                    ],
                  ),
                ),
                _buildBumpBadge(route),
              ],
            ),
            const SizedBox(height: 16),

            // Fastest / Bump-free toggle
            if (hasAlternative) ...[
              Row(
                children: [
                  Expanded(
                    child: _ToggleButton(
                      label: 'Fastest',
                      icon: Icons.speed,
                      selected: !showAlternative,
                      onTap: () => ref
                          .read(selectedRouteIndexProvider.notifier)
                          .state = 0,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: _ToggleButton(
                      label: 'Bump-free',
                      icon: Icons.check_circle_outline,
                      selected: showAlternative,
                      onTap: () => ref
                          .read(selectedRouteIndexProvider.notifier)
                          .state = 1,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
            ],

            // Action buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _clearRoute,
                    icon: const Icon(Icons.close, size: 18),
                    label: const Text('Cancel'),
                    style: OutlinedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: FilledButton.icon(
                    onPressed: () => _showSteps(context, route),
                    icon: const Icon(Icons.list_alt, size: 18),
                    label: const Text('View Steps'),
                    style: FilledButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBumpBadge(AppRoute route) {
    if (route.isSpeedBumpFree) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.green[100],
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle, size: 16, color: Colors.green[800]),
            const SizedBox(width: 4),
            Text('Bump-free',
                style: TextStyle(
                    color: Colors.green[800], fontWeight: FontWeight.bold)),
          ],
        ),
      );
    }
    if (route.speedBumpCount > 0) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: Colors.orange[100],
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.warning_amber_rounded, size: 16, color: Colors.orange[800]),
            const SizedBox(width: 4),
            Text('${route.speedBumpCount} bumps',
                style: TextStyle(
                    color: Colors.orange[800], fontWeight: FontWeight.bold)),
          ],
        ),
      );
    }
    return const SizedBox.shrink();
  }

  void _showSteps(BuildContext context, AppRoute route) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => DraggableScrollableSheet(
        initialChildSize: 0.6,
        minChildSize: 0.3,
        maxChildSize: 0.9,
        expand: false,
        builder: (ctx, scrollCtrl) => Column(
          children: [
            Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              width: 40, height: 4,
              decoration: BoxDecoration(
                color: Colors.grey[300],
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Text('Directions',
                      style: Theme.of(context)
                          .textTheme
                          .titleLarge
                          ?.copyWith(fontWeight: FontWeight.bold)),
                  const Spacer(),
                  Text(
                    '${route.durationFormatted} · ${route.distanceFormatted}',
                    style: TextStyle(color: Colors.grey[600]),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: ListView.builder(
                controller: scrollCtrl,
                itemCount: route.steps.length,
                itemBuilder: (_, i) {
                  final step = route.steps[i];
                  final miles = step.distanceMeters * 0.000621371;
                  return ListTile(
                    leading: Icon(step.maneuverIcon, color: Colors.blue),
                    title: Text(step.instruction,
                        style: const TextStyle(fontSize: 14)),
                    subtitle: Text('${miles.toStringAsFixed(1)} mi',
                        style: TextStyle(fontSize: 12, color: Colors.grey[600])),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---------- Actions ----------

  void _openRoutePlanning(BuildContext context, UserLocation location) async {
    final currentLoc = _isInPhiladelphiaArea(location.latitude, location.longitude)
        ? LatLng(location.latitude, location.longitude)
        : _defaultCenter;
    final profile = ref.read(routeAvoidanceProfileProvider);

    final result = await showModalBottomSheet<RoutePlanningResult>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => RoutePlanningSheet(
        currentLocation: currentLoc,
        initialMode: profile.mode,
        initialVehicle: profile.vehicle,
      ),
    );

    if (result == null || !mounted) return;

    ref.read(routePreferenceModeProvider.notifier).state = result.mode;
    ref.read(vehicleProfileProvider.notifier).state = result.vehicle;
    ref.read(destinationProvider.notifier).state = result.destination;
    setState(() {
      _originLabel = result.originLabel;
      _destinationLabel = result.destinationLabel;
    });
    unawaited(ref.read(routingProvider.notifier).calculateRoute(
          origin: result.origin,
          destination: result.destination,
          avoidanceProfile:
              RouteAvoidanceProfile(mode: result.mode, vehicle: result.vehicle),
        ));
  }

  void _clearRoute() {
    ref.read(destinationProvider.notifier).state = null;
    ref.read(routingProvider.notifier).clear();
    setState(() {
      _hasFittedRouteBounds = false;
      _lastFitBoundsKey = null;
      _originLabel = null;
      _destinationLabel = null;
      ref.read(selectedRouteIndexProvider.notifier).state = 0;
    });
  }

  // ---------- Helpers ----------

  void _tryFitRouteBounds(RouteCalculationResult? result) {
    if (result == null) return;
    final key =
        '${result.primaryRoute.id}_${result.alternativeRoute?.id ?? "none"}';
    if (key != _lastFitBoundsKey) {
      _hasFittedRouteBounds = false;
      _lastFitBoundsKey = key;
    }
    if (!_hasFittedRouteBounds) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_hasFittedRouteBounds || !mounted) return;
        final points = <LatLng>[
          ...result.primaryRoute.previewPolylinePoints,
          ...?result.alternativeRoute?.previewPolylinePoints,
        ];
        if (points.length < 2) return;
        _hasFittedRouteBounds = true;
        double minLat = points.first.latitude,
            maxLat = points.first.latitude,
            minLng = points.first.longitude,
            maxLng = points.first.longitude;
        for (final p in points) {
          if (p.latitude < minLat) minLat = p.latitude;
          if (p.latitude > maxLat) maxLat = p.latitude;
          if (p.longitude < minLng) minLng = p.longitude;
          if (p.longitude > maxLng) maxLng = p.longitude;
        }
        // Ensure SW != NE so LatLngBounds assertion doesn't fire
        if ((maxLat - minLat).abs() < 0.001) {
          minLat -= 0.002;
          maxLat += 0.002;
        }
        if ((maxLng - minLng).abs() < 0.001) {
          minLng -= 0.002;
          maxLng += 0.002;
        }
        _mapController?.fitCamera(CameraFit.bounds(
          bounds: LatLngBounds(LatLng(minLat, minLng), LatLng(maxLat, maxLng)),
          padding: const EdgeInsets.fromLTRB(60, 120, 60, 220),
        ));
      });
    }
  }

  List<Marker> _routeSummaryMarkers(
    BuildContext context,
    RouteCalculationResult result,
    int selectedRouteIndex,
  ) {
    final markers = <Marker>[];
    void addChip(AppRoute route, int index) {
      if (route.previewPolylinePoints.length < 2) return;
      final mid = route.polylineMidpoint;
      if (mid == null) return;
      final selected = index == selectedRouteIndex;
      final subtitle = index == 0 ? 'Fastest' : 'Bump-free';
      markers.add(
        Marker(
          point: mid,
          width: 148,
          height: 56,
          alignment: Alignment.bottomCenter,
          child: Material(
            elevation: selected ? 8 : 3,
            borderRadius: BorderRadius.circular(12),
            color: Theme.of(context).colorScheme.surface.withValues(
                  alpha: selected ? 1 : 0.94,
                ),
            child: InkWell(
              onTap: () {
                ref.read(selectedRouteIndexProvider.notifier).state = index;
              },
              borderRadius: BorderRadius.circular(12),
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.directions_car,
                          size: 14,
                          color: route.polylineColor,
                        ),
                        const SizedBox(width: 4),
                        Flexible(
                          child: Text(
                            '${route.durationFormatted} · ${route.distanceFormatted}',
                            style: TextStyle(
                              fontWeight:
                                  selected ? FontWeight.w800 : FontWeight.w600,
                              fontSize: 12,
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 10,
                        color: Colors.grey[700],
                        fontWeight:
                            selected ? FontWeight.w600 : FontWeight.normal,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );
    }

    addChip(result.primaryRoute, 0);
    if (result.alternativeRoute != null) {
      addChip(result.alternativeRoute!, 1);
    }
    return markers;
  }

  List<Marker> _buildMarkers(
    BuildContext context,
    UserLocation location,
    AppRoute? selectedRoute,
    RouteCalculationResult? routeResult,
    int selectedRouteIndex,
  ) {
    final markers = <Marker>[..._speedBumpMarkers];
    if (routeResult != null) {
      markers.addAll(
        _routeSummaryMarkers(context, routeResult, selectedRouteIndex),
      );
    }
    if (selectedRoute != null && selectedRoute.previewPolylinePoints.isNotEmpty) {
      markers.add(Marker(
        point: selectedRoute.previewPolylinePoints.first,
        width: 32, height: 32,
        child: const Icon(Icons.trip_origin, color: Colors.green, size: 32),
      ));
    }
    if (selectedRoute != null && selectedRoute.previewPolylinePoints.length >= 2) {
      markers.add(Marker(
        point: selectedRoute.previewPolylinePoints.last,
        width: 32, height: 32,
        child: const Icon(Icons.location_on, color: Colors.red, size: 32),
      ));
    }
    markers.add(Marker(
      point: LatLng(location.latitude, location.longitude),
      width: 24, height: 24,
      child: const Icon(Icons.my_location, color: Colors.blue, size: 24),
    ));
    return markers;
  }

  void _handleLocationUpdate(
      AsyncValue<MapState>? prev, AsyncValue<MapState> next) {
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
          route.previewPolylinePoints,
        );
        if (dist > _deviationThresholdMeters) {
          _firstDeviationTime ??= DateTime.now();
          final now = DateTime.now();
          if (now.difference(_firstDeviationTime!).inSeconds >=
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

  List<Marker> _buildSpeedBumpMarkers(List<SpeedBump> bumps) {
    return bumps
        .map((bump) => Marker(
              point: bump.location,
              width: 24, height: 24,
              child:
                  const Icon(Icons.speed, color: Colors.orange, size: 24),
            ))
        .toList();
  }

  Widget _buildAccuracyBadge(double accuracy) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: AppColors.accuracyWarning,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.warning, size: 14, color: Colors.white),
          const SizedBox(width: 4),
          Text('GPS: ${accuracy.toInt()}m',
              style: const TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.bold,
                  fontSize: 12)),
        ],
      ),
    );
  }

  // ---------- State views ----------

  Widget _buildLoadingView() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(),
          const SizedBox(height: 16),
          Text('Finding your location...',
              style: Theme.of(context).textTheme.bodyLarge),
        ],
      ),
    );
  }

  Widget _buildPermissionDeniedView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.location_off, size: 64, color: AppColors.error),
            const SizedBox(height: 16),
            Text('Location Permission Required',
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('Please enable location access in Settings to use this app.',
                style: Theme.of(context).textTheme.bodyLarge,
                textAlign: TextAlign.center),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => ref.invalidate(locationStreamProvider),
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
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.gps_off,
                size: 64, color: AppColors.accuracyWarning),
            const SizedBox(height: 16),
            Text('GPS is Turned Off',
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text('Please enable GPS in your device settings.',
                style: Theme.of(context).textTheme.bodyLarge,
                textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorView(String message) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: AppColors.error),
            const SizedBox(height: 16),
            Text('Something went wrong',
                style: Theme.of(context).textTheme.titleLarge,
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(message,
                style: Theme.of(context).textTheme.bodyLarge,
                textAlign: TextAlign.center),
            const SizedBox(height: 24),
            ElevatedButton(
              onPressed: () => ref.invalidate(locationStreamProvider),
              child: const Text('Try Again'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _locationSub?.close();
    _bumpsSub?.close();
    _polylineHitNotifier.dispose();
    _mapController?.dispose();
    _mapController = null;
    super.dispose();
  }
}

class _ToggleButton extends StatelessWidget {
  const _ToggleButton({
    required this.label,
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Material(
      color: selected ? colorScheme.primaryContainer : Colors.grey[100],
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon,
                  size: 18,
                  color: selected
                      ? colorScheme.onPrimaryContainer
                      : Colors.grey[600]),
              const SizedBox(width: 6),
              Text(
                label,
                style: TextStyle(
                  fontWeight: selected ? FontWeight.bold : FontWeight.normal,
                  color: selected
                      ? colorScheme.onPrimaryContainer
                      : Colors.grey[700],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
