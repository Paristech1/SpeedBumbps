"use client";

/**
 * Static UI preview: destination set, route accepted, following navigation.
 * Open /demo/active-navigation — no geolocation or routing APIs required.
 */

import { useState, useCallback } from "react";
import { Navigation, X, ArrowBigUp } from "lucide-react";
import { RouteResultCard, ROUTE_SHEET_SNAP_POINTS } from "@/components/map/RouteResultCard";
import type { RouteCalculationResult } from "@/types/speedbumps";

const DEMO_RESULT: RouteCalculationResult = {
  primaryRoute: {
    id: "demo-primary",
    polylinePoints: [],
    steps: [
      {
        instruction: "Head northeast on South St toward S 6th St",
        distanceMeters: 400,
        durationSeconds: 90,
        location: { lat: 39.942, lng: -75.155 },
      },
      {
        instruction: "Turn right onto S Broad St",
        distanceMeters: 1200,
        durationSeconds: 180,
        location: { lat: 39.948, lng: -75.162 },
      },
      {
        instruction: "Turn left onto Walnut St",
        distanceMeters: 2100,
        durationSeconds: 300,
        location: { lat: 39.949, lng: -75.175 },
      },
      {
        instruction: "Arrive at Reading Terminal Market, Philadelphia",
        distanceMeters: 0,
        durationSeconds: 0,
        location: { lat: 39.9538, lng: -75.159 },
      },
    ],
    distanceMeters: 4200,
    durationSeconds: 780,
    speedBumpCount: 3,
    isSpeedBumpFree: false,
    bumpsOnRoute: [
      { id: "demo-bump-1", location: { lat: 39.946, lng: -75.159 }, severity: 2, isVerified: true, source: "dataset" },
      { id: "demo-bump-2", location: { lat: 39.948, lng: -75.168 }, severity: 4, isVerified: true, source: "dataset" },
      { id: "demo-bump-3", location: { lat: 39.949, lng: -75.172 }, severity: 1, isVerified: true, source: "dataset" },
    ],
    calculatedAt: new Date(),
  },
  alternativeRoute: {
    id: "demo-alt",
    polylinePoints: [],
    bumpsOnRoute: [],
    steps: [
      {
        instruction: "Head north on S 9th St",
        distanceMeters: 800,
        durationSeconds: 120,
        location: { lat: 39.942, lng: -75.155 },
      },
      {
        instruction: "Arrive at Reading Terminal Market, Philadelphia",
        distanceMeters: 0,
        durationSeconds: 0,
        location: { lat: 39.9538, lng: -75.159 },
      },
    ],
    distanceMeters: 5100,
    durationSeconds: 920,
    speedBumpCount: 0,
    isSpeedBumpFree: true,
    calculatedAt: new Date(),
  },
};

export default function ActiveNavigationDemoPage() {
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<0 | 1>(0);
  const [sheetSnap, setSheetSnap] = useState<number | string | null>(ROUTE_SHEET_SNAP_POINTS[1]);

  const onToggleRoute = useCallback(() => {
    setSelectedRouteIndex((i) => (i === 0 ? 1 : 0));
  }, []);

  const onClearRoute = useCallback(() => {
    setSelectedRouteIndex(0);
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-slate-200 dark:bg-gray-950">
      {/* Map-like backdrop (tiles + soft tint) */}
      <div
        className="absolute inset-0 opacity-40 dark:opacity-25"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgb(148 163 184 / 0.35) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(148 163 184 / 0.35) 1px, transparent 1px)
          `,
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-emerald-100/50 via-transparent to-sky-100/40 dark:from-emerald-950/30 dark:to-sky-950/20 pointer-events-none" />

      {/* Demo label + where to try the real app */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1300] flex flex-col items-center gap-1 text-center">
        <div className="px-3 py-1 rounded-full bg-black/60 text-white text-xs font-medium backdrop-blur-sm">
          Demo preview — static screen
        </div>
        <p className="text-[11px] text-gray-700 dark:text-gray-300 max-w-md px-2 drop-shadow-sm">
          Live map: <span className="font-mono">/</span> or <span className="font-mono">/map</span>
          {" — "}
          uses GPS and routing
        </p>
      </div>

      {/* Same top bar as MapMain when a route is active */}
      <div className="absolute left-0 right-0 sm:left-4 sm:right-auto top-12 z-[1001] px-4 sm:px-0">
        <div className="flex items-center gap-2 bg-white dark:bg-gray-700/90 backdrop-blur px-4 py-3 shadow-lg rounded-full w-full sm:w-[360px]">
          <Navigation className="w-5 h-5 text-blue-500 shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
              My Location → Reading Terminal Market
            </div>
          </div>
          <button
            type="button"
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full opacity-50 cursor-not-allowed"
            aria-label="Clear route (disabled in demo)"
            disabled
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Represents “navigation is guiding you” (not in live map yet as a persistent strip) */}
      <div className="absolute left-4 right-4 top-[7.25rem] sm:top-28 z-[1040]">
        <div className="rounded-2xl bg-white/95 dark:bg-gray-800/95 backdrop-blur-md shadow-lg border border-gray-200/80 dark:border-gray-600 px-4 py-3 flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <ArrowBigUp className="h-6 w-6" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
              Next turn
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-50 leading-snug">
              In 800 ft, turn right onto S Broad St
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Then continue toward Walnut St — route is live on the map
            </div>
          </div>
        </div>
      </div>

      {/* Real route card from the app */}
      <RouteResultCard
        result={DEMO_RESULT}
        selectedRouteIndex={selectedRouteIndex}
        onToggleRoute={onToggleRoute}
        onClearRoute={onClearRoute}
        onStartNavigation={() => {}}
        onSaveRoute={() => {}}
        isRouteSaved={false}
        snap={sheetSnap}
        onSnapChange={setSheetSnap}
      />
    </div>
  );
}
