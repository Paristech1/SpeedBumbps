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
import { log } from '@/lib/app-logger';

const STROKE_WIDTH = 5;
const ALT_STROKE_OPACITY = 0.6;
const OFF_ROUTE_SNAP_MIN_M = 25;

// Route framing: keep the whole route in the map area between the top bar and the preview sheet
const FIT_SIDE_PX = 40;
const FIT_TOP_PX = 96 + 24; // top bar + margin
const FIT_BOTTOM_MARGIN_PX = 24;
const FIT_MAX_ZOOM = 17;
/** Re-fit when the sheet moves between snap points, not on every pixel. */
const REFIT_INSET_DELTA_PX = 40;
/** Less visible map than this (sheet pulled up to read steps): leave the camera alone. */
const MIN_VISIBLE_MAP_PX = 160;
// A city route framed wider than this is the "zoomed out to the suburbs" symptom
const SUBURB_ZOOM = 11;
const CITY_ROUTE_M = 30000;

/** Frame a route in the part of the map not covered by the top bar and the bottom sheet. */
async function fitRoute(map: LeafletMap, route: AppRoute, bottomInset: number): Promise<boolean> {
  const bounds = polylineBounds(route.polylinePoints);
  if (!bounds) return false;
  const L = (await import('leaflet')).default;
  // The container may have changed size (sheet, rotation, mobile URL bar) since Leaflet last measured
  map.invalidateSize();
  if (map.getSize().y - FIT_TOP_PX - bottomInset < MIN_VISIBLE_MAP_PX) return false;

  const latLngBounds = L.latLngBounds([bounds.sw.lat, bounds.sw.lng], [bounds.ne.lat, bounds.ne.lng]);
  const paddingTopLeft = L.point(FIT_SIDE_PX, FIT_TOP_PX);
  const paddingBottomRight = L.point(FIT_SIDE_PX, bottomInset + FIT_BOTTOM_MARGIN_PX);
  const zoom = Math.min(map.getBoundsZoom(latLngBounds, false, paddingTopLeft.add(paddingBottomRight)), FIT_MAX_ZOOM);
  if (zoom < SUBURB_ZOOM && route.distanceMeters < CITY_ROUTE_M) {
    log('warn', 'route-fit', `Route of ${Math.round(route.distanceMeters)} m framed at zoom ${zoom}`, { bottomInset, mapHeight: map.getSize().y });
  }
  map.fitBounds(latLngBounds, { paddingTopLeft, paddingBottomRight, maxZoom: FIT_MAX_ZOOM, animate: true });
  return true;
}

interface UseRoutePolylineOptions {
  map: LeafletMap | null;
  primaryRoute?: AppRoute;
  alternativeRoute?: AppRoute;
  selectedRouteIndex: 0 | 1;
  /** Frame the whole route on render. Disable during navigation (follow-cam owns the camera). */
  autoFit?: boolean;
  /** Height (px) of the sheet covering the bottom of the map; the route is framed above it. */
  bottomInset?: number;
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
  bottomInset = 0,
  currentLocation = null,
  isNavigating = false,
}: UseRoutePolylineOptions) {
  const primaryPolylineRef = useRef<Polyline | null>(null);
  const altPolylineRef = useRef<Polyline | null>(null);
  const originMarkerRef = useRef<Marker | null>(null);
  const destMarkerRef = useRef<Marker | null>(null);
  const traveledPolylineRef = useRef<Polyline | null>(null);
  const snapLineRef = useRef<Polyline | null>(null);
  // Read at render time without re-rendering the route when they change
  const bottomInsetRef = useRef(bottomInset);
  bottomInsetRef.current = bottomInset;
  const autoFitRef = useRef(autoFit);
  autoFitRef.current = autoFit;
  /** Sheet height the route was last framed for. */
  const fittedInsetRef = useRef<number | null>(null);

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
        const color = routeColor(false);
        altPolylineRef.current = L.polyline(latlngs, {
          color,
          weight: STROKE_WIDTH,
          opacity: ALT_STROKE_OPACITY,
          dashArray: '12 8',
        }).addTo(map);
      }

      // Render selected route on top
      const latlngs = selectedRoute.polylinePoints.map((p) => [p.lat, p.lng] as [number, number]);
      const color = routeColor(true);
      primaryPolylineRef.current = L.polyline(latlngs, {
        color,
        weight: STROKE_WIDTH,
        opacity: 1,
        className: 'route-glow route-polyline-enter',
      }).addTo(map);

      // Origin marker — chrome dot on a void stroke
      const originIcon = L.divIcon({
        html: `<div style="width:12px;height:12px;background:#E6EAF0;border:2px solid #07090A;border-radius:50%;box-shadow:0 0 0 1px rgba(230,234,240,0.3)"></div>`,
        className: '',
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });
      const first = selectedRoute.polylinePoints[0];
      originMarkerRef.current = L.marker([first.lat, first.lng], { icon: originIcon }).addTo(map);

      // Destination marker — hollow chrome ring, so the ember stays on the route
      const destIcon = L.divIcon({
        html: `<div style="width:14px;height:14px;border:2px solid #E6EAF0;border-radius:50%;box-shadow:0 0 0 1px rgba(7,9,10,0.8)"></div>`,
        className: '',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });
      const last = selectedRoute.polylinePoints[selectedRoute.polylinePoints.length - 1];
      destMarkerRef.current = L.marker([last.lat, last.lng], { icon: destIcon }).addTo(map);

      // Fit map to route bounds — skipped during navigation (follow-cam owns the camera)
      if (autoFitRef.current) {
        const inset = bottomInsetRef.current;
        if (await fitRoute(map, selectedRoute, inset)) fittedInsetRef.current = inset;
      }
    };

    render();

    return () => {
      mounted = false;
    };
  }, [map, primaryRoute, alternativeRoute, selectedRouteIndex]);

  // Re-frame when the preview sheet snaps to a different height (new routes are framed as they're drawn)
  const selectedRouteRef = useRef<AppRoute | undefined>(undefined);
  selectedRouteRef.current = selectedRouteIndex === 1 && alternativeRoute ? alternativeRoute : primaryRoute;
  useEffect(() => {
    const route = selectedRouteRef.current;
    if (!map || !route || !autoFit) return;
    const fitted = fittedInsetRef.current;
    if (fitted !== null && Math.abs(bottomInset - fitted) <= REFIT_INSET_DELTA_PX) return;
    let cancelled = false;
    fitRoute(map, route, bottomInset).then((didFit) => {
      if (didFit && !cancelled) fittedInsetRef.current = bottomInset;
    });
    return () => {
      cancelled = true;
    };
  }, [map, bottomInset, autoFit]);

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
          color: '#5B6E7F',
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
            color: '#E6EAF0',
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
