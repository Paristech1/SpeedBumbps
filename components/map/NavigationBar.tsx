'use client';

/**
 * Active navigation guidance bar — shown when isNavigating === true.
 * Displays current turn instruction, distance to next maneuver,
 * and remaining trip stats. Advances steps as user approaches each waypoint.
 */

import { useState, useEffect, useRef } from 'react';
import {
  ArrowUp, ArrowLeft, ArrowRight, CornerUpLeft, CornerUpRight,
  MoveUpRight, MoveUpLeft, MapPin, RotateCw, GitFork, X,
} from 'lucide-react';
import type { RouteStep, LatLng } from '@/types/speedbumps';
import { haversineDistance, formatDistance, formatDuration } from '@/lib/geo-utils';

const STEP_ADVANCE_RADIUS_M = 30;

interface NavigationBarProps {
  steps: RouteStep[];
  currentLocation: LatLng | null;
  onEndNavigation: () => void;
}

export function NavigationBar({ steps, currentLocation, onEndNavigation }: NavigationBarProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const prevLocationRef = useRef<LatLng | null>(null);

  // Advance step when user comes within STEP_ADVANCE_RADIUS_M of the current step's location
  useEffect(() => {
    if (!currentLocation || steps.length === 0) return;
    if (currentStepIndex >= steps.length - 1) return;

    const step = steps[currentStepIndex];
    const dist = haversineDistance(currentLocation, step.location);
    if (dist < STEP_ADVANCE_RADIUS_M) {
      setCurrentStepIndex((i) => Math.min(i + 1, steps.length - 1));
    }

    prevLocationRef.current = currentLocation;
  }, [currentLocation, currentStepIndex, steps]);

  // Reset step index when steps change (new route)
  useEffect(() => {
    setCurrentStepIndex(0);
  }, [steps]);

  if (steps.length === 0) return null;

  const currentStep = steps[currentStepIndex];

  // Remaining distance/duration = sum of steps from currentStepIndex onward
  const remainingSteps = steps.slice(currentStepIndex);
  const remainingDistance = remainingSteps.reduce((sum, s) => sum + s.distanceMeters, 0);
  const remainingDuration = remainingSteps.reduce((sum, s) => sum + s.durationSeconds, 0);

  const isLastStep = currentStepIndex === steps.length - 1;

  return (
    <div className="absolute left-0 right-0 top-0 z-[1100] bg-blue-600 dark:bg-blue-700 shadow-lg">
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Turn icon */}
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <TurnIcon instruction={currentStep.instruction} />
        </div>

        {/* Instruction + distance */}
        <div className="flex-1 min-w-0">
          <div className="text-white font-semibold text-sm leading-tight truncate">
            {currentStep.instruction}
          </div>
          <div className="text-blue-200 text-xs mt-0.5">
            {isLastStep
              ? 'Arriving at destination'
              : `In ${formatDistance(currentStep.distanceMeters)}`}
          </div>
        </div>

        {/* Remaining trip summary */}
        <div className="text-right shrink-0 mr-1">
          <div className="text-white font-semibold text-sm">{formatDuration(remainingDuration)}</div>
          <div className="text-blue-200 text-xs">{formatDistance(remainingDistance)}</div>
        </div>

        {/* End navigation */}
        <button
          onClick={onEndNavigation}
          className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center shrink-0 transition-colors"
          aria-label="End navigation"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}

function TurnIcon({ instruction }: { instruction: string }) {
  const cls = 'w-5 h-5 text-white';
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
