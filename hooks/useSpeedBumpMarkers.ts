'use client';

/**
 * Speed bump marker rendering on the map — Nocturne Velocity.
 *
 * A bump reads as a short bar lying across the street, not a dot: idle bars
 * in slate, bars on your route in chrome, and the next bump ahead as the one
 * ember pill on the map. Bars are sized in screen pixels and rebuilt on every
 * viewport change, so they keep the same weight at any zoom.
 * Only renders bumps visible in the current viewport (the map is created
 * with preferCanvas so these circle markers share one canvas layer).
 *
 * While a route is shown, bumps that lie on the selected route are drawn
 * larger with a halo and everything else is dimmed, so the driver can see
 * at a glance which bumps the route actually crosses.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { Map as LeafletMap, Layer } from 'leaflet';
import { loadAllBumps, getBumpsInBounds, USER_REPORTS_CHANGED_EVENT } from '@/lib/speed-bump-service';
import type { SpeedBump } from '@/types/speedbumps';

const MIN_ZOOM_TO_SHOW = 10; // don't render at very low zoom (world view)
/** Bar size on screen, in pixels: length across the street, then thickness. */
const BAR_PX = { length: 13, thickness: 4 };
const ON_ROUTE_BAR_PX = { length: 17, thickness: 5 };
const NEXT_BAR_PX = { length: 26, thickness: 9 };
/** Nocturne marker states: idle steel, chrome on your route, ember for the next one. */
const IDLE_COLOR = '#5B6E7F';
const ON_ROUTE_COLOR = '#E6EAF0';
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
  const markersRef = useRef<Layer[]>([]);
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
    const newMarkers: Layer[] = [];
    const emphasised: SpeedBump[] = [];

    // Degrees per screen pixel at this zoom, so a bar keeps its weight.
    const centre = leafletMap.getCenter();
    const centrePoint = leafletMap.latLngToContainerPoint(centre);
    const onePixelOver = leafletMap.containerPointToLatLng([centrePoint.x + 1, centrePoint.y + 1]);
    const lngPerPx = Math.abs(onePixelOver.lng - centre.lng);
    const latPerPx = Math.abs(onePixelOver.lat - centre.lat);

    /** A bump drawn as a bar lying across the street. */
    const bar = (bump: SpeedBump, px: { length: number; thickness: number }, color: string, dim: boolean) => {
      const halfLng = (px.length / 2) * lngPerPx;
      const halfLat = (px.thickness / 2) * latPerPx;
      return L.rectangle(
        [
          [bump.location.lat - halfLat, bump.location.lng - halfLng],
          [bump.location.lat + halfLat, bump.location.lng + halfLng],
        ],
        {
          color,
          fillColor: color,
          weight: 0,
          fillOpacity: dim ? DIMMED_OPACITY : 0.9,
          opacity: dim ? DIMMED_OPACITY : 1,
        },
      );
    };

    for (const bump of visibleBumps) {
      if (hasRoute && onRouteIds.has(bump.id)) {
        emphasised.push(bump);
        continue;
      }
      const marker = bar(bump, BAR_PX, IDLE_COLOR, hasRoute).bindPopup(popupHtml(bump, false));
      marker.addTo(leafletMap);
      newMarkers.push(marker);
    }

    // Bumps on the route sit on top in chrome; the next one is the single
    // ember pill, drawn as its own element so it can carry a glow.
    for (const bump of emphasised) {
      if (bump.id === nextId) continue;
      const marker = bar(bump, ON_ROUTE_BAR_PX, ON_ROUTE_COLOR, false).bindPopup(popupHtml(bump, true));
      marker.addTo(leafletMap);
      newMarkers.push(marker);
    }

    const next = nextId ? emphasised.find((b) => b.id === nextId) : undefined;
    if (next) {
      const icon = L.divIcon({
        className: '',
        html: `<div class="nv-bump-next" style="width:${NEXT_BAR_PX.length}px;height:${NEXT_BAR_PX.thickness}px"></div>`,
        iconSize: [NEXT_BAR_PX.length, NEXT_BAR_PX.thickness],
        iconAnchor: [NEXT_BAR_PX.length / 2, NEXT_BAR_PX.thickness / 2],
      });
      const marker = L.marker([next.location.lat, next.location.lng], { icon, interactive: true })
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
    ? `<strong style="color:#E8662E">On your route</strong><br/>${source}`
    : source;
}
