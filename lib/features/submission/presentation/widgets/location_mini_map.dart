import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';

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
        child: GoogleMap(
          initialCameraPosition: CameraPosition(
            target: location,
            zoom: 16,
          ),
          markers: {
            Marker(
              markerId: const MarkerId('submission'),
              position: location,
            ),
          },
          liteModeEnabled: true,
          zoomControlsEnabled: false,
          scrollGesturesEnabled: false,
          zoomGesturesEnabled: false,
          myLocationButtonEnabled: false,
        ),
      ),
    );
  }
}
