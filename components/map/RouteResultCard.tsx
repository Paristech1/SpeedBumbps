'use client';

/**
 * Route result card — Velocity Dark bottom sheet showing route info.
 * Matches the directions_step_list stitch: glass-panel modals,
 * bold typography, gradient CTA, and proper dark theming.
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
  onStartNavigation: () => void;
}

export function RouteResultCard({
  result,
  selectedRouteIndex,
  onToggleRoute,
  onClearRoute,
  onStartNavigation,
}: RouteResultCardProps) {
  const [stepsOpen, setStepsOpen] = useState(false);

  const { primaryRoute, alternativeRoute } = result;
  const selectedRoute = selectedRouteIndex === 1 && alternativeRoute ? alternativeRoute : primaryRoute;
  const hasAlternative = !!alternativeRoute;

  const bumpBadge = selectedRoute.isSpeedBumpFree ? (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#00a844]/20 text-[#3ce36a] uppercase tracking-wider">
      ✅ Bump-free
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#FF6B00]/20 text-[#FF6B00] uppercase tracking-wider">
      🚧 {selectedRoute.speedBumpCount} bump{selectedRoute.speedBumpCount !== 1 ? 's' : ''}
    </span>
  );

  return (
    <>
      {/* Main card — Velocity Dark glass panel */}
      <div className="absolute bottom-0 left-0 right-0 z-[1050] bg-[#1A1D27] rounded-t-[24px] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] px-6 pb-8 pt-4">
        {/* Handle */}
        <div className="flex justify-center mb-4">
          <div className="w-12 h-1.5 bg-[#404752]/30 rounded-full" />
        </div>

        {/* Route summary — large ETA style from stitch */}
        <div className="flex items-end gap-4 mb-4">
          <div className="flex flex-col">
            <span className="text-4xl font-[var(--font-headline)] font-extrabold text-[#44d8f1]">
              {formatDuration(selectedRoute.durationSeconds)}
            </span>
            <span className="text-xs text-[#bfc7d4] font-medium uppercase tracking-wider">Duration</span>
          </div>
          <div className="h-10 w-px bg-[#404752]/30 mb-2" />
          <div className="flex flex-col">
            <span className="text-4xl font-[var(--font-headline)] font-extrabold text-[#e2e2eb]">
              {formatDistance(selectedRoute.distanceMeters)}
            </span>
            <span className="text-xs text-[#bfc7d4] font-medium uppercase tracking-wider">Distance</span>
          </div>
          <div className="flex-1" />
          {bumpBadge}
        </div>

        {/* Route toggle (when alternative exists) */}
        {hasAlternative && (
          <div className="flex gap-3 mb-4">
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
        <div className="flex gap-3">
          <button
            onClick={onClearRoute}
            className="flex items-center gap-2 px-5 py-3 rounded-full text-sm font-bold bg-[#33343b] text-[#e2e2eb] hover:bg-[#373940] transition-colors active:scale-95"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={() => setStepsOpen(true)}
            className="flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-bold bg-[#33343b] text-[#e2e2eb] hover:bg-[#373940] transition-colors active:scale-95"
          >
            <ChevronRight className="w-4 h-4" />
            Directions
          </button>
          <button
            onClick={onStartNavigation}
            className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-bold bg-gradient-to-br from-[#9ecaff] to-[#2196F3] text-[#003258] shadow-xl shadow-[#2196F3]/20 transition-all active:scale-[0.98]"
          >
            <Navigation className="w-4 h-4" />
            Start
          </button>
        </div>
      </div>

      {/* Steps modal — directions_step_list stitch style */}
      {stepsOpen && (
        <div className="absolute inset-0 z-[1200] flex items-end justify-center pointer-events-none">
          <div className="absolute inset-0 bg-[#0c0e14]/60 backdrop-blur-sm pointer-events-auto" onClick={() => setStepsOpen(false)} />
          <div
            className="relative w-full max-w-2xl bg-[#282a30] rounded-t-[24px] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] border-t border-[#404752]/20 flex flex-col pointer-events-auto"
            style={{ maxHeight: '75vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-8 py-6 bg-[#282a30]/90 backdrop-blur-md rounded-t-[24px] border-b border-[#404752]/10">
              <div className="flex items-center gap-4">
                <div className="w-1.5 h-8 bg-[#9ecaff] rounded-full" />
                <h2 className="text-2xl font-[var(--font-headline)] font-bold text-[#e2e2eb] tracking-tight">Directions</h2>
              </div>
              <button
                onClick={() => setStepsOpen(false)}
                className="p-3 bg-[#33343b] rounded-full hover:bg-[#373940] transition-all active:scale-90 group"
                aria-label="Close steps"
              >
                <X className="w-5 h-5 text-[#bfc7d4] group-hover:text-[#e2e2eb]" />
              </button>
            </div>

            {/* Steps List */}
            <div className="flex-1 overflow-y-auto hide-scrollbar px-6 py-4 space-y-2">
              {selectedRoute.steps.map((step, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-5 p-6 rounded-2xl ${
                    i === 0
                      ? 'bg-[#9ecaff]/10 border border-[#9ecaff]/20'
                      : 'hover:bg-[#33343b]/50 transition-colors'
                  }`}
                >
                  <div className={`mt-1 w-12 h-12 flex items-center justify-center rounded-xl ${
                    i === 0
                      ? 'bg-[#2196F3] shadow-lg shadow-[#2196F3]/20'
                      : 'bg-[#33343b] border border-[#404752]/20'
                  }`}>
                    <DirectionIcon instruction={step.instruction} isCurrent={i === 0} />
                  </div>
                  <div className="flex-1">
                    {i === 0 && (
                      <p className="text-[#9ecaff] text-xs font-bold uppercase tracking-widest mb-1">Current Step</p>
                    )}
                    <h3 className={`font-[var(--font-headline)] font-bold leading-snug ${
                      i === 0 ? 'text-xl text-[#e2e2eb]' : 'text-lg text-[#e2e2eb]'
                    }`}>
                      {step.instruction}
                    </h3>
                    <p className="text-[#bfc7d4] font-medium mt-1">
                      {formatDistance(step.distanceMeters)} · {formatDuration(step.durationSeconds)}
                    </p>
                  </div>
                </div>
              ))}
              <div className="h-24" />
            </div>

            {/* Modal CTA Footer */}
            <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-[#282a30] via-[#282a30] to-transparent">
              <button
                onClick={() => { setStepsOpen(false); onStartNavigation(); }}
                className="w-full py-5 bg-gradient-to-br from-[#9ecaff] to-[#2196F3] text-[#003258] font-bold rounded-full text-lg shadow-xl shadow-[#2196F3]/20 active:scale-[0.98] transition-transform"
              >
                Resume Navigation
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DirectionIcon({ instruction, isCurrent }: { instruction: string; isCurrent?: boolean }) {
  const cls = `w-5 h-5 ${isCurrent ? 'text-white' : 'text-[#44d8f1]'}`;
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
    ? 'border-[#3ce36a] bg-[#3ce36a]/10'
    : 'border-[#2196F3] bg-[#2196F3]/10';
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left p-3 rounded-2xl border-2 transition-all ${
        isSelected
          ? activeColor
          : 'border-[#404752]/30 hover:border-[#404752]/60'
      }`}
    >
      <div className="text-sm font-semibold text-[#e2e2eb]">{label}</div>
      <div className="text-xs text-[#bfc7d4] mt-0.5">{subLabel}</div>
    </button>
  );
}
