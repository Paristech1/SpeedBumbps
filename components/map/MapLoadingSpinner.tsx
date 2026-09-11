"use client";

import { useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MapContext } from "@/contexts/MapContext";

/**
 * MapLoadingSpinner component - Loading overlay during map initialization
 * Velocity Dark glass styling with smooth exit fade.
 */
export function MapLoadingSpinner() {
  const context = useContext(MapContext);

  if (!context) {
    throw new Error("MapLoadingSpinner must be used within a MapProvider");
  }

  const { isReady } = context;

  return (
    <AnimatePresence>
      {!isReady && (
        <motion.div
          key="map-loader"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="absolute inset-0 flex items-center justify-center bg-sb-background/85 backdrop-blur-md z-40"
        >
          <div className="flex flex-col items-center gap-4">
            {/* Animated spinner */}
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 border-4 border-sb-surface-container-highest rounded-full" />
              <div className="absolute inset-0 border-4 border-transparent border-t-[#2196F3] border-l-[#00BCD4] rounded-full animate-spin" />
            </div>

            {/* Loading text */}
            <p className="text-sm font-semibold tracking-wide text-sb-on-surface-variant animate-pulse font-[var(--font-headline)]">
              Loading Philly Navigator…
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
