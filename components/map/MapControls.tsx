"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Plus, Minus, Maximize2, Minimize2, LocateFixed, RotateCcw } from "lucide-react";
import { useMapControls } from "@/hooks/useMapControls";
import { useGeolocation } from "@/hooks/useGeolocation";

/**
 * MapControls — one slim glass rail at bottom right: locate, layers, full
 * screen. Zoom and reset view join it on wider screens with a pointer.
 */
interface MapControlsProps {
  /** Distance in px from the viewport bottom (clears bottom nav / open sheets). */
  bottomOffset?: number;
  /** Fade out (e.g. when a sheet covers most of the screen). */
  hidden?: boolean;
  /** Immersive mode strips every overlay off the map. */
  isImmersive?: boolean;
  onImmersiveChange?: (next: boolean) => void;
  /** Extra rail buttons (the layer picker), set between locate and full screen. */
  children?: React.ReactNode;
}

export const MapControls = memo(function MapControls({
  bottomOffset = 128,
  hidden = false,
  isImmersive = false,
  onImmersiveChange,
  children,
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

  const railBtn =
    "w-11 h-11 flex items-center justify-center text-[#B6BECB] hover:text-[#E6EAF0] transition-colors active:bg-[var(--nv-wash-strong)] disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div
      // Same reason as before: the gaps around the rail are open map, and a
      // column that takes the pointer along its whole height eats drags that
      // start there.
      className={`absolute right-4 flex flex-col items-end gap-2 z-[1000] pointer-events-none transition-[bottom,opacity] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
        hidden ? "opacity-0" : "[&>*]:pointer-events-auto"
      }`}
      style={{ bottom: bottomOffset }}
    >
      {/* Zoom and reset only where there's a pointer to want them; on a phone
          the fingers do both. */}
      <div className="hidden sm:flex flex-col nv-glass rounded-full overflow-hidden">
        <button onClick={zoomIn} disabled={!map} className={`${railBtn} nv-hairline-b`} title="Zoom In" aria-label="Zoom in">
          <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <button onClick={zoomOut} disabled={!map} className={`${railBtn} nv-hairline-b`} title="Zoom Out" aria-label="Zoom out">
          <Minus className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        <button onClick={resetView} disabled={!map} className={railBtn} title="Reset View" aria-label="Reset view to default">
          <RotateCcw className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
      </div>

      {/* The rail: one glass capsule, hairlines between, nothing filled. */}
      <div className="flex flex-col nv-glass rounded-full">
        <button
          onClick={locateUser}
          disabled={!isAvailable || isLocating}
          className={`${railBtn} rounded-t-full nv-hairline-b ${isLocating ? "animate-pulse" : ""}`}
          title="My Location"
          aria-label="Find my location"
        >
          <LocateFixed className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </button>
        {children && <div className="nv-hairline-b">{children}</div>}
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
          className={`${railBtn} rounded-b-full ${isImmersive ? "text-[#E6EAF0]" : ""}`}
          title={isImmersive ? "Exit full screen" : "Full screen"}
          aria-label={isImmersive ? "Exit full screen" : "Full screen"}
        >
          {isImmersive || isFullscreen ? (
            <Minimize2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          ) : (
            <Maximize2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          )}
        </button>
      </div>
    </div>
  );
});

MapControls.displayName = "MapControls";
