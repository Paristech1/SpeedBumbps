import 'dart:async';
import 'package:flutter/material.dart';
import 'package:latlong2/latlong.dart';

import '../../data/datasources/nominatim_geocoding_api.dart';
import '../../domain/entities/route_preferences.dart';

class RoutePlanningResult {
  final LatLng origin;
  final LatLng destination;
  final String originLabel;
  final String destinationLabel;
  final RoutePreferenceMode mode;
  final VehicleProfile vehicle;

  const RoutePlanningResult({
    required this.origin,
    required this.destination,
    required this.originLabel,
    required this.destinationLabel,
    required this.mode,
    required this.vehicle,
  });
}

class RoutePlanningSheet extends StatefulWidget {
  const RoutePlanningSheet({
    super.key,
    this.currentLocation,
    this.initialMode = RoutePreferenceMode.cargoConscious,
    this.initialVehicle = VehicleProfile.sedan,
  });

  final LatLng? currentLocation;
  final RoutePreferenceMode initialMode;
  final VehicleProfile initialVehicle;

  @override
  State<RoutePlanningSheet> createState() => _RoutePlanningSheetState();
}

class _RoutePlanningSheetState extends State<RoutePlanningSheet> {
  final _geocoder = NominatimGeocodingApi();
  final _fromController = TextEditingController();
  final _toController = TextEditingController();
  final _toFocusNode = FocusNode();

  bool _useMyLocation = true;
  LatLng? _fromLocation;
  LatLng? _toLocation;
  String _fromLabel = 'My Location';
  String _toLabel = '';
  late RoutePreferenceMode _mode;
  late VehicleProfile _vehicle;

  List<GeocodingResult> _fromSuggestions = const [];
  List<GeocodingResult> _toSuggestions = const [];
  bool _showFromSuggestions = false;
  bool _showToSuggestions = false;
  Timer? _debounce;
  bool _searching = false;

