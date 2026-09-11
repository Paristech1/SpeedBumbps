'use client';

/**
 * Speed bump marker rendering on the map.
 * Only renders bumps visible in the current viewport (the map is created
 * with preferCanvas so these circle markers share one canvas layer).
 *
 * While a route is shown, bumps that lie on the selected route are drawn
 * larger with a halo and everything else is dimmed, so the driver can see
 * at a glance which bumps the route actually crosses.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { Map as LeafletMap, CircleMarker } from 'leaflet';
import { loadAllBumps, getBumpsInBounds, USER_REPORTS_CHANGED_EVENT } from '@/lib/speed-bump-service';
import type { SpeedBump } from '@/types/speedbumps';

const MIN_ZOOM_TO_SHOW = 10; // don't render at very low zoom (world view)
const MARKER_RADIUS = 5;
const ON_ROUTE_RADIUS = 7;
const ON_ROUTE_HALO_RADIUS = 13;
const MARKER_COLOR = '#FF6B00'; // orange
const DIMMED_OPACITY = 0.35;

interface UseSpeedBumpMarkersOptions {
  /** Bumps on the selected route. When set, these are emphasised and the rest dimmed. */
  onRouteBumps?: SpeedBump[] | null;
}

export function useSpeedBumpMarkers(map: LeafletMap | null, { onRouteBumps = null }: UseSpeedBumpMarkersOptions = {}) {
  const markersRef = useRef<CircleMarker[]>([]);
  const allBumpsRef = useRef<SpeedBump[] | null>(null);
  const onRouteIdsRef = useRef<Set<string> | null>(null);

  // Stable identity for the highlighted set so viewport redraws see the latest
  const onRouteKey = onRouteBumps ? onRouteBumps.map((b) => b.id).join(',') : '';
  onRouteIdsRef.current = onRouteBumps ? new Set(onRouteBumps.map((b) => b.id)) : null;

  const clearMarkers = useCallback(() => {
    for (const m of markersRef.current) {
      m.remove();
    }
    markersRef.current = [];
  }, []);

  const renderBumpsInView = useCallback(async (leafletMap: LeafletMap) => {
    const zoom = leafletMap.getZoom();
    if (zoom < MIN_ZOOM_TO_SHOW) {
      clearMarkers();
      return;
    }

    // Load bumps if not yet loaded
    if (!allBumpsRef.current) {
      try {
        allBumpsRef.current = await loadAllBumps();
      } catch {
        return;
      }
    }

    const bounds = leafletMap.getBounds().pad(0.1);
    const sw = { lat: bounds.getSouth(), lng: bounds.getWest() };
    const ne = { lat: bounds.getNorth(), lng: bounds.getEast() };
    const visibleBumps = getBumpsInBounds(allBumpsRef.current, sw, ne);
    const onRouteIds = onRouteIdsRef.current;
    const hasRoute = onRouteIds !== null;

    clearMarkers();

    // Use dynamic import to avoid SSR issues
    const L = (await import('leaflet')).default;
    const newMarkers: CircleMarker[] = [];
    const emphasised: SpeedBump[] = [];

    for (const bump of visibleBumps) {
      if (hasRoute && onRouteIds.has(bump.id)) {
        emphasised.push(bump);
        continue;
      }
      const isUserReport = bump.source === 'user';
      const marker = L.circleMarker([bump.location.lat, bump.location.lng], {
        radius: MARKER_RADIUS,
        fillColor: isUserReport ? '#9ecaff' : MARKER_COLOR,
        color: isUserReport ? '#2196F3' : '#CC4400',
        weight: 1,
        fillOpacity: hasRoute ? DIMMED_OPACITY : 0.8,
        opacity: hasRoute ? DIMMED_OPACITY : 1,
      }).bindPopup(popupHtml(bump, false));
      marker.addTo(leafletMap);
      newMarkers.push(marker);
    }

    // On-route bumps go on top: halo first, then the marker
    for (const bump of emphasised) {
      const halo = L.circleMarker([bump.location.lat, bump.location.lng], {
        radius: ON_ROUTE_HALO_RADIUS,
        fillColor: MARKER_COLOR,
        color: MARKER_COLOR,
        weight: 1,
        fillOpacity: 0.18,
        opacity: 0.5,
        interactive: false,
      });
      halo.addTo(leafletMap);
      newMarkers.push(halo);

      const marker = L.circleMarker([bump.location.lat, bump.location.lng], {
        radius: ON_ROUTE_RADIUS,
        fillColor: MARKER_COLOR,
        color: '#ffffff',
        weight: 2,
        fillOpacity: 1,
        opacity: 1,
      }).bindPopup(popupHtml(bump, true));
      marker.addTo(leafletMap);
      newMarkers.push(marker);
    }
    markersRef.current = newMarkers;
  }, [clearMarkers]);

  useEffect(() => {
    if (!map) return;

    const handleMoveEnd = () => renderBumpsInView(map);
    const handleReportsChanged = () => {
      allBumpsRef.current = null;
      renderBumpsInView(map);
    };

    map.on('moveend', handleMoveEnd);
    window.addEventListener(USER_REPORTS_CHANGED_EVENT, handleReportsChanged);
    // Initial render (and re-render whenever the highlighted set changes)
    renderBumpsInView(map);

    return () => {
      map.off('moveend', handleMoveEnd);
      window.removeEventListener(USER_REPORTS_CHANGED_EVENT, handleReportsChanged);
      clearMarkers();
    };
  }, [map, renderBumpsInView, clearMarkers, onRouteKey]);
}

function popupHtml(bump: SpeedBump, onRoute: boolean): string {
  const source = bump.source === 'user' ? `User report · severity ${bump.severity}` : `Speed bump · ID ${bump.id}`;
  return onRoute
    ? `<strong style="color:#FF6B00">On your route</strong><br/>${source}`
    : source;
}
