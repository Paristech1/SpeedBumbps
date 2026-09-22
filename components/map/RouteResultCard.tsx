'use client';

/**
 * Route preview — Nocturne Velocity bottom sheet.
 * The ways there are the summary: one row each, the chosen one marked in teal
 * (its edge and its minutes). The actions are type, not filled buttons.
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
import type { AppRoute, RouteCalculationResult } from '@/types/speedbumps';
import { formatDistance, formatDuration } from '@/lib/geo-utils';
import { listContainerVariants, listItemVariants } from '@/lib/motion';
import { EmptyState } from '@/components/ui/empty-state';

/**
 * Visible sheet height at each snap: tucked / default / expanded.
 *
 * The lowest snap leaves only the handle and a one-line summary, so the sheet
 * can be pulled down to all but clear the map. The route stays put — tap that
 * line to bring the sheet back up.
 */
export const ROUTE_SHEET_SNAP_POINTS: (number | string)[] = ['76px', '372px', 0.85];

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

  const isTucked = snap === ROUTE_SHEET_SNAP_POINTS[0];

  const bumpLine = selectedRoute.isSpeedBumpFree
    ? 'no bumps on this one.'
    : `${selectedRoute.speedBumpCount} bump${selectedRoute.speedBumpCount !== 1 ? 's' : ''} on this one.`;
  // With two ways there the rows already carry the counts; the caption names
  // the trade instead.
  const extra = altExtraMinutes > 0 ? `${altExtraMinutes} more min` : 'no extra time';
  const tradeLine = !hasAlternative
    ? bumpLine
    : selectedRouteIndex === 1
      ? `${altFewerBumps} fewer bump${altFewerBumps !== 1 ? 's' : ''} for ${extra}.`
      : `smoothest skips ${altFewerBumps} for ${extra}.`;

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

          {/* Tucked away: one line, and a tap to bring the sheet back */}
          {isTucked ? (
            <button
              onClick={() => onSnapChange(ROUTE_SHEET_SNAP_POINTS[1])}
              className="nv-frame w-full flex items-baseline gap-3 px-6 pb-4 text-left shrink-0"
              aria-label="Show route details"
            >
              <span className="mast mast-3 mast-num text-[#E6EAF0] whitespace-nowrap">
                {formatDuration(selectedRoute.durationSeconds)}
              </span>
              <span className="mast mast-3 mast-num text-[#B6BECB] whitespace-nowrap">
                {formatDistance(selectedRoute.distanceMeters)}
              </span>
              <span className="ui-sm text-[#5B6E7F] truncate">{bumpLine}</span>
            </button>
          ) : (
            /* The ways there are the summary: time, distance and bumps sit on
               each row, and the chosen row carries the teal. */
            <div className="px-6 shrink-0" data-vaul-no-drag>
              <div role="radiogroup" aria-label="Route options">
                <RouteChoice
                  label={hasAlternative ? 'Fastest' : 'Route'}
                  route={primaryRoute}
                  isSelected={selectedRouteIndex === 0 || !hasAlternative}
                  onClick={() => hasAlternative && selectedRouteIndex !== 0 && onToggleRoute()}
                />
                {hasAlternative && (
                  <RouteChoice
                    label="Smoothest"
                    route={alternativeRoute!}
                    isSelected={selectedRouteIndex === 1}
                    onClick={() => selectedRouteIndex !== 1 && onToggleRoute()}
                  />
                )}
              </div>
              <p className="caption mt-3 mb-4">{tradeLine}</p>
            </div>
          )}

          {!isTucked && (
            <>
            {/* Action buttons */}
            <div className="px-6 mb-4 shrink-0" data-vaul-no-drag>
              <div className="nv-rule mb-2" />
              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={onStartNavigation}
                  className="group flex items-center gap-3 mono-bar text-[#E6EAF0] py-3 transition-opacity active:opacity-60"
                >
                  {!hasAlternative ? 'Drive' : selectedRouteIndex === 1 ? 'Take smoothest' : 'Take fastest'}
                  <span aria-hidden className="block h-px w-8 bg-[#E6EAF0] transition-all group-hover:w-11" />
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
            </>
          )}

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

/** One way there, as a row. The chosen row is the teal mark on the sheet. */
function RouteChoice({
  label,
  route,
  isSelected,
  onClick,
}: {
  label: string;
  route: AppRoute;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="radio"
      aria-checked={isSelected}
      onClick={onClick}
      className="nv-frame relative w-full flex items-end justify-between gap-4 pl-4 py-3 text-left nv-hairline-b last:border-b-0 transition-colors hover:bg-[var(--nv-wash)]"
    >
      <span
        aria-hidden
        className={`absolute left-0 top-3.5 bottom-3.5 w-[2px] rounded-full ${isSelected ? 'bg-[#2BD9CE]' : 'bg-transparent'}`}
      />
      <span className="min-w-0">
        <span className="kicker block">{label}</span>
        <span className="flex items-baseline gap-2.5 mt-1.5">
          <span className={`mast mast-2 mast-num whitespace-nowrap ${isSelected ? 'text-[#2BD9CE]' : 'text-[#E6EAF0]'}`}>
            {formatDuration(route.durationSeconds)}
          </span>
          <span className="ui-sm text-[#5B6E7F] whitespace-nowrap tabular-nums">
            {formatDistance(route.distanceMeters)}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`mast mast-2 mast-num block ${isSelected ? 'text-[#E6EAF0]' : 'text-[#B6BECB]'}`}>
          {route.speedBumpCount}
        </span>
        <span className="kicker block mt-1">{route.speedBumpCount === 1 ? 'Bump' : 'Bumps'}</span>
      </span>
    </button>
  );
}