  @override
  void initState() {
    super.initState();
    _mode = widget.initialMode;
    _vehicle = widget.initialVehicle;
    _fromLocation = widget.currentLocation;
    _fromController.text = 'My Location';
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _fromController.dispose();
    _toController.dispose();
    _toFocusNode.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      (_useMyLocation ? widget.currentLocation != null : _fromLocation != null) &&
      _toLocation != null;

  void _onFromChanged(String value) {
    if (value == 'My Location') return;
    _useMyLocation = false;
    _fromLocation = null;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      if (value.length < 2) {
        setState(() {
          _fromSuggestions = const [];
          _showFromSuggestions = false;
        });
        return;
      }
      setState(() => _searching = true);
      try {
        final results = await _geocoder.search(value);
        if (mounted) {
          setState(() {
            _fromSuggestions = results;
            _showFromSuggestions = results.isNotEmpty;
            _searching = false;
          });
        }
      } catch (_) {
        if (mounted) {
          setState(() => _searching = false);
        }
      }
    });
  }

  void _onToChanged(String value) {
    _toLocation = null;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () async {
      if (value.length < 2) {
        setState(() {
          _toSuggestions = const [];
          _showToSuggestions = false;
        });
        return;
      }
      setState(() => _searching = true);
      try {
        final results = await _geocoder.search(value);
        if (mounted) {
          setState(() {
            _toSuggestions = results;
            _showToSuggestions = results.isNotEmpty;
            _searching = false;
          });
        }
      } catch (_) {
        if (mounted) {
          setState(() => _searching = false);
        }
      }
    });
  }

  void _selectFrom(GeocodingResult result) {
    setState(() {
      _fromController.text = result.shortName;
      _fromLocation = result.location;
      _fromLabel = result.shortName;
      _useMyLocation = false;
      _showFromSuggestions = false;
    });
  }

  void _selectTo(GeocodingResult result) {
    setState(() {
      _toController.text = result.shortName;
      _toLocation = result.location;
      _toLabel = result.shortName;
      _showToSuggestions = false;
    });
  }

  void _resetToMyLocation() {
    setState(() {
      _useMyLocation = true;
      _fromController.text = 'My Location';
      _fromLocation = widget.currentLocation;
      _fromLabel = 'My Location';
      _showFromSuggestions = false;
    });
  }

  void _submit() {
    if (!_canSubmit) return;
    final origin = _useMyLocation ? widget.currentLocation! : _fromLocation!;
    Navigator.of(context).pop(RoutePlanningResult(
      origin: origin,
      destination: _toLocation!,
      originLabel: _useMyLocation ? 'My Location' : _fromLabel,
      destinationLabel: _toLabel,
      mode: _mode,
      vehicle: _vehicle,
    ));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: colorScheme.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: ListView(
            controller: scrollController,
            padding: const EdgeInsets.symmetric(horizontal: 20),
            children: [
              Center(
                child: Container(
                  margin: const EdgeInsets.only(top: 12, bottom: 8),
                  width: 40, height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey[300],
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),

              Text(
                'Plan your route',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                'Avoid speed bumps in Philadelphia',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 20),

              // --- FROM field ---
              _buildFieldLabel('FROM', Icons.trip_origin, Colors.green),
              const SizedBox(height: 6),
              TextField(
                controller: _fromController,
                onChanged: _onFromChanged,
                onTap: () {
                  if (_useMyLocation) {
                    _fromController.clear();
                    _useMyLocation = false;
                  }
                },
                decoration: InputDecoration(
                  hintText: 'Enter starting address or place',
                  filled: true,
                  fillColor: Colors.grey[100],
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: !_useMyLocation
                      ? IconButton(
                          icon: const Icon(Icons.my_location, size: 20),
                          tooltip: 'Use my location',
                          onPressed: _resetToMyLocation,
                        )
                      : const Icon(Icons.gps_fixed, size: 20, color: Colors.blue),
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 14,
                  ),
                ),
              ),
              if (_showFromSuggestions) _buildSuggestions(_fromSuggestions, _selectFrom),
              const SizedBox(height: 16),

              // --- TO field ---
              _buildFieldLabel('TO', Icons.location_on, Colors.red),
              const SizedBox(height: 6),
              TextField(
                controller: _toController,
                focusNode: _toFocusNode,
                onChanged: _onToChanged,
                autofocus: true,
                decoration: InputDecoration(
                  hintText: 'Enter destination address or place',
                  filled: true,
                  fillColor: Colors.grey[100],
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                  prefixIcon: const Icon(Icons.search, size: 20),
                  suffixIcon: _toController.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear, size: 20),
                          onPressed: () {
                            _toController.clear();
                            setState(() {
                              _toLocation = null;
                              _toLabel = '';
                              _toSuggestions = const [];
                              _showToSuggestions = false;
                            });
                          },
                        )
                      : null,
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 14,
                  ),
                ),
              ),
              if (_showToSuggestions) _buildSuggestions(_toSuggestions, _selectTo),
              if (_searching)
                const Padding(
                  padding: EdgeInsets.symmetric(vertical: 8),
                  child: Center(child: SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )),
                ),
              const SizedBox(height: 24),

              // --- Vehicle profile ---
              Text(
                'Vehicle',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: VehicleProfile.values.map((v) {
                  final selected = _vehicle == v;
                  return ChoiceChip(
                    label: Text(_vehicleLabel(v)),
                    avatar: Icon(_vehicleIcon(v), size: 18),
                    selected: selected,
                    onSelected: (_) => setState(() => _vehicle = v),
                  );
                }).toList(),
              ),
              const SizedBox(height: 20),

              // --- Route mode ---
              Text(
                'Route preference',
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: RoutePreferenceMode.values.map((m) {
                  final selected = _mode == m;
                  return ChoiceChip(
                    label: Text(_modeLabel(m)),
                    selected: selected,
                    onSelected: (_) => setState(() => _mode = m),
                  );
                }).toList(),
              ),
              const SizedBox(height: 8),
              Text(
                _modeDescription(_mode),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: Colors.grey[600],
                ),
              ),
              const SizedBox(height: 28),

              // --- SUBMIT BUTTON ---
              SizedBox(
                width: double.infinity,
                height: 52,
                child: FilledButton.icon(
                  onPressed: _canSubmit ? _submit : null,
                  icon: const Icon(Icons.navigation),
                  label: const Text(
                    'Find Route',
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  ),
                  style: FilledButton.styleFrom(
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 16),

              Center(
                child: TextButton.icon(
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close, size: 18),
                  label: const Text('Cancel'),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        );
      },
    );
  }

  Widget _buildFieldLabel(String label, IconData icon, Color color) {
    return Row(
      children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(width: 6),
        Text(
          label,
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.bold,
            color: color,
            letterSpacing: 1.2,
          ),
        ),
      ],
    );
  }

  Widget _buildSuggestions(
    List<GeocodingResult> suggestions,
    ValueChanged<GeocodingResult> onSelect,
  ) {
    return Container(
      margin: const EdgeInsets.only(top: 4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 8, offset: Offset(0, 2)),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: suggestions.map((r) {
          return ListTile(
            dense: true,
            leading: const Icon(Icons.place, size: 20),
            title: Text(r.shortName, style: const TextStyle(fontSize: 14)),
            subtitle: Text(
              r.displayName,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(fontSize: 11, color: Colors.grey[500]),
            ),
            onTap: () => onSelect(r),
          );
        }).toList(),
      ),
    );
  }

  String _vehicleLabel(VehicleProfile v) => switch (v) {
    VehicleProfile.sedan => 'Sedan',
    VehicleProfile.suv => 'SUV',
    VehicleProfile.loweredCar => 'Lowered',
    VehicleProfile.motorcycle => 'Motorcycle',
    VehicleProfile.bicycle => 'Bicycle',
  };

  IconData _vehicleIcon(VehicleProfile v) => switch (v) {
    VehicleProfile.sedan => Icons.directions_car,
    VehicleProfile.suv => Icons.directions_car_filled,
    VehicleProfile.loweredCar => Icons.sports_motorsports,
    VehicleProfile.motorcycle => Icons.two_wheeler,
    VehicleProfile.bicycle => Icons.pedal_bike,
  };

  String _modeLabel(RoutePreferenceMode m) => switch (m) {
    RoutePreferenceMode.smoothRide => 'Smooth Ride',
    RoutePreferenceMode.cargoConscious => 'Balanced',
    RoutePreferenceMode.fast => 'Fastest',
  };

  String _modeDescription(RoutePreferenceMode m) => switch (m) {
    RoutePreferenceMode.smoothRide => 'Avoids all speed bumps — may take longer',
    RoutePreferenceMode.cargoConscious => 'Avoids harsh bumps, balances time and comfort',
    RoutePreferenceMode.fast => 'Shortest time — only avoids the worst bumps',
  };
}
