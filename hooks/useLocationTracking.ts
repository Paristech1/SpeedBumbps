'use client';

/**
 * Continuous GPS location tracking.
 * Ported from Flutter: GeolocatorLocationRepository + map_screen.dart location logic.
 *
 * Uses browser navigator.geolocation.watchPosition for continuous updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LatLng } from '@/types/speedbumps';

export interface UserLocation {
  position: LatLng;
  accuracy: number; // meters
  timestamp: number;
}

interface LocationState {
  location: UserLocation | null;
  isTracking: boolean;
  hasPermission: boolean | null; // null = unknown
  error: string | null;
}

// Philadelphia area bounds for auto-centering detection
const PHILLY_BOUNDS = {
  minLat: 39.8,
  maxLat: 40.2,
  minLng: -75.4,
  maxLng: -74.9,
};

export function isInPhillyArea(loc: LatLng): boolean {
  return (
    loc.lat >= PHILLY_BOUNDS.minLat &&
    loc.lat <= PHILLY_BOUNDS.maxLat &&
    loc.lng >= PHILLY_BOUNDS.minLng &&
    loc.lng <= PHILLY_BOUNDS.maxLng
  );
}

export function useLocationTracking() {
  const [state, setState] = useState<LocationState>({
    location: null,
    isTracking: false,
    hasPermission: null,
    error: null,
  });
  const watchIdRef = useRef<number | null>(null);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState((prev) => ({ ...prev, error: 'Geolocation not supported', hasPermission: false }));
      return;
    }

    setState((prev) => ({ ...prev, isTracking: true, error: null }));

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setState((prev) => ({
          ...prev,
          location: {
            position: {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            },
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp,
          },
          hasPermission: true,
          error: null,
        }));
      },
      (err) => {
        let message = 'Location unavailable';
        if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
          message = 'Location permission denied';
          setState((prev) => ({ ...prev, hasPermission: false, isTracking: false, error: message }));
        } else {
          setState((prev) => ({ ...prev, error: message }));
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 15000,
      }
    );
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((prev) => ({ ...prev, isTracking: false }));
  }, []);

  // Auto-start on mount
  useEffect(() => {
    startTracking();
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [startTracking]);

  return { ...state, startTracking, stopTracking };
}
