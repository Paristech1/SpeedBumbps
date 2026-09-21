'use client';

/**
 * Route preview — Nocturne Velocity bottom sheet.
 * Two ways there: the chosen one carries the ember edge and the ember minutes,
 * and the actions are type, not filled buttons.
 *
 * vaul drawer with three snap points:
 *   peek (summary only) · default (+ actions) · expanded (inline step list).
 * Not dismissible by dragging — the route persists until Cancel.
 */

import { Drawer } from 'vaul';
import { motion } from 'framer-motion';
import {
  X, Bookmark, List,
  ArrowUp, ArrowLeft, ArrowRight, CornerUpLeft, CornerUpRight,
  MoveUpRight, MoveUpLeft, MapPin, RotateCw, GitFork,
} from 'lucide-react';
import type { RouteCalculationResult } from '@/types/speedbumps';
import { formatDistance, formatDuration } from '@/lib/geo-utils';
import { listContainerVariants, listItemVariants } from '@/lib/motion';
import { EmptyState } from '@/components/ui/empty-state';

/** Visible sheet height at each snap: peek / default / expanded. */
export const ROUTE_SHEET_SNAP_POINTS: (number | string)[] = ['190px', '372px', 0.85];

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
  // Only offer the alternative when it actually improves on the fastest route
  const hasAlternative = !!alternativeRoute && alternativeRoute.speedBumpCount < primaryRoute.speedBumpCount;
  const selectedRoute = selectedRouteIndex === 1 && hasAlternative ? alternativeRoute! : primaryRoute;

  const altExtraMinutes = hasAlternative
    ? Math.max(0, Math.round((alternativeRoute!.durationSeconds - primaryRoute.durationSeconds) / 60))
    : 0;
  const altFewerBumps = hasAlternative ? primaryRoute.speedBumpCount - alternativeRoute!.speedBumpCount : 0;

  const bumpLine = selectedRoute.isSpeedBumpFree
    ? 'no bumps on this one.'
    : `${selectedRoute.speedBumpCount} bump${selectedRoute.speedBumpCount !== 1 ? 's' : ''} on this one.`;

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
          className="nv-sheet nv-lift fixed bottom-0 left-0 right-0 !z-[1070] h-full flex flex-col rounded-t-[24px] outline-none pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <Drawer.Title className="sr-only">Route preview</Drawer.Title>

          {/* Handle */}
          <div className="mx-auto mt-3 mb-4 h-1 w-10 shrink-0 rounded-full bg-[#5B6E7F]/60" />

          {/* Route summary — large ETA style from stitch */}
          <div className="nv-frame px-6 mb-4 shrink-0">
            <div className="flex items-end gap-6">
              <div className="min-w-0">
                <p className="kicker">Time</p>
                <p className="mast mast-2 mast-num text-[#E6EAF0] whitespace-nowrap mt-1.5">
                  {formatDuration(selectedRoute.durationSeconds)}
                </p>
              </div>
              <div className="min-w-0">
                <p className="kicker">Distance</p>
                <p className="mast mast-2 mast-num text-[#E6EAF0] whitespace-nowrap mt-1.5">
                  {formatDistance(selectedRoute.distanceMeters)}
                </p>
              </div>
            </div>
            <p className="caption mt-2.5">{bumpLine}</p>
          </div>

          {/* Route toggle (when alternative exists) */}
          {hasAlternative && (
            <div className="nv-frame flex gap-3 px-6 mb-4 shrink-0" data-vaul-no-drag>
              <RouteChoice
                label="Fastest"
                minutes={formatDuration(primaryRoute.durationSeconds)}
                detail={`${primaryRoute.speedBumpCount} bump${primaryRoute.speedBumpCount !== 1 ? 's' : ''}`}
                isSelected={selectedRouteIndex === 0}
                onClick={() => selectedRouteIndex !== 0 && onToggleRoute()}
              />
              <RouteChoice
                label="Smoothest"
                minutes={formatDuration(alternativeRoute!.durationSeconds)}
                detail={`${altExtraMinutes > 0 ? `+${altExtraMinutes} min` : 'same time'} · −${altFewerBumps} bump${altFewerBumps !== 1 ? 's' : ''}`}
                isSelected={selectedRouteIndex === 1}
                onClick={() => selectedRouteIndex !== 1 && onToggleRoute()}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="px-6 mb-4 shrink-0" data-vaul-no-drag>
            <div className="nv-rule mb-3" />
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={onStartNavigation}
                className="mono-bar text-[#E6EAF0] py-2 transition-opacity active:opacity-60"
              >
                {selectedRouteIndex === 1 ? 'Take smoothest' : 'Take fastest'}
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={onSaveRoute}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-colors active:scale-95 ${
                    isRouteSaved ? 'text-[#E6EAF0]' : 'text-[#5B6E7F] hover:text-[#E6EAF0]'
                  }`}
                  title={isRouteSaved ? 'Route saved' : 'Save route'}
                  aria-label={isRouteSaved ? 'Route saved' : 'Save route'}
                >
                  <Bookmark className={`w-5 h-5 ${isRouteSaved ? 'fill-current' : ''}`} />
                </button>
                <button
                  onClick={() => onSnapChange(ROUTE_SHEET_SNAP_POINTS[2])}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-[#5B6E7F] hover:text-[#E6EAF0] transition-colors active:scale-95"
                  title="Turn-by-turn steps"
                  aria-label="Show turn-by-turn steps"
                >
                  <List className="w-5 h-5" />
                </button>
                <button
                  onClick={onClearRoute}
                  className="w-10 h-10 flex items-center justify-center rounded-full text-[#5B6E7F] hover:text-[#E6EAF0] transition-colors active:scale-95"
                  title="Cancel route"
                  aria-label="Cancel route"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Turn-by-turn steps — visible at the expanded snap */}
          <div className="nv-frame flex items-baseline gap-3 px-6 pt-1 pb-3 shrink-0">
            <h2 className="kicker">Turn by turn</h2>
            <span className="kicker">{selectedRoute.steps.length} steps</span>
          </div>
          <motion.div
            variants={listContainerVariants}
            initial="hidden"
            animate="visible"
            className="flex-1 overflow-y-auto hide-scrollbar px-6 pb-10"
          >
            {selectedRoute.steps.length === 0 ? (
              <EmptyState
                icon={<List className="w-8 h-8" />}
                title="No turn-by-turn steps"
                hint="This route has distance and duration but no detailed directions were returned."
              />
            ) : selectedRoute.steps.map((step, i) => (
              <motion.div
                key={i}
                variants={listItemVariants}
                className="nv-frame flex items-center gap-4 px-2 py-3.5 nv-hairline-b last:border-b-0"
              >
                <DirectionIcon instruction={step.instruction} isCurrent={i === 0} />
                <div className="flex-1 min-w-0">
                  <h3 className={`mast mast-3 ${i === 0 ? 'text-[#E6EAF0]' : 'text-[#B6BECB]'}`}>
                    {step.instruction}
                  </h3>
                  <p className="ui-sm text-[#5B6E7F] mt-1 tabular-nums">
                    {formatDistance(step.distanceMeters)} · {formatDuration(step.durationSeconds)}
                  </p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function DirectionIcon({ instruction, isCurrent }: { instruction: string; isCurrent?: boolean }) {
  const cls = `w-5 h-5 shrink-0 ${isCurrent ? 'text-[#E6EAF0]' : 'text-[#5B6E7F]'}`;
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

/** One of the two ways there. The chosen one is the second ember on the screen. */
function RouteChoice({
  label,
  minutes,
  detail,
  isSelected,
  onClick,
}: {
  label: string;
  minutes: string;
  detail: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`nv-frame flex-1 text-left px-4 py-3 rounded-2xl nv-hairline transition-all ${
        isSelected ? 'nv-ember-edge' : 'hover:bg-white/[0.03]'
      }`}
    >
      <div className="kicker">{label}</div>
      <div className={`mast mast-3 mast-num mt-1.5 ${isSelected ? 'text-[#E8662E]' : 'text-[#E6EAF0]'}`}>
        {minutes}
      </div>
      <div className="ui-sm text-[#5B6E7F] mt-1">{detail}</div>
    </button>
  );
}
