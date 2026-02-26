import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

class LocationMiniMap extends StatelessWidget {
  const LocationMiniMap({
    super.key,
    required this.location,
    this.height = 120,
  });

  final LatLng location;
  final double height;

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        height: height,
        width: double.infinity,
        child: FlutterMap(
          options: MapOptions(
            initialCenter: location,
            initialZoom: 16,
          ),
          children: [
            TileLayer(
              urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
              userAgentPackageName: 'com.speedbumpapp.speed_bump_app',
            ),
            MarkerLayer(
              markers: [
                Marker(
                  point: location,
                  width: 24,
                  height: 24,
                  child: const Icon(Icons.location_on, color: Colors.red, size: 24),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
