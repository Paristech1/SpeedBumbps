'use client';

/**
 * Active navigation HUD — Nocturne Velocity.
 * A glass card over the map carries the kicker (distance to the maneuver),
 * the maneuver itself set as the mast, and the street underneath. The one
 * ember on the screen is the next bump; the card below reads the remaining
 * time, distance and bumps left, with type-only actions.
 *
 * Step tracking is progress-based: the driver's position is projected onto
 * the route polyline and the "current" step is the first maneuver still ahead
 * of that projection. This survives GPS gaps and fast passes that a
 * radius-around-the-maneuver check would miss.
 */

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowUp, ArrowLeft, ArrowRight, CornerUpLeft, CornerUpRight,
  MoveUpRight, MoveUpLeft, MapPin, RotateCw, GitFork, X,
  Volume2, VolumeX, Flag,
} from 'lucide-react';
import { hudTopVariants, hudBottomVariants } from '@/lib/motion';
import { Skeleton } from '@/components/ui/skeleton';
import type { RouteStep, LatLng, SpeedBump } from '@/types/speedbumps';
import { haversineDistance, formatDistance, formatDuration, routeProgress, toImperial } from '@/lib/geo-utils';
import { useVoiceGuidance } from '@/hooks/useVoiceGuidance';
import { maneuverHeadline } from '@/lib/maneuver-display';
import { nextBumpAhead, bumpsRemaining, bumpKindLabel } from '@/lib/bump-ahead';
import { isSpeechSupported, isVoiceMuted, setVoiceMuted } from '@/lib/voice-guidance';

/** Within this many metres of the route end (on the last step) we call it arrived. */
const ARRIVAL_RADIUS_M = 30;
/** How long the "Arrived" state shows before navigation ends itself. */
const ARRIVAL_AUTO_STOP_MS = 5000;

interface NavigationBarProps {
  steps: RouteStep[];
  currentLocation: LatLng | null;
  onEndNavigation: () => void;
  /** Full route geometry + totals — drives the live ETA countdown. */
  routePoints?: LatLng[];
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
  /** Speed bumps on the selected route — drives proximity voice alerts. */
  speedBumps?: SpeedBump[];
  /** GPS accuracy in metres, for the precision chip. */
  gpsAccuracy?: number | null;
  /** Current ground speed in metres per second. */
  speedMps?: number | null;
  /** Opens the report sheet — screen 05's "report a bump". */
  onReportBump?: () => void;
}

/** First step whose maneuver is still ahead of the driver's segment; else the last step. */
function upcomingStepIndex(steps: RouteStep[], segmentIndex: number): number {
  for (let i = 0; i < steps.length; i++) {
    if (steps[i].polylineIndex > segmentIndex) return i;
  }
  return steps.length - 1;
}

