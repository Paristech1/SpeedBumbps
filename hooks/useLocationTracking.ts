'use client';

/**
 * Continuous GPS location tracking.
 * Ported from Flutter: GeolocatorLocationRepository + map_screen.dart location logic.
 *
 * Uses browser navigator.geolocation.watchPosition for continuous updates.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { LatLng } from '@/types/speedbumps';
import { log } from '@/lib/app-logger';

export interface UserLocation {
  position: LatLng;
  accuracy: number; // meters
  heading: number | null; // degrees clockwise from north; null when stationary/unknown
  speed: number | null; // meters per second; null when unknown
  timestamp: number;
}

function toUserLocation(position: GeolocationPosition): UserLocation {
  const { coords } = position;
  return {
    position: { lat: coords.latitude, lng: coords.longitude },
    accuracy: coords.accuracy,
    heading: Number.isFinite(coords.heading) ? (coords.heading as number) : null,
    speed: coords.speed != null && Number.isFinite(coords.speed) && coords.speed >= 0 ? coords.speed : null,
    timestamp: position.timestamp,
  };
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

/**
 * Network / Wi‑Fi / cell fixes are fast; high accuracy waits on GPS and often hits
 * TIMEOUT indoors. Prefer a quick coarse fix; badge already warns when accuracy > 20m.
 */
const RELAXED_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  maximumAge: 60000,
  timeout: 60000,
};

/**
 * Turn-by-turn needs real GPS: fresh fixes, heading and speed. Only used while
 * navigating, since it costs battery and is slow to acquire indoors.
 */
const NAVIGATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 20000,
};

const MAX_TIMEOUT_RETRIES = 2;

interface UseLocationTrackingOptions {
  /** Request high-accuracy GPS fixes (navigation mode). */
  highAccuracy?: boolean;
}

export function useLocationTracking({ highAccuracy = false }: UseLocationTrackingOptions = {}) {
  const [state, setState] = useState<LocationState>({
    location: null,
    isTracking: false,
    hasPermission: null,
    error: null,
  });
  const watchIdRef = useRef<number | null>(null);
  /** Avoid infinite retry loops on persistent TIMEOUT */
  const timeoutRetryCountRef = useRef(0);

  const startTracking = useCallback((useHighAccuracy: boolean = false) => {
    if (!navigator.geolocation) {
      setState((prev) => ({ ...prev, error: 'Geolocation not supported', hasPermission: false }));
      return;
    }

    setState((prev) => ({ ...prev, isTracking: true, error: null }));
    timeoutRetryCountRef.current = 0;
    const baseOptions = useHighAccuracy ? NAVIGATION_OPTIONS : RELAXED_OPTIONS;

    const clearWatch = () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };

    const attachWatch = (options: PositionOptions) => {
      clearWatch();
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          timeoutRetryCountRef.current = 0;
          setState((prev) => ({
            ...prev,
            location: toUserLocation(position),
            hasPermission: true,
            error: null,
          }));
        },
        (err) => {
          log('warn', 'geolocation', `watchPosition error (code ${err.code})`, { message: err.message });
          if (err.code === GeolocationPositionError.PERMISSION_DENIED) {
            const message = 'Location permission denied';
            setState((prev) => ({
              ...prev,
              hasPermission: false,
              isTracking: false,
              error: message,
            }));
            return;
          }

          if (err.code === GeolocationPositionError.TIMEOUT) {
            if (timeoutRetryCountRef.current < MAX_TIMEOUT_RETRIES) {
              timeoutRetryCountRef.current += 1;
              // Retry with longest acceptable cache + generous timeout (one-shot then re-watch)
              clearWatch();
              navigator.geolocation.getCurrentPosition(
                (position) => {
                  timeoutRetryCountRef.current = 0;
                  setState((prev) => ({
                    ...prev,
                    location: toUserLocation(position),
                    hasPermission: true,
                    error: null,
                  }));
                  attachWatch(baseOptions);
                },
                () => {
                  attachWatch({
                    ...baseOptions,
                    maximumAge: 300000,
                    timeout: 120000,
                  });
                },
                {
                  enableHighAccuracy: false,
                  maximumAge: 300000,
                  timeout: 120000,
                }
              );
              return;
            }
          }

          const message =
            err.code === GeolocationPositionError.POSITION_UNAVAILABLE
              ? 'Location temporarily unavailable'
              : 'Location unavailable';
          setState((prev) => ({ ...prev, error: message }));
        },
        options
      );
    };

    attachWatch(baseOptions);
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((prev) => ({ ...prev, isTracking: false }));
  }, []);

  // Auto-start on mount and re-attach whenever the accuracy mode changes
  // (defer so we don't set state synchronously inside the effect body)
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      startTracking(highAccuracy);
    });
    return () => {
      cancelAnimationFrame(id);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [startTracking, highAccuracy]);

  return { ...state, startTracking, stopTracking };
}
