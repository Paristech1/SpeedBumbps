'use client';

/**
 * Route polyline rendering on the map.
 * Renders primary and alternative routes using Leaflet polylines.
 * Color coding: green=bump-free, blue=some bumps, red=many bumps (>= 5).
 */

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap, Polyline, Marker } from 'leaflet';
import type { AppRoute, LatLng } from '@/types/speedbumps';
import { routeColor, routeProgress } from '@/lib/geo-utils';
import { polylineBounds } from '@/lib/bump-avoidance';

const STROKE_WIDTH = 5;
const ALT_STROKE_OPACITY = 0.6;
const OFF_ROUTE_SNAP_MIN_M = 25;

interface UseRoutePolylineOptions {
  map: LeafletMap | null;
  primaryRoute?: AppRoute;
  alternativeRoute?: AppRoute;
  selectedRouteIndex: 0 | 1;
  /** Frame the whole route on render. Disable during navigation (follow-cam owns the camera). */
  autoFit?: boolean;
  /** Live driver position — drives the progress trace and off-route snap line. */
  currentLocation?: LatLng | null;
  isNavigating?: boolean;
}

export function useRoutePolyline({
  map,
  primaryRoute,
  alternativeRoute,
  selectedRouteIndex,
  autoFit = true,
  currentLocation = null,
  isNavigating = false,
}: UseRoutePolylineOptions) {
  const primaryPolylineRef = useRef<Polyline | null>(null);
  const altPolylineRef = useRef<Polyline | null>(null);
  const originMarkerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const traveledPolylineRef = useRef<Polyline | null>(null);
  const snapLineRef = useRef<Polyline | null>(null);

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
        className: 'route-glow route-polyline-enter',
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

      // Fit map to route bounds — skipped during navigation (follow-cam owns the camera)
      if (autoFit) {
        const bounds = polylineBounds(selectedRoute.polylinePoints);
        if (bounds) {
          map.fitBounds(
            [[bounds.sw.lat, bounds.sw.lng], [bounds.ne.lat, bounds.ne.lng]],
            { paddingTopLeft: [60, 120], paddingBottomRight: [60, 220], animate: true }
          );
        }
      }
    };

    render();

    return () => {
      mounted = false;
    };
    // autoFit intentionally excluded: it should not trigger a re-render of the route
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, primaryRoute, alternativeRoute, selectedRouteIndex]);

  // Navigation overlays: progress trace (traveled portion dimmed) + off-route snap line.
  const selectedRoute = selectedRouteIndex === 1 && alternativeRoute ? alternativeRoute : primaryRoute;
  const selectedPoints = selectedRoute?.polylinePoints;
  const pointsKey = selectedRoute?.id ?? '';

  useEffect(() => {
    if (!map) return;
    let mounted = true;

    const clearOverlays = () => {
      traveledPolylineRef.current?.remove();
      traveledPolylineRef.current = null;
      snapLineRef.current?.remove();
      snapLineRef.current = null;
    };

    if (!isNavigating || !currentLocation || !selectedPoints || selectedPoints.length < 2) {
      clearOverlays();
      return;
    }

    const update = async () => {
      const L = (await import('leaflet')).default;
      if (!mounted || !map) return;

      const progress = routeProgress(selectedPoints, currentLocation);

      // Progress trace — dim the traveled portion up to the snapped point
      const traveled = selectedPoints
        .slice(0, progress.segmentIndex + 1)
        .map((p) => [p.lat, p.lng] as [number, number]);
      traveled.push([progress.snappedPoint.lat, progress.snappedPoint.lng]);
      if (traveledPolylineRef.current) {
        traveledPolylineRef.current.setLatLngs(traveled);
      } else {
        traveledPolylineRef.current = L.polyline(traveled, {
          color: '#5b6472',
          weight: STROKE_WIDTH,
          opacity: 0.85,
        }).addTo(map);
      }

      // Off-route snap line — faint dashed connector from driver to the route
      if (progress.offRouteMeters > OFF_ROUTE_SNAP_MIN_M) {
        const connector = [
          [currentLocation.lat, currentLocation.lng] as [number, number],
          [progress.snappedPoint.lat, progress.snappedPoint.lng] as [number, number],
        ];
        if (snapLineRef.current) {
          snapLineRef.current.setLatLngs(connector);
        } else {
          snapLineRef.current = L.polyline(connector, {
            color: '#9ecaff',
            weight: 2,
            opacity: 0.6,
            dashArray: '4 6',
          }).addTo(map);
        }
      } else {
        snapLineRef.current?.remove();
        snapLineRef.current = null;
      }
    };

    update();

    return () => {
      mounted = false;
    };
  }, [map, isNavigating, currentLocation, selectedPoints, pointsKey]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      primaryPolylineRef.current?.remove();
      altPolylineRef.current?.remove();
      originMarkerRef.current?.remove();
      destMarkerRef.current?.remove();
      traveledPolylineRef.current?.remove();
      snapLineRef.current?.remove();
    };
  }, []);
}
