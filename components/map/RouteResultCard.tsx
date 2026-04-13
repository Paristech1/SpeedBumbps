'use client';

/**
 * Route result card — bottom sheet showing route info and controls.
 * Ported from Flutter: map_screen.dart _buildRouteResultCard()
 */

import { useState } from 'react';
import {
  X, ChevronRight, Clock, Ruler, Navigation,
  ArrowUp, ArrowLeft, ArrowRight, CornerUpLeft, CornerUpRight,
  MoveUpRight, MoveUpLeft, MapPin, RotateCw, GitFork,
} from 'lucide-react';
import type { RouteCalculationResult } from '@/types/speedbumps';
import { formatDistance, formatDuration } from '@/lib/geo-utils';

interface RouteResultCardProps {
  result: RouteCalculationResult;
  selectedRouteIndex: 0 | 1;
  onToggleRoute: () => void;
  onClearRoute: () => void;
}

export function RouteResultCard({
  result,
  selectedRouteIndex,
  onToggleRoute,
  onClearRoute,
}: RouteResultCardProps) {
  const [stepsOpen, setStepsOpen] = useState(false);

  const { primaryRoute, alternativeRoute } = result;
  const selectedRoute = selectedRouteIndex === 1 && alternativeRoute ? alternativeRoute : primaryRoute;
  const hasAlternative = !!alternativeRoute;

  const bumpBadge = selectedRoute.isSpeedBumpFree ? (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
      ✅ Bump-free
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
      🚧 {selectedRoute.speedBumpCount} bump{selectedRoute.speedBumpCount !== 1 ? 's' : ''}
    </span>
  );

  return (
    <>
      {/* Main card */}
      <div className="absolute bottom-0 left-0 right-0 z-[1050] bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl px-4 pb-6 pt-4">
        {/* Handle */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>

        {/* Route summary row */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-200">
            <Clock className="w-4 h-4 text-blue-500" />
            <span className="text-base font-semibold">{formatDuration(selectedRoute.durationSeconds)}</span>
          </div>
          <span className="text-gray-300 dark:text-gray-600">·</span>
          <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-200">
            <Ruler className="w-4 h-4 text-gray-400" />
            <span className="text-sm">{formatDistance(selectedRoute.distanceMeters)}</span>
          </div>
          <div className="flex-1" />
          {bumpBadge}
        </div>

        {/* Route toggle (when alternative exists) */}
        {hasAlternative && (
          <div className="flex gap-2 mb-3">
            <RouteTabButton
              label="Fastest"
              subLabel={`${formatDuration(primaryRoute.durationSeconds)} · ${primaryRoute.speedBumpCount > 0 ? `${primaryRoute.speedBumpCount} bumps` : 'Bump-free'}`}
              isSelected={selectedRouteIndex === 0}
              color={primaryRoute.isSpeedBumpFree ? 'green' : 'blue'}
              onClick={() => selectedRouteIndex !== 0 && onToggleRoute()}
            />
            <RouteTabButton
              label={alternativeRoute!.isSpeedBumpFree ? 'Bump-free' : 'Smoother'}
              subLabel={`${formatDuration(alternativeRoute!.durationSeconds)} · ${alternativeRoute!.speedBumpCount > 0 ? `${alternativeRoute!.speedBumpCount} bumps` : 'Bump-free'}`}
              isSelected={selectedRouteIndex === 1}
              color={alternativeRoute!.isSpeedBumpFree ? 'green' : 'blue'}
              onClick={() => selectedRouteIndex !== 1 && onToggleRoute()}
            />
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={onClearRoute}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={() => setStepsOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
          >
            <Navigation className="w-4 h-4" />
            View Path
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Steps modal */}
      {stepsOpen && (
        <div className="absolute inset-0 z-[1200] bg-black/50 flex items-end" onClick={() => setStepsOpen(false)}>
          <div
            className="w-full bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white dark:bg-gray-800 px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Directions</h3>
              <button
                onClick={() => setStepsOpen(false)}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Close steps"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="px-4 py-3 space-y-1 pb-8">
              {selectedRoute.steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
                    <DirectionIcon instruction={step.instruction} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{step.instruction}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {formatDistance(step.distanceMeters)} · {formatDuration(step.durationSeconds)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DirectionIcon({ instruction }: { instruction: string }) {
  const cls = "w-4 h-4 text-blue-600 dark:text-blue-400";
  const lower = instruction.toLowerCase();

  if (lower.startsWith('arrive')) return <MapPin className={cls} />;
  if (lower.startsWith('head') || lower.startsWith('depart')) return <ArrowUp className={cls} />;
  if (lower.includes('roundabout') || lower.includes('rotary')) return <RotateCw className={cls} />;
  if (lower.includes('keep') || lower.includes('fork')) return <GitFork className={cls} />;
  if (lower.includes('merge')) return <MoveUpRight className={cls} />;

  if (lower.includes('sharp left')) return <CornerUpLeft className={cls} />;
  if (lower.includes('sharp right')) return <CornerUpRight className={cls} />;
  if (lower.includes('slight left')) return <MoveUpLeft className={cls} />;
  if (lower.includes('slight right')) return <MoveUpRight className={cls} />;
  if (lower.includes('left')) return <ArrowLeft className={cls} />;
  if (lower.includes('right')) return <ArrowRight className={cls} />;
  if (lower.includes('u-turn')) return <RotateCw className={cls} />;

  return <ArrowUp className={cls} />;
}

function RouteTabButton({
  label,
  subLabel,
  isSelected,
  color,
  onClick,
}: {
  label: string;
  subLabel: string;
  isSelected: boolean;
  color: 'green' | 'blue';
  onClick: () => void;
}) {
  const activeColor = color === 'green'
    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
    : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20';
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left p-2.5 rounded-xl border-2 transition-all ${
        isSelected
          ? activeColor
          : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
      }`}
    >
      <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">{label}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subLabel}</div>
    </button>
  );
}
