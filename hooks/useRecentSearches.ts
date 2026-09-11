'use client';

import { useState, useCallback, useEffect } from 'react';
import type { GeocodingResult } from '@/types/speedbumps';
import { RECENT_SEARCHES_STORAGE_KEY, type RecentDestination } from '@/types/user-data';

const MAX_RECENTS = 8;

/** Two results are the same place if they land within ~10 m of each other. */
function samePlace(a: GeocodingResult, b: GeocodingResult): boolean {
  return (
    Math.abs(a.location.lat - b.location.lat) < 0.0001 &&
    Math.abs(a.location.lng - b.location.lng) < 0.0001
  );
}

/**
 * Recently chosen destinations, most recent first (localStorage).
 * Lets the planner skip geocoding for places the user goes back to.
 */
export function useRecentSearches() {
  const [recents, setRecents] = useState<RecentDestination[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setRecents(JSON.parse(stored) as RecentDestination[]);
    } catch (error) {
      console.error('Failed to load recent searches:', error);
    }
  }, []);

  const persist = useCallback((next: RecentDestination[]) => {
    try {
      localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.error('Failed to save recent searches:', error);
    }
  }, []);

  const addRecent = useCallback(
    (result: GeocodingResult) => {
      setRecents((prev) => {
        const next: RecentDestination[] = [
          { ...result, usedAt: Date.now() },
          ...prev.filter((r) => !samePlace(r, result)),
        ].slice(0, MAX_RECENTS);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeRecent = useCallback(
    (result: GeocodingResult) => {
      setRecents((prev) => {
        const next = prev.filter((r) => !samePlace(r, result));
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearRecents = useCallback(() => {
    setRecents([]);
    persist([]);
  }, [persist]);

  return { recents, addRecent, removeRecent, clearRecents };
}
