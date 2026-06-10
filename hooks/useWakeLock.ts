'use client';

/**
 * Screen Wake Lock — keeps the display on while navigating.
 * Web apps get no GPS or speech once the screen locks, so this is
 * required for turn-by-turn use. Locks auto-release when the page is
 * hidden and must be re-acquired on visibilitychange (per spec).
 * Supported iOS Safari 16.4+ / Chrome 84+; silently no-ops elsewhere.
 */

import { useEffect, useRef } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void> } | null;

export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike>(null);

  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let cancelled = false;

    const request = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          sentinel.release().catch(() => {});
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // refused (e.g. low battery, hidden page) — navigation still works
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') request();
    };

    request();
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [active]);
}
