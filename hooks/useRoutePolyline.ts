'use client';

/**
 * Route polyline rendering on the map.
 * Renders primary and alternative routes using Leaflet polylines.
 * Color coding: green=bump-free, blue=some bumps, red=many bumps (>= 5).
 */

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Polyline, Marker } from 'leaflet';
import type { AppRoute } from '@/types/speedbumps';
import { routeColor } from '@/lib/geo-utils';
import { polylineBounds } from '@/lib/bump-avoidance';

const STROKE_WIDTH = 5;
const ALT_STROKE_OPACITY = 0.6;

interface UseRoutePolylineOptions {
  map: LeafletMap | null;
  primaryRoute?: AppRoute;
  alternativeRoute?: AppRoute;
  selectedRouteIndex: 0 | 1;
}

export function useRoutePolyline({
  map,
  primaryRoute,
  alternativeRoute,
  selectedRouteIndex,
}: UseRoutePolylineOptions) {
  const primaryPolylineRef = useRef<Polyline | null>(null);
  const altPolylineRef = useRef<Polyline | null>(null);
  const originMarkerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!map) return;

    let mounted = true;

    const render = async () => {
      const L = (await import('leaflet')).default;
      if (!mounted) return;

      // Clear existing polylines and markers
      if (primaryPolylineRef.current) {
        primaryPolylineRef.current.remove();
        primaryPolylineRef.current = null;
      }
      if (altPolylineRef.current) {
        altPolylineRef.current.remove();
        altPolylineRef.current = null;
      }
      if (originMarkerRef.current) {
        originMarkerRef.current.remove();
        originMarkerRef.current = null;
      }
      if (destMarkerRef.current) {
        destMarkerRef.current.remove();
        destMarkerRef.current = null;
      }

      if (!primaryRoute || primaryRoute.polylinePoints.length < 2) return;

      const selectedRoute = selectedRouteIndex === 1 && alternativeRoute ? alternativeRoute : primaryRoute;
      const unselectedRoute = selectedRouteIndex === 1 ? primaryRoute : alternativeRoute;

      // Render unselected (dimmed) route first
      if (unselectedRoute && unselectedRoute.polylinePoints.length >= 2) {
        const latlngs = unselectedRoute.polylinePoints.map((p) => [p.lat, p.lng] as [number, number]);
        const color = routeColor(unselectedRoute.speedBumpCount, unselectedRoute.isSpeedBumpFree);
        altPolylineRef.current = L.polyline(latlngs, {
          color,
          weight: STROKE_WIDTH,
          opacity: ALT_STROKE_OPACITY,
          dashArray: '12 8',
        }).addTo(map);
      }

      // Render selected route on top
      const latlngs = selectedRoute.polylinePoints.map((p) => [p.lat, p.lng] as [number, number]);
      const color = routeColor(selectedRoute.speedBumpCount, selectedRoute.isSpeedBumpFree);
      primaryPolylineRef.current = L.polyline(latlngs, {
        color,
        weight: STROKE_WIDTH,
        opacity: 1,
      }).addTo(map);

      // Origin marker (green circle)
      const originIcon = L.divIcon({
        html: `<div style="width:12px;height:12px;background:#00C853;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
        className: '',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const first = selectedRoute.polylinePoints[0];
      originMarkerRef.current = L.marker([first.lat, first.lng], { icon: originIcon }).addTo(map);

      // Destination marker (red pin)
      const destIcon = L.divIcon({
        html: `<div style="width:14px;height:14px;background:#FF1744;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
        className: '',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const last = selectedRoute.polylinePoints[selectedRoute.polylinePoints.length - 1];
      destMarkerRef.current = L.marker([last.lat, last.lng], { icon: destIcon }).addTo(map);

      // Fit map to route bounds
      const bounds = polylineBounds(selectedRoute.polylinePoints);
      if (bounds) {
        map.fitBounds(
          [[bounds.sw.lat, bounds.sw.lng], [bounds.ne.lat, bounds.ne.lng]],
          { paddingTopLeft: [60, 120], paddingBottomRight: [60, 220], animate: true }
        );
      }
    };

    render();

    return () => {
      mounted = false;
    };
  }, [map, primaryRoute, alternativeRoute, selectedRouteIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      primaryPolylineRef.current?.remove();
      altPolylineRef.current?.remove();
      originMarkerRef.current?.remove();
      destMarkerRef.current?.remove();
    };
  }, []);
}
