'use client';

import { useCallback } from 'react';
import { useLeafletMap } from './useLeafletMap';

/**
 * Hook for controlling map zoom and fullscreen
 */
export function useMapControls() {
    const map = useLeafletMap();

    const zoomIn = useCallback(() => {
        if (map) {
            map.zoomIn();
        }
    }, [map]);

    const zoomOut = useCallback(() => {
        if (map) {
            map.zoomOut();
        }
    }, [map]);

    // Explicit enter/exit rather than one toggle: the caller already knows which
    // way it is going, and a toggle that reads the document can disagree with it.
    const enterFullscreen = useCallback(() => {
        const doc = document as Document & { webkitFullscreenElement?: Element | null };
        if (document.fullscreenElement || doc.webkitFullscreenElement) return;
        const root = document.documentElement as HTMLElement & {
            webkitRequestFullscreen?: () => void;
        };
        // A rejected request (user gesture lost, iframe without allowfullscreen)
        // must not take the page down with it — immersive still works without it.
        try {
            const result = root.requestFullscreen?.() ?? (root.webkitRequestFullscreen?.(), undefined);
            if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch {
            // no fullscreen; the chrome is hidden either way
        }
    }, []);

    const exitFullscreen = useCallback(() => {
        const doc = document as Document & {
            webkitFullscreenElement?: Element | null;
            webkitExitFullscreen?: () => void;
        };
        if (!document.fullscreenElement && !doc.webkitFullscreenElement) return;
        try {
            const result = document.exitFullscreen?.() ?? (doc.webkitExitFullscreen?.(), undefined);
            if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch {
            // already out
        }
    }, []);

    const toggleFullscreen = useCallback(() => {
        const doc = document as Document & { webkitFullscreenElement?: Element | null };
        if (document.fullscreenElement || doc.webkitFullscreenElement) exitFullscreen();
        else enterFullscreen();
    }, [enterFullscreen, exitFullscreen]);

    const isFullscreenAvailable = useCallback(() => {
        const root = document.documentElement as HTMLElement & {
            webkitRequestFullscreen?: () => void;
        };
        return !!(root.requestFullscreen || root.webkitRequestFullscreen);
    }, []);

    const resetView = useCallback(() => {
        if (map) {
            // Reset to Philadelphia default view
            map.setView([40.0094, -75.2194], 15);
        }
    }, [map]);

    return {
        zoomIn,
        zoomOut,
        enterFullscreen,
        exitFullscreen,
        toggleFullscreen,
        isFullscreenAvailable,
        resetView,
        map,
    };
}
