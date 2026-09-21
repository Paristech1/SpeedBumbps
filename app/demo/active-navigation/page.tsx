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
        polylineIndex: 0,
      },
      {
        instruction: "Turn right onto S Broad St",
        distanceMeters: 1200,
        durationSeconds: 180,
        location: { lat: 39.948, lng: -75.162 },
        polylineIndex: 0,
      },
      {
        instruction: "Turn left onto Walnut St",
        distanceMeters: 2100,
        durationSeconds: 300,
        location: { lat: 39.949, lng: -75.175 },
        polylineIndex: 0,
      },
      {
        instruction: "Arrive at Reading Terminal Market, Philadelphia",
        distanceMeters: 0,
        durationSeconds: 0,
        location: { lat: 39.9538, lng: -75.159 },
        polylineIndex: 0,
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
        polylineIndex: 0,
      },
      {
        instruction: "Arrive at Reading Terminal Market, Philadelphia",
        distanceMeters: 0,
        durationSeconds: 0,
        location: { lat: 39.9538, lng: -75.159 },
        polylineIndex: 0,
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
    <div className="relative h-screen w-full overflow-hidden bg-sb-background">
      {/* Map-like backdrop (tiles + soft tint) */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgb(64 71 82 / 0.35) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(64 71 82 / 0.35) 1px, transparent 1px)
          `,
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-sb-primary/10 via-transparent to-sb-secondary/10 pointer-events-none" />

      {/* Demo label + where to try the real app */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1300] flex flex-col items-center gap-1 text-center">
        <div className="px-3 py-2 rounded-full nv-glass kicker">
          Demo preview
        </div>
        <p className="ui-sm text-[#5B6E7F] max-w-md px-2">
          Live map: <span className="font-mono text-sb-primary">/</span> or <span className="font-mono text-sb-primary">/map</span>
          {" — "}
          uses GPS and routing
        </p>
      </div>

      {/* Same top bar as MapMain when a route is active */}
      <div className="absolute left-0 right-0 sm:left-4 sm:right-auto top-12 z-[1001] px-4 sm:px-0">
        <div className="flex items-center gap-2 nv-glass px-5 py-4 rounded-full w-full sm:w-[360px]">
          <Navigation className="w-5 h-5 text-[#B6BECB] shrink-0" aria-hidden />
          <div className="flex-1 min-w-0">
            <div className="ui-text text-[#E6EAF0] truncate">
              My Location → Reading Terminal Market
            </div>
          </div>
          <button
            type="button"
            className="p-1 rounded-full opacity-50 cursor-not-allowed"
            aria-label="Clear route (disabled in demo)"
            disabled
          >
            <X className="w-4 h-4 text-[#5B6E7F]" />
          </button>
        </div>
      </div>

      {/* Represents “navigation is guiding you” (not in live map yet as a persistent strip) */}
      <div className="absolute left-4 right-4 top-[7.25rem] sm:top-28 z-[1040]">
        <div className="nv-frame nv-glass rounded-[22px] px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <p className="kicker">In 200 ft</p>
            <ArrowBigUp className="h-5 w-5 text-[#B6BECB]" strokeWidth={2} aria-hidden />
          </div>
          <h1 className="mast mast-1 text-[#E6EAF0] mt-2">East</h1>
          <p className="ui-text lowercase text-[#B6BECB] mt-2">on market st toward n 12th st</p>
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
