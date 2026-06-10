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

    const toggleFullscreen = useCallback(() => {
        const doc = document as Document & {
            webkitFullscreenElement?: Element | null;
            webkitExitFullscreen?: () => void;
        };
        const root = document.documentElement as HTMLElement & {
            webkitRequestFullscreen?: () => void;
        };
        if (!document.fullscreenElement && !doc.webkitFullscreenElement) {
            if (root.requestFullscreen) {
                root.requestFullscreen();
            } else {
                root.webkitRequestFullscreen?.();
            }
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        } else {
            doc.webkitExitFullscreen?.();
        }
    }, []);

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
        toggleFullscreen,
        isFullscreenAvailable,
        resetView,
        map,
    };
}
