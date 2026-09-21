'use client';

/**
 * How many bumps sit within a radius of the driver — the line screen 02 ends
 * on ("14 bumps within 1 mi."). The dataset is cached by the bump service, and
 * the count only recomputes when the driver has actually moved a block or so.
 */

import { useEffect, useState } from 'react';
import { loadAllBumps, USER_REPORTS_CHANGED_EVENT } from '@/lib/speed-bump-service';
import { haversineDistance } from '@/lib/geo-utils';
import type { LatLng } from '@/types/speedbumps';

/** One mile, the radius the caption quotes. */
export const NEARBY_RADIUS_M = 1609;

export function useNearbyBumpCount(location: LatLng | null, radiusMeters = NEARBY_RADIUS_M): number | null {
  const [count, setCount] = useState<number | null>(null);

  // Round the fix so a jittering GPS doesn't re-run the scan every tick.
  const key = location ? `${location.lat.toFixed(3)},${location.lng.toFixed(3)}` : null;

  useEffect(() => {
    if (!key) return;
    const [lat, lng] = key.split(',').map(Number);
    let mounted = true;

    const count = async () => {
      try {
        const bumps = await loadAllBumps();
        if (!mounted) return;
        setCount(bumps.filter((b) => haversineDistance({ lat, lng }, b.location) <= radiusMeters).length);
      } catch {
        // No data yet — the caption simply stays hidden.
      }
    };

    count();
    window.addEventListener(USER_REPORTS_CHANGED_EVENT, count);
    return () => {
      mounted = false;
      window.removeEventListener(USER_REPORTS_CHANGED_EVENT, count);
    };
  }, [key, radiusMeters]);

  return count;
}
