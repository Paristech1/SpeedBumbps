'use client';

/**
 * Active navigation guidance bar — Velocity Dark "HUD" style.
 * Gradient blue header with the upcoming maneuver, live distance to it,
 * and an arrival card with remaining time/distance, ETA clock and speed.
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
  MoveUpRight, MoveUpLeft, MapPin, RotateCw, GitFork, X, Square,
  Volume2, VolumeX, Flag,
} from 'lucide-react';
import { hudTopVariants, hudBottomVariants, fadeScaleVariants } from '@/lib/motion';
import { Skeleton } from '@/components/ui/skeleton';
import type { RouteStep, LatLng, SpeedBump } from '@/types/speedbumps';
import { haversineDistance, formatDistance, formatDuration, routeProgress } from '@/lib/geo-utils';
import { useVoiceGuidance } from '@/hooks/useVoiceGuidance';
import { maneuverHeadline } from '@/lib/maneuver-display';
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

  const remainingMinutes = Math.max(hasArrived ? 0 : 1, Math.ceil(remainingDuration / 60));
  const etaClock = new Date(now + remainingDuration * 1000).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
  const speedMph = speedMps != null ? Math.round(speedMps * 2.23694) : null;

  const gps = gpsTier(gpsAccuracy ?? null);
  const waitingForGps = !hasArrived && distanceToManeuver == null;

  // The HUD sets the action at display size and the street underneath, so the
  // driver reads the turn in a glance rather than a sentence.
  const headline = hasArrived
    ? { action: 'Arrived', detail: 'Ending navigation…' }
    : maneuverHeadline(currentStep.instruction);
  const eyebrow = hasArrived
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
      {/* Top Navigation Banner — Velocity Dark gradient header */}
      <motion.header
        variants={hudTopVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed top-0 left-0 w-full z-[1050] bg-gradient-to-r from-[#1565C0] to-[#2196F3] shadow-2xl pt-[env(safe-area-inset-top)]"
      >
        <div className="px-6 py-5">
          {/* Kicker + controls share a row so the maneuver below gets the full width */}
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-white/20 p-2.5 rounded-2xl shrink-0">
                {hasArrived ? <Flag className="w-6 h-6 text-white" /> : <TurnIcon instruction={currentStep.instruction} />}
              </div>
              <p className="sb-eyebrow text-white/75 truncate">{eyebrow}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isSpeechSupported() && (
                <button
                  onClick={toggleVoice}
                  className={`p-2 rounded-full transition-colors ${
                    voiceMuted ? 'bg-white/10 hover:bg-white/20' : 'bg-white/20 hover:bg-white/30'
                  }`}
                  title={voiceMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
                  aria-label={voiceMuted ? 'Unmute voice guidance' : 'Mute voice guidance'}
                >
                  {voiceMuted ? (
                    <VolumeX className="w-6 h-6 text-white/60" />
                  ) : (
                    <Volume2 className="w-6 h-6 text-white" />
                  )}
                </button>
              )}
              <button
                onClick={onEndNavigation}
                className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-colors"
                aria-label="End navigation"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>

          {waitingForGps ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-11 w-56 max-w-full bg-white/20" />
              <Skeleton className="h-4 w-36 max-w-full bg-white/15" />
            </div>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={hasArrived ? 'arrived' : `step-${currentStepIndex}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="mt-3 flex items-end justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <h1 className="sb-display uppercase text-white truncate">{headline.action}</h1>
                  {headline.detail && (
                    <p className="sb-support text-white/80 truncate mt-1.5">{headline.detail}</p>
                  )}
                </div>
                <div className="text-right border-l border-white/20 pl-6 hidden sm:block shrink-0">
                  <span className="sb-data text-white block">{remainingMinutes}</span>
                  <span className="sb-eyebrow text-white/70 block mt-1">min</span>
                </div>
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </motion.header>

      {/* Bottom Arrival Card — Glassmorphic */}
      <motion.div
        variants={hudBottomVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed bottom-[max(2rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-[92%] max-w-md z-[1050]"
      >
        <div className="glass-panel p-6 rounded-2xl shadow-2xl ghost-border flex items-center justify-between gap-4">
          <div className="flex flex-col min-w-0">
            <span className="sb-eyebrow text-white/50 mb-1.5">
              {hasArrived ? 'Arrived' : 'Remaining'}
            </span>
            <h2 className="sb-display-sm text-[#e2e2eb] truncate tabular-nums">
              {hasArrived ? "You're here" : formatDuration(remainingDuration)}
            </h2>
            <span className="sb-support font-semibold text-[#9ecaff] mt-1.5 truncate">
              {hasArrived ? (
                'Smooth all the way'
              ) : (
                <>
                  {formatDistance(remainingDistance)} · ETA {etaClock}
                  {speedMph != null && (
                    <span className="text-white/50 hidden min-[380px]:inline"> · {speedMph} mph</span>
                  )}
                </>
              )}
            </span>
          </div>
          <button
            onClick={onEndNavigation}
            className="bg-[#93000a] hover:bg-[#ffb4ab]/20 transition-all active:scale-95 px-6 py-3.5 rounded-full flex items-center gap-2 group shrink-0"
          >
            <Square className="w-5 h-5 text-[#ffdad6] fill-current" />
            <span className="sb-title text-[#ffdad6] uppercase">
              {hasArrived ? 'Done' : 'Stop'}
            </span>
          </button>
        </div>
      </motion.div>

      {/* Map indicator chips */}
      <motion.div
        variants={fadeScaleVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed bottom-[max(11rem,calc(env(safe-area-inset-bottom)+8.5rem))] left-6 z-[1050] flex flex-col gap-2"
      >
        <div className="flex items-center gap-2 px-3 py-2 rounded-full glass-panel ghost-border">
          <div className={`w-2 h-2 rounded-full ${gps.dotClass}`} />
          <span className="sb-eyebrow text-white/70 tracking-[0.1em]">{gps.label}</span>
        </div>
      </motion.div>
    </>
  );
}

function gpsTier(accuracy: number | null): { label: string; dotClass: string } {
  if (accuracy == null) return { label: 'GPS Searching', dotClass: 'bg-[#89919d] animate-pulse' };
  if (accuracy <= 10) return { label: 'GPS High Precision', dotClass: 'bg-[#3ce36a]' };
  if (accuracy <= 30) return { label: `GPS Good · ${Math.round(accuracy)} m`, dotClass: 'bg-[#9ecaff]' };
  return { label: `GPS Weak · ${Math.round(accuracy)} m`, dotClass: 'bg-[#FF6B00]' };
}

function TurnIcon({ instruction }: { instruction: string }) {
  const cls = 'w-6 h-6 text-white';
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
