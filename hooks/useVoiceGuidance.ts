'use client';

/**
 * Spoken turn-by-turn announcements during active navigation.
 * Trigger tiers adapted from OsmAnd's voice-prompt algorithm:
 *   early ("In 300 meters, turn right…") ≤ EARLY_ANNOUNCE_M
 *   now   ("Turn right onto …")          ≤ NOW_ANNOUNCE_M
 * Each (step, tier) is announced once; state resets on a new route.
 *
 * Also gives the warmer, on-brand SpeedBumps voice and, when a route still
 * crosses a speed bump, a heads-up alert as the driver approaches it.
 */

import { useEffect, useRef } from 'react';
import type { RouteStep, LatLng, SpeedBump } from '@/types/speedbumps';
import { haversineDistance } from '@/lib/geo-utils';
import { speak, cancelSpeech, speechDistance } from '@/lib/voice-guidance';

const EARLY_ANNOUNCE_M = 320;
const NOW_ANNOUNCE_M = 80;
const BUMP_ALERT_M = 110; // call out a bump while there's still time to slow down

interface UseVoiceGuidanceOptions {
  steps: RouteStep[];
  currentStepIndex: number;
  currentLocation: LatLng | null;
  active: boolean;
  /** Speed bumps that lie on the selected route, for proximity alerts. */
  speedBumps?: SpeedBump[];
}

function announcementText(step: RouteStep, isLastStep: boolean): string {
  if (isLastStep && step.instruction.toLowerCase().startsWith('arrive')) {
    return "You've arrived — smooth all the way. Nice driving!";
  }
  return step.instruction;
}

function bumpAlertText(severity: number): string {
  if (severity >= 4) return 'Caution — rough speed bump just ahead. Ease off the gas.';
  if (severity >= 2) return 'Heads up, speed bump ahead. Take it easy.';
  return 'Gentle speed bump coming up.';
}

export function useVoiceGuidance({
  steps,
  currentStepIndex,
  currentLocation,
  active,
  speedBumps,
}: UseVoiceGuidanceOptions) {
  const spokenRef = useRef<Set<string>>(new Set());
  const hasIntroducedRef = useRef(false);
  const introducedStepsRef = useRef<RouteStep[] | null>(null);
  const announcedBumpsRef = useRef<Set<string>>(new Set());

  // New route (or reroute): forget what was announced and introduce it.
  // The full intro only on the first route of the session — reroutes just
  // announce their first instruction.
  useEffect(() => {
    if (!active || steps.length === 0) return;
    if (introducedStepsRef.current === steps) return; // StrictMode re-run guard
    introducedStepsRef.current = steps;
    // The intro speaks step 0's instruction; its maneuver point is the
    // origin, so mark its tiers spoken or "now" would cancel the intro.
    spokenRef.current = new Set(['0:start', '0:early', '0:now']);
    announcedBumpsRef.current = new Set();
    if (hasIntroducedRef.current) {
      speak(steps[0].instruction);
    } else {
      hasIntroducedRef.current = true;
      speak(`Alright, let's roll — I'll keep it smooth. ${steps[0].instruction}`);
    }
  }, [active, steps]);

  // Distance-based announcement tiers
  useEffect(() => {
    if (!active || !currentLocation || steps.length === 0) return;
    const step = steps[currentStepIndex];
    if (!step) return;

    const isLastStep = currentStepIndex === steps.length - 1;
    const distance = haversineDistance(currentLocation, step.location);
    const spoken = spokenRef.current;

    const nowKey = `${currentStepIndex}:now`;
    const earlyKey = `${currentStepIndex}:early`;

    if (distance <= NOW_ANNOUNCE_M) {
      if (!spoken.has(nowKey)) {
        spoken.add(nowKey);
        spoken.add(earlyKey); // too late for the early tier
        speak(announcementText(step, isLastStep));
      }
    } else if (distance <= EARLY_ANNOUNCE_M && !spoken.has(earlyKey)) {
      spoken.add(earlyKey);
      speak(`In ${speechDistance(distance)}, ${announcementText(step, isLastStep)}`);
    }
  }, [active, currentLocation, currentStepIndex, steps]);

  // Speed-bump proximity alerts — fire once per bump as the driver nears it.
  useEffect(() => {
    if (!active || !currentLocation || !speedBumps || speedBumps.length === 0) return;
    const announced = announcedBumpsRef.current;
    for (const bump of speedBumps) {
      if (announced.has(bump.id)) continue;
      if (haversineDistance(currentLocation, bump.location) <= BUMP_ALERT_M) {
        announced.add(bump.id);
        speak(bumpAlertText(bump.severity));
        break; // one heads-up at a time
      }
    }
  }, [active, currentLocation, speedBumps]);

  // iOS recovery: backgrounding mid-utterance can wedge the synthesizer;
  // a cancel on return clears it (the gesture unlock persists for the page)
  useEffect(() => {
    if (!active) return;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') cancelSpeech();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      cancelSpeech();
    };
  }, [active]);
}
