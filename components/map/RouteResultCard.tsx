'use client';

/**
 * Route result card — Velocity Dark draggable bottom sheet showing route info.
 * vaul drawer with three snap points:
 *   peek (summary only) · default (+ actions) · expanded (inline step list).
 * Not dismissible by dragging — the route persists until Cancel.
 */

import { Drawer } from 'vaul';
import {
  X, Navigation, Bookmark, List,
  ArrowUp, ArrowLeft, ArrowRight, CornerUpLeft, CornerUpRight,
  MoveUpRight, MoveUpLeft, MapPin, RotateCw, GitFork,
} from 'lucide-react';
import type { RouteCalculationResult } from '@/types/speedbumps';
import { formatDistance, formatDuration } from '@/lib/geo-utils';

/** Visible sheet height at each snap: peek / default / expanded. */
export const ROUTE_SHEET_SNAP_POINTS: (number | string)[] = ['164px', '340px', 0.85];

interface RouteResultCardProps {
  result: RouteCalculationResult;
  selectedRouteIndex: 0 | 1;
  onToggleRoute: () => void;
  onClearRoute: () => void;
  onStartNavigation: () => void;
  onSaveRoute: () => void;
  isRouteSaved: boolean;
  snap: number | string | null;
  onSnapChange: (snap: number | string | null) => void;
}

export function RouteResultCard({
  result,
  selectedRouteIndex,
  onToggleRoute,
  onClearRoute,
  onStartNavigation,
  onSaveRoute,
  isRouteSaved,
  snap,
  onSnapChange,
}: RouteResultCardProps) {
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
    <Drawer.Root
      open
      modal={false}
      dismissible={false}
      noBodyStyles
      snapPoints={ROUTE_SHEET_SNAP_POINTS}
      activeSnapPoint={snap}
      setActiveSnapPoint={onSnapChange}
      snapToSequentialPoint
    >
      <Drawer.Portal>
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 !z-[1070] h-full flex flex-col rounded-t-[24px] bg-[#1A1D27] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] outline-none"
        >
          <Drawer.Title className="sr-only">Route preview</Drawer.Title>

          {/* Handle */}
          <div className="mx-auto mt-4 mb-4 h-1.5 w-12 shrink-0 rounded-full bg-[#404752]/30" />

          {/* Route summary — large ETA style from stitch */}
          <div className="flex items-end gap-4 px-6 mb-4 shrink-0">
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
            <div className="flex gap-3 px-6 mb-4 shrink-0" data-vaul-no-drag>
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
          <div className="flex items-center gap-2 px-6 mb-4 shrink-0" data-vaul-no-drag>
            <button
              onClick={onClearRoute}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[#33343b] text-[#e2e2eb] hover:bg-[#373940] transition-colors active:scale-95 shrink-0"
              title="Cancel route"
              aria-label="Cancel route"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={onSaveRoute}
              className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors active:scale-95 shrink-0 ${
                isRouteSaved
                  ? 'bg-[#2196F3]/20 text-[#9ecaff]'
                  : 'bg-[#33343b] text-[#e2e2eb] hover:bg-[#373940]'
              }`}
              title={isRouteSaved ? 'Route saved' : 'Save route'}
              aria-label={isRouteSaved ? 'Route saved' : 'Save route'}
            >
              <Bookmark className={`w-5 h-5 ${isRouteSaved ? 'fill-current' : ''}`} />
            </button>
            <button
              onClick={() => onSnapChange(ROUTE_SHEET_SNAP_POINTS[2])}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-[#33343b] text-[#e2e2eb] hover:bg-[#373940] transition-colors active:scale-95 shrink-0"
              title="Turn-by-turn steps"
              aria-label="Show turn-by-turn steps"
            >
              <List className="w-5 h-5" />
            </button>
            <button
              onClick={onStartNavigation}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 rounded-full text-sm font-bold bg-gradient-to-br from-[#9ecaff] to-[#2196F3] text-[#003258] shadow-xl shadow-[#2196F3]/20 transition-all active:scale-[0.98]"
            >
              <Navigation className="w-4 h-4" />
              Start
            </button>
          </div>

          {/* Turn-by-turn steps — visible at the expanded snap */}
          <div className="flex items-center gap-3 px-6 pt-2 pb-3 shrink-0">
            <div className="w-1.5 h-6 bg-[#9ecaff] rounded-full" />
            <h2 className="text-lg font-[var(--font-headline)] font-bold text-[#e2e2eb] tracking-tight">
              Turn-by-turn
            </h2>
            <span className="text-xs text-[#bfc7d4] font-medium">
              {selectedRoute.steps.length} steps
            </span>
          </div>
          <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-10 space-y-2">
            {selectedRoute.steps.map((step, i) => (
              <div
                key={i}
                className={`flex items-start gap-4 p-4 rounded-2xl ${
                  i === 0
                    ? 'bg-[#9ecaff]/10'
                    : 'hover:bg-[#33343b]/50 transition-colors'
                }`}
              >
                <div className={`mt-1 w-11 h-11 shrink-0 flex items-center justify-center rounded-xl ${
                  i === 0
                    ? 'bg-[#2196F3] shadow-lg shadow-[#2196F3]/20'
                    : 'bg-[#33343b]'
                }`}>
                  <DirectionIcon instruction={step.instruction} isCurrent={i === 0} />
                </div>
                <div className="flex-1">
                  <h3 className="font-[var(--font-headline)] font-bold leading-snug text-base text-[#e2e2eb]">
                    {step.instruction}
                  </h3>
                  <p className="text-sm text-[#bfc7d4] font-medium mt-0.5">
                    {formatDistance(step.distanceMeters)} · {formatDuration(step.durationSeconds)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
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
