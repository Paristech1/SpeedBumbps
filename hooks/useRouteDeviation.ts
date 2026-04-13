'use client';

/**
 * Route deviation detection.
 * Ported from Flutter: map_screen.dart _handleLocationUpdate() logic.
 *
 * Triggers route recalculation if user deviates >100m from active route for >5 seconds.
 * 30-second cooldown between recalculations.
 */

import { useEffect, useRef, useCallback } from 'react';
import type { LatLng } from '@/types/speedbumps';
import { distanceToLineSegment } from '@/lib/geo-utils';

const DEVIATION_THRESHOLD_METERS = 100; // bumped from 80m (web GPS less accurate than native)
const DEVIATION_DURATION_MS = 5000;    // must deviate for 5+ seconds
const RECALC_COOLDOWN_MS = 30000;      // 30-second cooldown

interface UseRouteDeviationOptions {
  routePoints: LatLng[] | null;
  currentLocation: LatLng | null;
  onDeviated: () => void;
}

export function useRouteDeviation({
  routePoints,
  currentLocation,
  onDeviated,
}: UseRouteDeviationOptions) {
  const deviationStartRef = useRef<number | null>(null);
  const lastRecalcRef = useRef<number>(0);

  const checkDeviation = useCallback(
    (location: LatLng, points: LatLng[]) => {
      if (points.length < 2) return;

      // Find minimum distance to any route segment
      let minDist = Infinity;
      for (let i = 0; i < points.length - 1; i++) {
        const d = distanceToLineSegment(location, points[i], points[i + 1]);
        if (d < minDist) minDist = d;
      }

      const now = Date.now();
      if (minDist > DEVIATION_THRESHOLD_METERS) {
        if (deviationStartRef.current === null) {
          deviationStartRef.current = now;
        } else if (
          now - deviationStartRef.current >= DEVIATION_DURATION_MS &&
          now - lastRecalcRef.current >= RECALC_COOLDOWN_MS
        ) {
          lastRecalcRef.current = now;
          deviationStartRef.current = null;
          onDeviated();
        }
      } else {
        deviationStartRef.current = null;
      }
    },
    [onDeviated]
  );

  useEffect(() => {
    if (!currentLocation || !routePoints || routePoints.length === 0) return;
    checkDeviation(currentLocation, routePoints);
  }, [currentLocation, routePoints, checkDeviation]);
}
