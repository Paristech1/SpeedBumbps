"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Plus, Minus, Maximize2, Minimize2 } from "lucide-react";
import { useMapControls } from "@/hooks/useMapControls";
import { useGeolocation } from "@/hooks/useGeolocation";

/**
 * MapControls — Nocturne glass controls at bottom right.
 * Includes: Location, Zoom In/Out, Reset View, Fullscreen
 *
 * Design: Glass-panel containers with ghost-borders per the
 * Nocturne Velocity design spec.
 */
interface MapControlsProps {
  /** Distance in px from the viewport bottom (clears bottom nav / open sheets). */
  bottomOffset?: number;
  /** Fade out (e.g. when a sheet covers most of the screen). */
  hidden?: boolean;
  /** Immersive mode strips every overlay off the map. */
  isImmersive?: boolean;
  onImmersiveChange?: (next: boolean) => void;
}

export const MapControls = memo(function MapControls({
  bottomOffset = 128,
  hidden = false,
  isImmersive = false,
  onImmersiveChange,
}: MapControlsProps) {
  const { map, zoomIn, zoomOut, enterFullscreen, exitFullscreen, isFullscreenAvailable, resetView } =
    useMapControls();
  const { locateUser, isLocating, isAvailable } = useGeolocation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const onImmersiveChangeRef = useRef(onImmersiveChange);
  useEffect(() => {
    onImmersiveChangeRef.current = onImmersiveChange;
  }, [onImmersiveChange]);

  // Track real fullscreen so leaving it by Escape or the system gesture also
  // leaves immersive — otherwise the chrome stays hidden with no way back.
  useEffect(() => {
    // capability detection must run post-mount (SSR can't know the browser)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanFullscreen(isFullscreenAvailable());
    const handleFullscreenChange = () => {
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      const on = !!(document.fullscreenElement || doc.webkitFullscreenElement);
      setIsFullscreen(on);
      if (!on) onImmersiveChangeRef.current?.(false);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
    };
  }, [isFullscreenAvailable]);

  return (
    <div
      // Same reason as the tile switcher: the gaps between these buttons are
      // open map, and a column that takes the pointer along its whole height
      // eats drags that start there.
      className={`absolute right-6 flex flex-col items-center gap-3 z-[1000] pointer-events-none transition-[bottom,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        hidden ? "opacity-0" : "[&>*]:pointer-events-auto"
      }`}
      style={{ bottom: bottomOffset }}
    >
      {/* Zoom Controls — Glass container with ghost border */}
      <div className="glass-panel flex flex-col rounded-2xl shadow-2xl ghost-border overflow-hidden">
        <button
          onClick={zoomIn}
          disabled={!map}
          className="p-4 hover:bg-white/5 text-[#B6BECB] hover:text-[#E6EAF0] transition-colors nv-hairline-b disabled:opacity-50 disabled:cursor-not-allowed"
          title="Zoom In"
          aria-label="Zoom in"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          onClick={zoomOut}
          disabled={!map}
          className="p-4 hover:bg-white/5 text-[#B6BECB] hover:text-[#E6EAF0] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Zoom Out"
          aria-label="Zoom out"
        >
          <Minus className="h-5 w-5" />
        </button>
      </div>

      {/* My Location — Circular glass button with neon accent */}
      <button
        onClick={locateUser}
        disabled={!isAvailable || isLocating}
        className={`glass-panel w-14 h-14 rounded-full flex items-center justify-center text-[#B6BECB] ghost-border hover:bg-white/5 active:scale-90 transition-all ${
          isLocating ? "animate-pulse-glow" : ""
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        title="My Location"
        aria-label="Find my location"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" />
        </svg>
      </button>

      {/* Reset View */}
      <button
        onClick={resetView}
        disabled={!map}
        className="glass-panel w-14 h-14 rounded-full flex items-center justify-center text-[#B6BECB] ghost-border hover:bg-white/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        title="Reset View"
        aria-label="Reset view to default"
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M3 21v-5h5" />
        </svg>
      </button>

      {/* Full screen — one tap takes every overlay off the map, and enters real
          browser fullscreen too where that exists (it doesn't on iPhone Safari,
          where stripping the chrome is the whole of it). Explicit enter/exit
          rather than two independent toggles, so the button and the browser
          can't end up disagreeing about which state we're in. */}
      <button
        onClick={() => {
          const next = !isImmersive;
          onImmersiveChange?.(next);
          if (canFullscreen) {
            if (next) enterFullscreen();
            else exitFullscreen();
          }
        }}
        className={`glass-panel w-14 h-14 rounded-full flex items-center justify-center shadow-2xl ghost-border transition-all active:scale-90 ${
          isImmersive ? "text-[#E6EAF0] bg-[#E6EAF0]/10" : "text-[#E6EAF0] hover:bg-[#0C1416]"
        }`}
        title={isImmersive ? "Exit full screen" : "Full screen"}
        aria-label={isImmersive ? "Exit full screen" : "Full screen"}
      >
        {isImmersive || isFullscreen ? (
          <Minimize2 className="h-5 w-5" />
        ) : (
          <Maximize2 className="h-5 w-5" />
        )}
      </button>
    </div>
  );
});

MapControls.displayName = "MapControls";
