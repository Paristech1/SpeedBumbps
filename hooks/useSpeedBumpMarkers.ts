'use client';

/**
 * Speed bump marker rendering on the map — Nocturne Velocity.
 *
 * Bumps are round dots: idle ones in slate, dots on your route in chrome, and
 * the next bump ahead as the one ember on the map, haloed so it reads from a
 * glance. Only renders bumps visible in the current viewport (the map is
 * created with preferCanvas, so these share one canvas layer).
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
const NEXT_RADIUS = 8;
const HALO_RADIUS = 13;
/** Nocturne marker states: idle steel, chrome on your route, ember for the next one. */
const IDLE_COLOR = '#5B6E7F';
const ON_ROUTE_COLOR = '#E6EAF0';
const NEXT_COLOR = '#FF3D8E';
const VOID_COLOR = '#07090A';
const DIMMED_OPACITY = 0.45;

interface UseSpeedBumpMarkersOptions {
  /** Bumps on the selected route. When set, these are emphasised and the rest dimmed. */
  onRouteBumps?: SpeedBump[] | null;
  /** The one bump the driver is about to reach — the only ember on the map. */
  nextBumpId?: string | null;
}

export function useSpeedBumpMarkers(
  map: LeafletMap | null,
  { onRouteBumps = null, nextBumpId = null }: UseSpeedBumpMarkersOptions = {},
) {
  const markersRef = useRef<CircleMarker[]>([]);
  const allBumpsRef = useRef<SpeedBump[] | null>(null);
  const onRouteIdsRef = useRef<Set<string> | null>(null);
  const nextBumpIdRef = useRef<string | null>(null);

  // Stable identity for the highlighted set so viewport redraws see the latest
  const onRouteKey = onRouteBumps ? onRouteBumps.map((b) => b.id).join(',') : '';
  onRouteIdsRef.current = onRouteBumps ? new Set(onRouteBumps.map((b) => b.id)) : null;
  nextBumpIdRef.current = nextBumpId;

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
    const nextId = nextBumpIdRef.current;

    clearMarkers();

    // Use dynamic import to avoid SSR issues
    const L = (await import('leaflet')).default;
    const newMarkers: CircleMarker[] = [];
    const emphasised: SpeedBump[] = [];

    const dot = (
      bump: SpeedBump,
      radius: number,
      color: string,
      { dim = false, stroke = color, weight = 1 } = {},
    ) =>
      L.circleMarker([bump.location.lat, bump.location.lng], {
        radius,
        fillColor: color,
        color: stroke,
        weight,
        fillOpacity: dim ? DIMMED_OPACITY : 0.9,
        opacity: dim ? DIMMED_OPACITY : 1,
      });

    for (const bump of visibleBumps) {
      if (hasRoute && onRouteIds.has(bump.id)) {
        emphasised.push(bump);
        continue;
      }
      const marker = dot(bump, MARKER_RADIUS, IDLE_COLOR, { dim: hasRoute }).bindPopup(popupHtml(bump, false));
      marker.addTo(leafletMap);
      newMarkers.push(marker);
    }

    // Bumps on the route sit on top in chrome. The next one goes last, with a
    // halo: the dataset has bumps a metre apart, and the one that matters must
    // not be overdrawn by its neighbour.
    for (const bump of emphasised) {
      if (bump.id === nextId) continue;
      const marker = dot(bump, ON_ROUTE_RADIUS, ON_ROUTE_COLOR, { stroke: VOID_COLOR, weight: 1.5 })
        .bindPopup(popupHtml(bump, true));
      marker.addTo(leafletMap);
      newMarkers.push(marker);
    }

    const next = nextId ? emphasised.find((b) => b.id === nextId) : undefined;
    if (next) {
      const halo = L.circleMarker([next.location.lat, next.location.lng], {
        radius: HALO_RADIUS,
        fillColor: NEXT_COLOR,
        color: NEXT_COLOR,
        weight: 1,
        fillOpacity: 0.2,
        opacity: 0.55,
        interactive: false,
      });
      halo.addTo(leafletMap);
      newMarkers.push(halo);

      const marker = dot(next, NEXT_RADIUS, NEXT_COLOR, { stroke: VOID_COLOR, weight: 1.5 })
        .bindPopup(popupHtml(next, true));
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
  }, [map, renderBumpsInView, clearMarkers, onRouteKey, nextBumpId]);
}

function popupHtml(bump: SpeedBump, onRoute: boolean): string {
  const source = bump.source === 'user' ? `User report · severity ${bump.severity}` : `Speed bump · ID ${bump.id}`;
  return onRoute
    ? `<strong style="color:#FF3D8E">On your route</strong><br/>${source}`
    : source;
}
