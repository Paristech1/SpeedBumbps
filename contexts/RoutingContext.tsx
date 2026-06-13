'use client';

/**
 * Routing state management.
 * Replaces Flutter's routingProvider (Riverpod StateNotifier).
 * Includes 15-minute result cache keyed by origin+destination+profile.
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type {
  LatLng,
  RouteCalculationResult,
  RouteAvoidanceProfile,
} from '@/types/speedbumps';
import { DEFAULT_AVOIDANCE_PROFILE } from '@/types/speedbumps';
import { calculateRouteWithBumpAvoidance } from '@/lib/bump-avoidance';
import { log } from '@/lib/app-logger';

type RoutingStatus = 'idle' | 'loading' | 'success' | 'error';

interface RoutingState {
  status: RoutingStatus;
  result?: RouteCalculationResult;
  error?: string;
  origin?: LatLng;
  originLabel?: string;
  destination?: LatLng;
  destinationLabel?: string;
  selectedRouteIndex: 0 | 1; // 0=primary, 1=alternative
  avoidanceProfile: RouteAvoidanceProfile;
  isNavigating: boolean;
}

interface RoutingContextValue extends RoutingState {
  calculateRoute: (
    origin: LatLng,
    destination: LatLng,
    originLabel: string,
    destinationLabel: string,
    profile?: RouteAvoidanceProfile
  ) => Promise<void>;
  clearRoute: () => void;
  toggleRoute: () => void;
  setAvoidanceProfile: (profile: RouteAvoidanceProfile) => void;
  startNavigation: () => void;
  stopNavigation: () => void;
}

const RoutingContext = createContext<RoutingContextValue | null>(null);

interface CacheEntry {
  result: RouteCalculationResult;
  expiresAt: number;
}

function makeCacheKey(origin: LatLng, dest: LatLng, profile: RouteAvoidanceProfile): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}|${profile.mode}|${profile.vehicle}`;
}

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

export function RoutingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RoutingState>({
    status: 'idle',
    selectedRouteIndex: 0,
    avoidanceProfile: DEFAULT_AVOIDANCE_PROFILE,
    isNavigating: false,
  });
  const cache = useRef<Map<string, CacheEntry>>(new Map());

  const calculateRoute = useCallback(
    async (
      origin: LatLng,
      destination: LatLng,
      originLabel: string,
      destinationLabel: string,
      profile: RouteAvoidanceProfile = DEFAULT_AVOIDANCE_PROFILE
    ) => {
      log('info', 'routing', 'calculateRoute start', { origin, destination, profile });
      const key = makeCacheKey(origin, destination, profile);
      const cached = cache.current.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        log('info', 'routing', 'route served from cache');
        setState((prev) => ({
          ...prev,
          status: 'success',
          result: cached.result,
          origin,
          originLabel,
          destination,
          destinationLabel,
          selectedRouteIndex: 0,
          avoidanceProfile: profile,
        }));
        return;
      }

      setState((prev) => ({
        ...prev,
        status: 'loading',
        origin,
        originLabel,
        destination,
        destinationLabel,
        avoidanceProfile: profile,
        error: undefined,
      }));

      try {
        const result = await calculateRouteWithBumpAvoidance(origin, destination, profile);
        cache.current.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        log('info', 'routing', 'calculateRoute success', {
          distanceMeters: result.primaryRoute.distanceMeters,
          durationSeconds: result.primaryRoute.durationSeconds,
          speedBumpCount: result.primaryRoute.speedBumpCount,
          hasAlternative: !!result.alternativeRoute,
        });
        setState((prev) => ({
          ...prev,
          status: 'success',
          result,
          selectedRouteIndex: 0,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Route calculation failed';
        log('error', 'routing', 'calculateRoute failed', { message });
        setState((prev) => ({
          ...prev,
          status: 'error',
          error: message,
        }));
      }
    },
    []
  );

  const clearRoute = useCallback(() => {
    setState({
      status: 'idle',
      selectedRouteIndex: 0,
      avoidanceProfile: DEFAULT_AVOIDANCE_PROFILE,
      isNavigating: false,
    });
  }, []);

  const toggleRoute = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedRouteIndex: prev.selectedRouteIndex === 0 ? 1 : 0,
    }));
  }, []);

  const setAvoidanceProfile = useCallback((profile: RouteAvoidanceProfile) => {
    setState((prev) => ({ ...prev, avoidanceProfile: profile }));
  }, []);

  const startNavigation = useCallback(() => {
    setState((prev) => ({ ...prev, isNavigating: true }));
  }, []);

  const stopNavigation = useCallback(() => {
    setState((prev) => ({ ...prev, isNavigating: false }));
  }, []);

  return (
    <RoutingContext.Provider
      value={{ ...state, calculateRoute, clearRoute, toggleRoute, setAvoidanceProfile, startNavigation, stopNavigation }}
    >
      {children}
    </RoutingContext.Provider>
  );
}

export function useRouting(): RoutingContextValue {
  const ctx = useContext(RoutingContext);
  if (!ctx) throw new Error('useRouting must be used within RoutingProvider');
  return ctx;
}

/** Returns the currently selected AppRoute (primary or alternative). */
export function useSelectedRoute() {
  const { result, selectedRouteIndex } = useRouting();
  if (!result) return undefined;
  return selectedRouteIndex === 1 && result.alternativeRoute
    ? result.alternativeRoute
    : result.primaryRoute;
}
