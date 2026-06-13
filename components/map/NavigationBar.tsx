'use client';

/**
 * Active navigation guidance bar — Velocity Dark "HUD" style.
 * Matches the active_navigation stitch: gradient blue header with
 * turn icon, instruction, ETA, and arrival card.
 */

import { useState } from 'react';
import {
  ArrowUp, ArrowLeft, ArrowRight, CornerUpLeft, CornerUpRight,
  MoveUpRight, MoveUpLeft, MapPin, RotateCw, GitFork, X, Square,
  Volume2, VolumeX,
} from 'lucide-react';
import type { RouteStep, LatLng, SpeedBump } from '@/types/speedbumps';
import { haversineDistance, formatDistance, formatDuration, routeProgress } from '@/lib/geo-utils';
import { useVoiceGuidance } from '@/hooks/useVoiceGuidance';
import { isSpeechSupported, isVoiceMuted, setVoiceMuted } from '@/lib/voice-guidance';

const STEP_ADVANCE_RADIUS_M = 30;

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
}

export function NavigationBar({
  steps,
  currentLocation,
  onEndNavigation,
  routePoints,
  totalDistanceMeters,
  totalDurationSeconds,
  speedBumps,
}: NavigationBarProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [voiceMuted, setVoiceMutedState] = useState(() => isVoiceMuted());

  // Reset to the first step whenever a new route's steps arrive
  // (adjust state during render — no effect needed).
  const [prevSteps, setPrevSteps] = useState(steps);
  if (steps !== prevSteps) {
    setPrevSteps(steps);
    setCurrentStepIndex(0);
  }

  // Advance to the next step once the driver reaches the current maneuver.
  // Derived during render; the functional update converges (see React's
  // "You Might Not Need an Effect").
  if (
    currentLocation &&
    steps.length > 0 &&
    currentStepIndex < steps.length - 1 &&
    haversineDistance(currentLocation, steps[currentStepIndex].location) < STEP_ADVANCE_RADIUS_M
  ) {
    setCurrentStepIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  useVoiceGuidance({ steps, currentStepIndex, currentLocation, active: true, speedBumps });

  const toggleVoice = () => {
    const next = !voiceMuted;
    setVoiceMutedState(next);
    setVoiceMuted(next); // also cancels any in-flight speech when muting
  };

  if (steps.length === 0) return null;

  const currentStep = steps[currentStepIndex];

  // Remaining distance/duration — continuous from GPS position when we have the
  // full route geometry; otherwise fall back to summing the remaining steps.
  const stepRemainingDistance = steps
    .slice(currentStepIndex)
    .reduce((sum, s) => sum + s.distanceMeters, 0);
  const stepRemainingDuration = steps
    .slice(currentStepIndex)
    .reduce((sum, s) => sum + s.durationSeconds, 0);

  let remainingDistance = stepRemainingDistance;
  let remainingDuration = stepRemainingDuration;
  if (
    currentLocation &&
    routePoints &&
    routePoints.length >= 2 &&
    totalDistanceMeters &&
    totalDistanceMeters > 0 &&
    totalDurationSeconds
  ) {
    const { remainingMeters } = routeProgress(routePoints, currentLocation);
    remainingDistance = remainingMeters;
    remainingDuration = totalDurationSeconds * (remainingMeters / totalDistanceMeters);
  }

  const isLastStep = currentStepIndex === steps.length - 1;
  const remainingMinutes = Math.max(1, Math.ceil(remainingDuration / 60));

  return (
    <>
      {/* Top Navigation Banner — Velocity Dark gradient header */}
      <header className="fixed top-0 left-0 w-full z-[1100] bg-gradient-to-r from-[#1565C0] to-[#2196F3] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-5">
          <div className="flex items-center gap-5">
            <div className="bg-white/20 p-3 rounded-2xl">
              <TurnIcon instruction={currentStep.instruction} />
            </div>
            <div>
              <h1 className="font-[var(--font-headline)] font-bold text-xl text-white tracking-tight leading-tight">
                {currentStep.instruction}
              </h1>
              <p className="font-[var(--font-body)] font-medium text-white/80 text-sm tracking-wider uppercase">
                {isLastStep
                  ? 'Arriving at destination'
                  : `In ${formatDistance(currentStep.distanceMeters)}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right border-l border-white/20 pl-6 hidden sm:block">
              <span className="font-[var(--font-headline)] font-black text-3xl text-white block">
                {remainingMinutes}
              </span>
              <span className="font-[var(--font-body)] font-semibold text-white/70 text-[10px] uppercase tracking-[0.2em]">
                min
              </span>
            </div>
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
      </header>

      {/* Bottom Arrival Card — Glassmorphic */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-[1100]">
        <div className="glass-panel p-6 rounded-2xl shadow-2xl ghost-border flex items-center justify-between">
          <div className="flex flex-col">
            <span className="font-[var(--font-body)] text-xs font-bold text-white/50 uppercase tracking-[0.15em] mb-1">
              Remaining
            </span>
            <h2 className="font-[var(--font-headline)] font-bold text-2xl text-[#e2e2eb]">
              {formatDuration(remainingDuration)} · {formatDistance(remainingDistance)}
            </h2>
          </div>
          <button
            onClick={onEndNavigation}
            className="bg-[#93000a] hover:bg-[#ffb4ab]/20 transition-all active:scale-95 px-8 py-3 rounded-full flex items-center gap-2 group"
          >
            <Square className="w-5 h-5 text-[#ffdad6] fill-current" />
            <span className="font-[var(--font-headline)] font-bold text-[#ffdad6] tracking-tight">Stop</span>
          </button>
        </div>
      </div>

      {/* Map indicator chips */}
      <div className="fixed bottom-32 left-6 z-[1100] flex flex-col gap-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-full glass-panel ghost-border">
          <div className="w-2 h-2 rounded-full bg-[#3ce36a]" />
          <span className="font-[var(--font-body)] text-[10px] font-bold text-white/70 uppercase">GPS High Precision</span>
        </div>
      </div>
    </>
  );
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