export function NavigationBar({
  steps,
  currentLocation,
  onEndNavigation,
  routePoints,
  totalDistanceMeters,
  totalDurationSeconds,
  speedBumps,
  gpsAccuracy,
  speedMps,
  onReportBump,
}: NavigationBarProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [voiceMuted, setVoiceMutedState] = useState(() => isVoiceMuted());
  const [arrived, setArrived] = useState(false);
  // Wall clock for the ETA readout; ticks every 30 s so the time stays honest
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  // Reset whenever a new route's steps arrive (adjust state during render).
  const [prevSteps, setPrevSteps] = useState(steps);
  if (steps !== prevSteps) {
    setPrevSteps(steps);
    setCurrentStepIndex(0);
    setArrived(false);
  }

  const hasGeometry = !!routePoints && routePoints.length >= 2;
  const progress = currentLocation && hasGeometry ? routeProgress(routePoints, currentLocation) : null;

  // Advance the step from route progress; never move backwards on GPS jitter.
  if (progress && steps.length > 0) {
    const next = upcomingStepIndex(steps, progress.segmentIndex);
    if (next > currentStepIndex) setCurrentStepIndex(next);
  }

  const isLastStep = currentStepIndex === steps.length - 1;
  const hasArrived =
    arrived || (isLastStep && !!progress && progress.remainingMeters <= ARRIVAL_RADIUS_M);
  if (hasArrived && !arrived) setArrived(true);

  // Arrived: hold the card briefly, then end navigation on the driver's behalf.
  useEffect(() => {
    if (!arrived) return;
    const timer = setTimeout(onEndNavigation, ARRIVAL_AUTO_STOP_MS);
    return () => clearTimeout(timer);
  }, [arrived, onEndNavigation]);

  useVoiceGuidance({
    steps,
    currentStepIndex,
    currentLocation,
    active: true,
    speedBumps,
    hasArrived,
  });

  const toggleVoice = () => {
    const next = !voiceMuted;
    setVoiceMutedState(next);
    setVoiceMuted(next); // also cancels any in-flight speech when muting
  };

  if (steps.length === 0) return null;

  const currentStep = steps[currentStepIndex];

  // Live distance to the upcoming maneuver
  const distanceToManeuver = currentLocation
    ? haversineDistance(currentLocation, currentStep.location)
    : null;

  // Remaining distance/duration — continuous from GPS position when we have the
  // full route geometry; otherwise fall back to summing the remaining steps.
  let remainingDistance = steps.slice(currentStepIndex).reduce((sum, s) => sum + s.distanceMeters, 0);
  let remainingDuration = steps.slice(currentStepIndex).reduce((sum, s) => sum + s.durationSeconds, 0);
  if (progress && totalDistanceMeters && totalDistanceMeters > 0 && totalDurationSeconds) {
    remainingDistance = progress.remainingMeters;
    remainingDuration = totalDurationSeconds * (progress.remainingMeters / totalDistanceMeters);
  }
  if (hasArrived) {
    remainingDistance = 0;
    remainingDuration = 0;
  }

  const etaClock = new Date(now + remainingDuration * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const speedMph = speedMps != null ? Math.round(speedMps * 2.23694) : null;

  const bumpAhead = hasArrived ? null : nextBumpAhead(speedBumps, currentLocation, routePoints);
  const bumpsLeft = bumpsRemaining(speedBumps, currentLocation, routePoints);

  const gps = gpsTier(gpsAccuracy ?? null);
  const waitingForGps = !hasArrived && distanceToManeuver == null;

  // The HUD sets the action at display size and the street underneath, so the
  // driver reads the turn in a glance rather than a sentence.
  const headline = hasArrived
    ? { action: 'Arrived', detail: 'Ending navigation…' }
    : maneuverHeadline(currentStep.instruction);
  const kicker = hasArrived
    ? 'Destination'
    : waitingForGps
      ? 'Acquiring GPS signal…'
      : distanceToManeuver != null
        ? isLastStep
          ? `Destination in ${formatDistance(distanceToManeuver)}`
          : `In ${formatDistance(distanceToManeuver)}`
        : isLastStep
          ? 'Arriving at destination'
          : 'Waiting for GPS…';

  return (
    <>
      {/* Maneuver card — glass over the map, type doing the work */}
      <motion.header
        variants={hudTopVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed top-0 left-0 right-0 z-[1050] px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
      >
        <div className="nv-frame nv-glass rounded-[22px] px-5 py-4">
          {/* Kicker and the quiet controls share a row; the mast gets the width */}
          <div className="flex items-start justify-between gap-4">
            <p className="kicker truncate pt-1">{kicker}</p>
            <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-2">
              {isSpeechSupported() && (
                <button
                  onClick={toggleVoice}
                  className="p-2 rounded-full transition-colors hover:bg-white/5"
                  title={voiceMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
                  aria-label={voiceMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
                >
                  {voiceMuted ? (
                    <VolumeX className="w-5 h-5 text-[#5B6E7F]" />
                  ) : (
                    <Volume2 className="w-5 h-5 text-[#B6BECB]" />
                  )}
                </button>
              )}
              <button
                onClick={onEndNavigation}
                className="p-2 rounded-full transition-colors hover:bg-white/5"
                aria-label="End navigation"
              >
                <X className="w-5 h-5 text-[#B6BECB]" />
              </button>
            </div>
          </div>

          {waitingForGps ? (
            <div className="mt-3 space-y-3">
              <Skeleton className="h-12 w-48 max-w-full bg-white/10" />
              <Skeleton className="h-4 w-32 max-w-full bg-white/5" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={hasArrived ? 'arrived' : `step-${currentStepIndex}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="mt-2 flex items-end justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <h1 className="mast mast-1 text-[#E6EAF0] truncate">{headline.action}</h1>
                  {headline.detail && (
                    <p className="ui-text lowercase text-[#B6BECB] truncate mt-2">{headline.detail}</p>
                  )}
                </div>
                <div className="shrink-0 pb-1 hidden sm:flex items-center gap-3">
                  {hasArrived ? (
                    <Flag className="w-6 h-6 text-[#B6BECB]" />
                  ) : (
                    <TurnIcon instruction={currentStep.instruction} />
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* The one warning line — ember on the digits only */}
        {bumpAhead && (
          <p className="caption mt-3 pl-2">
            {bumpKindLabel(bumpAhead.bump)} in{' '}
            <span className="text-[#E8662E] mast-num">{toImperial(bumpAhead.distanceMeters).value}</span>
            {' '}{toImperial(bumpAhead.distanceMeters).unit}.
          </p>
        )}
      </motion.header>

      {/* Trip card — remaining time, distance and bumps, with type-only actions */}
      <motion.div
        variants={hudBottomVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-3 right-3 z-[1050]"
      >
        <div className="nv-frame nv-glass rounded-[22px] px-5 pt-4 pb-3 max-w-2xl mx-auto">
          <div className="flex items-end justify-between gap-5">
            <div className="min-w-0">
              <p className="kicker">{hasArrived ? 'Arrived' : 'Remaining'}</p>
              <p className="mast mast-2 mast-num text-[#E6EAF0] mt-1.5 truncate">
                {hasArrived ? "You're here" : `${formatDuration(remainingDuration)} · ${formatDistance(remainingDistance)}`}
              </p>
            </div>
            {!hasArrived && (
              <div className="text-right shrink-0">
                <p className="kicker">Bumps left</p>
                <p className="mast mast-2 mast-num text-[#E6EAF0] mt-1.5">{bumpsLeft}</p>
              </div>
            )}
          </div>

          <div className="ui-sm text-[#5B6E7F] mt-2">
            {hasArrived ? (
              'smooth all the way.'
            ) : (
              <>
                eta {etaClock.toLowerCase()}
                {speedMph != null && <span className="hidden min-[380px]:inline"> · {speedMph} mph</span>}
                <span className="hidden min-[340px]:inline"> · {gps.label.toLowerCase()}</span>
              </>
            )}
          </div>

          <div className="nv-rule my-3" />

          <div className="flex items-center justify-between gap-4">
            {onReportBump && !hasArrived ? (
              <button
                onClick={onReportBump}
                className="mast mast-4 text-[#E6EAF0] py-2 transition-opacity active:opacity-60"
              >
                Report a bump
              </button>
            ) : (
              <span className="mono-bar text-[#5B6E7F] py-2">{gps.label}</span>
            )}
            <button
              onClick={onEndNavigation}
              className="mono-bar text-[#E8662E] py-2 pl-6 transition-opacity active:opacity-60"
            >
              {hasArrived ? 'Done' : 'End'}
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

function gpsTier(accuracy: number | null): { label: string } {
  if (accuracy == null) return { label: 'GPS searching' };
  if (accuracy <= 10) return { label: 'GPS locked' };
  if (accuracy <= 30) return { label: `GPS ${Math.round(accuracy)} m` };
  return { label: `GPS weak · ${Math.round(accuracy)} m` };
}

function TurnIcon({ instruction }: { instruction: string }) {
  const cls = 'w-6 h-6 text-[#B6BECB]';
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
