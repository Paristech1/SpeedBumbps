'use client';

/**
 * North-up follow camera for active navigation.
 * Smoothly recenters the map on the driver at a fixed nav zoom; detects
 * when the user manually pans/zooms and hands control back (onUserPan)
 * so a "Recenter" affordance can be shown.
 */

import { useEffect, useRef } from 'react';
import type { Map as LeafletMap } from 'leaflet';
import type { UserLocation } from './useLocationTracking';

const NAV_ZOOM = 17;

interface UseNavigationCameraOptions {
  map: LeafletMap | null;
  location: UserLocation | null;
  isNavigating: boolean;
  isFollowing: boolean;
  onUserPan: () => void;
}

export function useNavigationCamera({
  map,
  location,
  isNavigating,
  isFollowing,
  onUserPan,
}: UseNavigationCameraOptions) {
  // True while WE move the map, so our own move events aren't mistaken
  // for a manual pan.
  const programmaticRef = useRef(false);
  const wasFollowingRef = useRef(false);

  // Detect manual pan / zoom and release follow
  useEffect(() => {
    if (!map) return;

    const handleUserGesture = () => {
      if (!programmaticRef.current && isNavigating && isFollowing) {
        onUserPan();
      }
    };
    const clearProgrammatic = () => {
      programmaticRef.current = false;
    };

    // dragstart fires only on real user drags; zoomstart can be ours, so it's guarded.
    map.on('dragstart', handleUserGesture);
    map.on('zoomstart', handleUserGesture);
    map.on('moveend', clearProgrammatic);
    map.on('zoomend', clearProgrammatic);

    return () => {
      map.off('dragstart', handleUserGesture);
      map.off('zoomstart', handleUserGesture);
      map.off('moveend', clearProgrammatic);
      map.off('zoomend', clearProgrammatic);
    };
  }, [map, isNavigating, isFollowing, onUserPan]);

  // Recenter on the driver
  useEffect(() => {
    if (!map || !isNavigating || !isFollowing || !location) {
      wasFollowingRef.current = isFollowing && isNavigating;
      return;
    }

    const target: [number, number] = [location.position.lat, location.position.lng];
    programmaticRef.current = true;

    // First frame of a follow session zooms in; subsequent frames pan only.
    const justResumed = !wasFollowingRef.current;
    if (justResumed) {
      map.flyTo(target, NAV_ZOOM, { duration: 0.6 });
    } else {
      map.panTo(target, { animate: true, duration: 0.5 });
    }
    wasFollowingRef.current = true;
  }, [map, isNavigating, isFollowing, location]);
}
