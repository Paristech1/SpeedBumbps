"use client";

import { Ruler, X, Undo, Check, MapPin } from "lucide-react";
import { useMeasurement } from "@/hooks/useMeasurement";
import type { MeasurementMode } from "@/hooks/useMeasurement";
import { useState } from "react";

interface MapMeasurementPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * MapMeasurementPanel - Measurement panel UI
 */
export function MapMeasurementPanel({
  isOpen,
  onClose,
}: MapMeasurementPanelProps) {
  const {
    mode,
    distance,
    area,
    pointCount,
    startMeasurement,
    clearMeasurement,
    undoLastPoint,
    finishMeasurement,
  } = useMeasurement();

  const [lastMeasurement, setLastMeasurement] = useState<{
    type: "distance" | "area";
    value: number;
  } | null>(null);

  const handleModeSelect = (selectedMode: MeasurementMode) => {
    if (mode === selectedMode) {
      clearMeasurement();
    } else {
      startMeasurement(selectedMode);
    }
  };

  const handleClose = () => {
    clearMeasurement();
    setLastMeasurement(null);
    onClose();
  };

  const handleClear = () => {
    clearMeasurement();
    setLastMeasurement(null);
  };

  const handleFinish = () => {
    // Save the last measurement before finishing
    if (mode === "distance" && pointCount > 1) {
      setLastMeasurement({ type: "distance", value: distance });
    } else if (mode === "area" && pointCount > 2) {
      setLastMeasurement({ type: "area", value: area });
    }
    finishMeasurement();
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${meters.toFixed(2)} m`;
    }
    return `${(meters / 1000).toFixed(2)} km`;
  };

  const formatArea = (squareMeters: number): string => {
    if (squareMeters < 10000) {
      return `${squareMeters.toFixed(2)} m²`;
    } else if (squareMeters < 1000000) {
      return `${(squareMeters / 10000).toFixed(2)} ha`;
    }
    return `${(squareMeters / 1000000).toFixed(2)} km²`;
  };

  if (!isOpen) return null;

  return (
    <div className="absolute bottom-[max(5.5rem,calc(env(safe-area-inset-bottom)+4.5rem))] sm:bottom-6 left-0 right-0 z-[1000] pointer-events-none">
      <div className="flex justify-center pb-4 px-4">
        <div className="flex flex-col gap-1 bg-sb-surface-container-high/95 backdrop-blur-md rounded-2xl shadow-2xl border border-sb-outline-variant/30 pointer-events-auto">
          {/* Top: Mode Tabs */}
          <div className="flex items-center gap-1 p-1.5 border-b border-sb-outline-variant/20">
            <button
              onClick={() => handleModeSelect("distance")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                mode === "distance"
                  ? "bg-sb-primary/20 ring-2 ring-sb-primary text-sb-primary"
                  : "text-sb-on-surface-variant hover:bg-sb-surface-container-highest"
              }`}
              title="Distance"
            >
              <Ruler className="h-4 w-4" />
              <span className="text-xs font-semibold font-[var(--font-headline)]">
                Distance
              </span>
            </button>

            <button
              onClick={() => handleModeSelect("area")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl transition-all ${
                mode === "area"
                  ? "bg-sb-tertiary/20 ring-2 ring-sb-tertiary text-sb-tertiary"
                  : "text-sb-on-surface-variant hover:bg-sb-surface-container-highest"
              }`}
              title="Area"
            >
              <MapPin className="h-4 w-4" />
              <span className="text-xs font-semibold font-[var(--font-headline)]">
                Area
              </span>
            </button>

            <div className="flex-1" />

            {/* Close button */}
            <button
              onClick={handleClose}
              className="p-1.5 hover:bg-sb-surface-container-highest rounded-lg transition-colors text-sb-outline hover:text-sb-on-surface"
              aria-label="Close measurement tools"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Bottom: Content */}
          <div className="flex items-center gap-2 px-3 py-2 text-sb-on-surface">
            {!mode ? (
              /* No mode selected - show last measurement or prompt */
              <>
                {lastMeasurement ? (
                  <div
                    className={`flex items-center gap-2 ${
                      lastMeasurement.type === "distance"
                        ? "text-sb-primary"
                        : "text-sb-tertiary"
                    }`}
                  >
                    <span className="text-xs font-medium">
                      {lastMeasurement.type === "distance"
                        ? "Distance:"
                        : "Area:"}
                    </span>
                    <span className="text-sm font-semibold">
                      {lastMeasurement.type === "distance"
                        ? formatDistance(lastMeasurement.value)
                        : formatArea(lastMeasurement.value)}
                    </span>
                  </div>
                ) : (
                  <p className="text-xs text-sb-outline">
                    Select a measurement mode
                  </p>
                )}
              </>
            ) : (
              /* Active Measurement */
              <>
                {/* Results */}
                <div className="flex items-center gap-2">
                  <div className="bg-[#0C1416] bg-[#0C1416]/50 rounded-lg px-2 py-1.5 min-w-[50px]">
                    <p className="text-[9px] text-[#B6BECB] text-[#5B6E7F]">
                      Points
                    </p>
                    <p className="text-sm font-bold text-[#E6EAF0] text-[#E6EAF0]">
                      {pointCount}
                    </p>
                  </div>

                  {mode === "distance" && (
                    <div className="bg-[#0C1416] dark:bg-[#0C1416]/20 rounded-lg px-2 py-1.5 min-w-[70px]">
                      <p className="text-[9px] text-[#E6EAF0] dark:text-[#E6EAF0]">
                        Distance
                      </p>
                      <p className="text-sm font-bold text-[#E6EAF0] dark:text-[#E6EAF0]">
                        {pointCount > 1 ? formatDistance(distance) : "—"}
                      </p>
                    </div>
                  )}

                  {mode === "area" && (
                    <div className="bg-[#0C1416] dark:bg-[#0C1416]/20 rounded-lg px-2 py-1.5 min-w-[70px]">
                      <p className="text-[9px] text-[#E6EAF0] dark:text-[#E6EAF0]">
                        Area
                      </p>
                      <p className="text-sm font-bold text-[#E6EAF0] dark:text-[#E6EAF0]">
                        {pointCount > 2 ? formatArea(area) : "—"}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex-1" />

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleClear}
                    className="p-1.5 bg-[#0C1416] dark:bg-[#0C1416]/30 hover:bg-[#0C1416] dark:hover:bg-[#0C1416]/50 text-[#E8662E] dark:text-[#E8662E] rounded-lg transition-colors"
                    title="Clear"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={undoLastPoint}
                    disabled={pointCount === 0}
                    className="p-1.5 bg-[#0C1416] bg-[#0C1416] hover:bg-[#0C1416] dark:hover:bg-[#0C1416] text-[#B6BECB] text-[#B6BECB] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Undo"
                  >
                    <Undo className="h-3.5 w-3.5" />
                  </button>

                  <button
                    onClick={handleFinish}
                    disabled={
                      (mode === "distance" && pointCount < 2) ||
                      (mode === "area" && pointCount < 3)
                    }
                    className="p-1.5 bg-[#0C1416] hover:bg-[#0C1416] text-[#E6EAF0] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Done"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
