"use client";

import { memo, useState, useEffect } from "react";
import { Plus, Minus, Maximize2, Minimize2 } from "lucide-react";
import { useMapControls } from "@/hooks/useMapControls";
import { useGeolocation } from "@/hooks/useGeolocation";

/**
 * MapControls — Velocity Dark glass-panel controls at bottom right.
 * Includes: Location, Zoom In/Out, Reset View, Fullscreen
 *
 * Design: Glass-panel containers with ghost-borders per the
 * Kinetic Luminescence design spec.
 */
export const MapControls = memo(function MapControls() {
  const { map, zoomIn, zoomOut, toggleFullscreen, resetView } =
    useMapControls();
  const { locateUser, isLocating, isAvailable } = useGeolocation();
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  return (
    <div className="absolute bottom-32 sm:bottom-32 right-6 flex flex-col items-center gap-3 z-[1000]">
      {/* Zoom Controls — Glass container with ghost border */}
      <div className="glass-panel flex flex-col rounded-2xl shadow-2xl ghost-border overflow-hidden">
        <button
          onClick={zoomIn}
          disabled={!map}
          className="p-4 hover:bg-[#373940] text-[#e2e2eb] transition-colors border-b border-[#404752]/15 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Zoom In"
          aria-label="Zoom in"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          onClick={zoomOut}
          disabled={!map}
          className="p-4 hover:bg-[#373940] text-[#e2e2eb] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        className={`glass-panel w-14 h-14 rounded-full flex items-center justify-center text-[#9ecaff] shadow-2xl ghost-border hover:bg-[#9ecaff]/10 active:scale-90 transition-all ${
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
        className="glass-panel w-14 h-14 rounded-full flex items-center justify-center text-[#e2e2eb] shadow-2xl ghost-border hover:bg-[#373940] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Fullscreen */}
      <button
        onClick={toggleFullscreen}
        className="glass-panel w-14 h-14 rounded-full flex items-center justify-center text-[#e2e2eb] shadow-2xl ghost-border hover:bg-[#373940] transition-all"
        title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? (
          <Minimize2 className="h-5 w-5" />
        ) : (
          <Maximize2 className="h-5 w-5" />
        )}
      </button>
    </div>
  );
});

MapControls.displayName = "MapControls";
