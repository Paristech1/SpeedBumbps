'use client';

/**
 * Active navigation HUD — Nocturne Velocity.
 * A glass card over the map carries the turn: its glyph, the distance to it,
 * the maneuver set as the mast, and the street underneath. The one flare on
 * the screen is the next bump. A low trip bar reads arrival, time left and
 * bumps left, with REPORT A BUMP and END as type.
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

  const toManeuver = distanceToManeuver != null ? toImperial(distanceToManeuver) : null;
  const leftClock = formatDuration(remainingDuration);

  return (
    <>
      {/* Maneuver card — the turn, how far, and which street. Nothing else. */}
      <motion.header
        variants={hudTopVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed top-0 left-0 right-0 z-[1050] px-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
      >
        <div className="nv-frame nv-glass rounded-[22px] pl-5 pr-3 pt-4 pb-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 -ml-1 flex items-center justify-center rounded-2xl nv-hairline">
              {hasArrived ? (
                <Flag className="w-6 h-6 text-[#E6EAF0]" strokeWidth={1.75} />
              ) : (
                <TurnIcon instruction={currentStep.instruction} />
              )}
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              {toManeuver && !hasArrived ? (
                <>
                  <p className="kicker">{isLastStep ? 'Destination in' : 'In'}</p>
                  <p className="mast mast-num text-[1.75rem] leading-none text-[#E6EAF0] mt-1 whitespace-nowrap">
                    {toManeuver.value}
                    <span className="kicker text-[#B6BECB] ml-1.5 align-[0.2em]">{toManeuver.unit}</span>
                  </p>
                </>
              ) : (
                <p className="kicker pt-1 truncate">{kicker}</p>
              )}
            </div>
            <div className="flex items-center shrink-0 -mt-1">
              {isSpeechSupported() && (
                <button
                  onClick={toggleVoice}
                  className="w-10 h-10 flex items-center justify-center rounded-full transition-colors hover:bg-[var(--nv-wash)]"
                  title={voiceMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
                  aria-label={voiceMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
                >
                  {voiceMuted ? (
                    <VolumeX className="w-5 h-5 text-[#5B6E7F]" strokeWidth={1.75} />
                  ) : (
                    <Volume2 className="w-5 h-5 text-[#B6BECB]" strokeWidth={1.75} />
                  )}
                </button>
              )}
              <button
                onClick={onEndNavigation}
                className="w-10 h-10 flex items-center justify-center rounded-full transition-colors hover:bg-[var(--nv-wash)]"
                aria-label="End navigation"
              >
                <X className="w-5 h-5 text-[#B6BECB]" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {waitingForGps ? (
            <div className="mt-4 space-y-3">
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
                className="mt-4"
              >
                <h1 className="mast mast-1 text-[#E6EAF0] truncate">{headline.action}</h1>
                {headline.detail && (
                  <p className="ui-text text-[#B6BECB] truncate mt-2">{headline.detail}</p>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        {/* The one caption, and the one flare: the digits to the next bump */}
        {bumpAhead && (
          <p className="caption mt-3 pl-3 flex items-center gap-2.5">
            <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-[#FF3D8E] shadow-[0_0_10px_#FF3D8E]" />
            <span>
              {bumpKindLabel(bumpAhead.bump)} in{' '}
              <span className="text-[#FF3D8E] mast-num">{toImperial(bumpAhead.distanceMeters).value}</span>
              {' '}{toImperial(bumpAhead.distanceMeters).unit}.
            </span>
          </p>
        )}
      </motion.header>

      {/* Trip bar — arrival, what's left, bumps left; then the two actions as
          type. Kept low and quiet so the road stays the composition. */}
      <motion.div
        variants={hudBottomVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        // Lifted one line clear of the floor: the tile attribution lives there.
        className="nv-frame fixed bottom-[calc(max(0.5rem,env(safe-area-inset-bottom))+1.25rem)] left-3 right-3 z-[1050]"
      >
        <div className="nv-glass rounded-[22px] px-5 pt-4 pb-1">
          {hasArrived ? (
            <p className="mast mast-2 text-[#E6EAF0]">You&rsquo;re here</p>
          ) : (
            <div className="grid grid-cols-[1fr_1fr_auto] gap-4 items-end">
              <div className="min-w-0">
                <p className="kicker">Arrive</p>
                <p className="mast mast-2 mast-num text-[#E6EAF0] mt-1.5 whitespace-nowrap">
                  {etaClock.replace(/\s?[AP]M$/i, '')}
                  <span className="kicker text-[#5B6E7F] ml-1 align-[0.3em]">{/pm$/i.test(etaClock) ? 'pm' : /am$/i.test(etaClock) ? 'am' : ''}</span>
                </p>
              </div>
              <div className="min-w-0">
                <p className="kicker">Left</p>
                <p className="mast mast-2 mast-num text-[#E6EAF0] mt-1.5 whitespace-nowrap">{leftClock}</p>
              </div>
              <div className="text-right">
                <p className="kicker">Bumps</p>
                <p className="mast mast-2 mast-num text-[#E6EAF0] mt-1.5">{bumpsLeft}</p>
              </div>
            </div>
          )}
          <p className="kicker mt-2.5 truncate">
            {hasArrived
              ? 'Smooth all the way'
              : `${formatDistance(remainingDistance)} to go · ${gps.label}${speedMph != null ? ` · ${speedMph} mph` : ''}`}
          </p>

          <div className="nv-hairline-t mt-3 flex items-center justify-between -mx-1">
            {onReportBump && !hasArrived ? (
              <button
                onClick={onReportBump}
                className="flex items-center gap-2.5 mono-bar text-[#E6EAF0] px-1 py-3.5 transition-opacity active:opacity-60"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden>
                  <path d="M2 17h5c1.5 0 2.2-6 5-6s3.5 6 5 6h5" />
                </svg>
                Report a bump
              </button>
            ) : (
              <span />
            )}
            <button
              onClick={onEndNavigation}
              className="mono-bar text-[#B6BECB] hover:text-[#E6EAF0] px-1 py-3.5 transition-colors active:opacity-60"
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
  const cls = 'w-7 h-7 text-[#E6EAF0]';
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
