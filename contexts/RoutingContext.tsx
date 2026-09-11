'use client';

/**
 * Routing state management.
 * Includes a 15-minute result cache keyed by origin+destination+profile;
 * the cache is dropped whenever the user's reported bumps change.
 */

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type {
  LatLng,
  RouteCalculationResult,
  RouteAvoidanceProfile,
} from '@/types/speedbumps';
import { DEFAULT_AVOIDANCE_PROFILE } from '@/types/speedbumps';
import { calculateRouteWithBumpAvoidance } from '@/lib/bump-avoidance';
import { USER_REPORTS_CHANGED_EVENT } from '@/lib/speed-bump-service';
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
  /** Sticky user choice: pick the fewer-bumps route whenever one is offered. */
  preferFewerBumps: boolean;
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
  /** Recalculate the active route from a new position (e.g. after leaving the route). */
  rerouteFrom: (current: LatLng) => Promise<void>;
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

function pickIndex(result: RouteCalculationResult, preferFewerBumps: boolean): 0 | 1 {
  return preferFewerBumps && result.alternativeRoute ? 1 : 0;
}

export function RoutingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RoutingState>({
    status: 'idle',
    selectedRouteIndex: 0,
    preferFewerBumps: false,
    avoidanceProfile: DEFAULT_AVOIDANCE_PROFILE,
    isNavigating: false,
  });
  const cache = useRef<Map<string, CacheEntry>>(new Map());
  // Monotonic request id so a slow, superseded request can't overwrite a newer result
  const requestSeq = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  // A new or deleted user report changes what counts as a bump — drop cached routes
  useEffect(() => {
    const invalidate = () => cache.current.clear();
    window.addEventListener(USER_REPORTS_CHANGED_EVENT, invalidate);
    return () => window.removeEventListener(USER_REPORTS_CHANGED_EVENT, invalidate);
  }, []);

  const calculateRoute = useCallback(
    async (
      origin: LatLng,
      destination: LatLng,
      originLabel: string,
      destinationLabel: string,
      profile: RouteAvoidanceProfile = stateRef.current.avoidanceProfile
    ) => {
      log('info', 'routing', 'calculateRoute start', { origin, destination, profile });
      const seq = ++requestSeq.current;
      const key = makeCacheKey(origin, destination, profile);
      const cached = cache.current.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        log('info', 'routing', 'route served from cache');
        setState((prev) => ({
          ...prev,
          status: 'success',
          result: cached.result,
          error: undefined,
          origin,
          originLabel,
          destination,
          destinationLabel,
          selectedRouteIndex: pickIndex(cached.result, prev.preferFewerBumps),
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
        if (seq !== requestSeq.current) return; // superseded
        cache.current.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        log('info', 'routing', 'calculateRoute success', {
          distanceMeters: result.primaryRoute.distanceMeters,
          durationSeconds: result.primaryRoute.durationSeconds,
          speedBumpCount: result.primaryRoute.speedBumpCount,
          hasAlternative: !!result.alternativeRoute,
          altSpeedBumpCount: result.alternativeRoute?.speedBumpCount,
        });
        setState((prev) => ({
          ...prev,
          status: 'success',
          result,
          selectedRouteIndex: pickIndex(result, prev.preferFewerBumps),
        }));
      } catch (err) {
        if (seq !== requestSeq.current) return;
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

  const rerouteFrom = useCallback(
    async (current: LatLng) => {
      const { destination, destinationLabel, avoidanceProfile } = stateRef.current;
      if (!destination) return;
      await calculateRoute(
        current,
        destination,
        'Current location',
        destinationLabel ?? 'Destination',
        avoidanceProfile
      );
    },
    [calculateRoute]
  );

  const clearRoute = useCallback(() => {
    requestSeq.current++; // cancel any in-flight calculation
    setState((prev) => ({
      status: 'idle',
      selectedRouteIndex: 0,
      preferFewerBumps: prev.preferFewerBumps,
      avoidanceProfile: prev.avoidanceProfile, // keep the user's profile default
      isNavigating: false,
    }));
  }, []);

  const toggleRoute = useCallback(() => {
    setState((prev) => {
      const next: 0 | 1 = prev.selectedRouteIndex === 0 ? 1 : 0;
      return { ...prev, selectedRouteIndex: next, preferFewerBumps: next === 1 };
    });
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
      value={{
        ...state,
        calculateRoute,
        rerouteFrom,
        clearRoute,
        toggleRoute,
        setAvoidanceProfile,
        startNavigation,
        stopNavigation,
      }}
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
