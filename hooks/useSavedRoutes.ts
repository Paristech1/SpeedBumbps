'use client';

import { useState, useCallback, useEffect } from 'react';
import type { LatLng, RouteAvoidanceProfile } from '@/types/speedbumps';
import { SAVED_ROUTES_STORAGE_KEY, type SavedRoute } from '@/types/user-data';

/** Same 5-decimal key format as RoutingContext's route cache. */
function makeRouteKey(origin: LatLng, dest: LatLng, profile: RouteAvoidanceProfile): string {
  return `${origin.lat.toFixed(5)},${origin.lng.toFixed(5)}|${dest.lat.toFixed(5)},${dest.lng.toFixed(5)}|${profile.mode}|${profile.vehicle}`;
}

/**
 * Hook for managing saved routes with localStorage persistence.
 */
export function useSavedRoutes() {
  const [savedRoutes, setSavedRoutes] = useState<SavedRoute[]>([]);

  // localStorage hydration must happen post-mount (SSR renders defaults first)
  useEffect(() => {
    try {
      const stored = localStorage.getItem(SAVED_ROUTES_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setSavedRoutes(JSON.parse(stored) as SavedRoute[]);
    } catch (error) {
      console.error('Failed to load saved routes from localStorage:', error);
    }
  }, []);

  const persist = useCallback((routes: SavedRoute[]) => {
    try {
      localStorage.setItem(SAVED_ROUTES_STORAGE_KEY, JSON.stringify(routes));
    } catch (error) {
      console.error('Failed to save routes to localStorage:', error);
    }
  }, []);

  const saveRoute = useCallback(
    (input: Omit<SavedRoute, 'id' | 'createdAt'>): SavedRoute => {
      const route: SavedRoute = {
        ...input,
        id: `route-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        createdAt: Date.now(),
      };
      setSavedRoutes((prev) => {
        const next = [route, ...prev];
        persist(next);
        return next;
      });
      return route;
    },
    [persist]
  );

  const deleteRoute = useCallback(
    (id: string) => {
      setSavedRoutes((prev) => {
        const next = prev.filter((r) => r.id !== id);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const isRouteSaved = useCallback(
    (origin: LatLng, dest: LatLng, profile: RouteAvoidanceProfile): boolean => {
      const key = makeRouteKey(origin, dest, profile);
      return savedRoutes.some((r) => makeRouteKey(r.origin, r.destination, r.profile) === key);
    },
    [savedRoutes]
  );

  return { savedRoutes, saveRoute, deleteRoute, isRouteSaved };
}
