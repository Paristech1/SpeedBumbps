import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:latlong2/latlong.dart';

import '../../domain/entities/speed_bump.dart';
import '../../domain/repositories/speed_bump_repository.dart';

/// Loads Philly speed bump data from a bundled JSON asset.
/// The asset is derived from the city's hex traffic calming dataset, with
/// per-cell counts expanded into deterministic points near each hex centroid.
class AssetSpeedBumpRepository implements SpeedBumpRepository {
  AssetSpeedBumpRepository({AssetBundle? bundle}) : _bundle = bundle ?? rootBundle;

  static const String _assetPath = 'assets/data/phl_speed_bumps.json';
  static final DateTime _defaultVerifiedAt = DateTime.utc(2024, 1, 1);

  final AssetBundle _bundle;
  List<SpeedBump>? _cache;

  Future<List<SpeedBump>> _loadAll() async {
    if (_cache != null) return _cache!;

    final raw = await _bundle.loadString(_assetPath);
    final decoded = json.decode(raw);
    if (decoded is! List) {
      throw FormatException('Unexpected speed bump asset format');
    }

    _cache = decoded.map<SpeedBump>((entry) {
      final map = entry as Map<String, dynamic>;
      final id = map['id']?.toString() ?? 'bump';
      final lat = (map['lat'] as num).toDouble();
      final lng = (map['lng'] as num).toDouble();
      return SpeedBump(
        id: id,
        location: LatLng(lat, lng),
        severity: 3,
        reportCount: 1,
        lastVerified: _defaultVerifiedAt,
        isVerified: true,
      );
    }).toList(growable: false);

    return _cache!;
  }

  @override
  Future<List<SpeedBump>> getAllBumps() async {
    return _loadAll();
  }

  @override
  Future<List<SpeedBump>> getBumpsInBounds({
    required LatLng southwest,
    required LatLng northeast,
  }) async {
    final all = await _loadAll();
    final minLat = southwest.latitude;
    final maxLat = northeast.latitude;
    final minLng = southwest.longitude;
    final maxLng = northeast.longitude;

    return all.where((b) {
      final lat = b.location.latitude;
      final lng = b.location.longitude;
      return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
    }).toList(growable: false);
  }
}
