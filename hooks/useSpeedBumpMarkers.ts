'use client';

/**
 * Speed bump marker rendering on the map.
 * Performance critical: ~50K bumps in the dataset.
 * Only renders bumps visible in the current viewport.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { Map as LeafletMap, CircleMarker } from 'leaflet';
import { loadAllBumps, getBumpsInBounds } from '@/lib/speed-bump-service';
import type { SpeedBump } from '@/types/speedbumps';

const MIN_ZOOM_TO_SHOW = 10; // don't render at very low zoom (world view)
const MARKER_RADIUS = 5;
const MARKER_COLOR = '#FF6B00'; // orange

export function useSpeedBumpMarkers(map: LeafletMap | null) {
  const markersRef = useRef<CircleMarker[]>([]);
  const allBumpsRef = useRef<SpeedBump[] | null>(null);

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

    const bounds = leafletMap.getBounds();
    const sw = { lat: bounds.getSouth(), lng: bounds.getWest() };
    const ne = { lat: bounds.getNorth(), lng: bounds.getEast() };
    const visibleBumps = getBumpsInBounds(allBumpsRef.current, sw, ne);

    clearMarkers();

    // Use dynamic import to avoid SSR issues
    const L = (await import('leaflet')).default;
    const newMarkers: CircleMarker[] = [];
    for (const bump of visibleBumps) {
      const marker = L.circleMarker([bump.location.lat, bump.location.lng], {
        radius: MARKER_RADIUS,
        fillColor: MARKER_COLOR,
        color: '#CC4400',
        weight: 1,
        fillOpacity: 0.8,
      }).bindPopup(`Speed bump<br/>ID: ${bump.id}`);
      marker.addTo(leafletMap);
      newMarkers.push(marker);
    }
    markersRef.current = newMarkers;
  }, [clearMarkers]);

  useEffect(() => {
    if (!map) return;

    const handleMoveEnd = () => renderBumpsInView(map);

    map.on('moveend', handleMoveEnd);
    // Initial render
    renderBumpsInView(map);

    return () => {
      map.off('moveend', handleMoveEnd);
      clearMarkers();
    };
  }, [map, renderBumpsInView, clearMarkers]);
}
