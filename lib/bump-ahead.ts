/**
 * The next bump in front of the driver — the one thing on the map that earns
 * the ember accent, and the line the HUD reads out ("speed table in 250 ft").
 *
 * "Ahead" is measured along the route, not as the crow flies: a bump on the
 * block you just left can be closer in metres than the one you are about to hit.
 */

import { findClosestPointIndex, haversineDistance, routeProgress } from './geo-utils';
import type { LatLng, SpeedBump } from '@/types/speedbumps';

/** Bumps further than this along the route aren't worth a warning yet. */
export const BUMP_AHEAD_RANGE_M = 400;

export interface BumpAhead {
  bump: SpeedBump;
  /** Straight-line metres from the driver to the bump. */
  distanceMeters: number;
}

export function nextBumpAhead(
  bumps: SpeedBump[] | undefined | null,
  location: LatLng | null,
  routePoints: LatLng[] | undefined | null,
  rangeMeters = BUMP_AHEAD_RANGE_M,
): BumpAhead | null {
  if (!bumps || bumps.length === 0 || !location) return null;

  // Without geometry, fall back to the nearest bump in range.
  if (!routePoints || routePoints.length < 2) {
    return nearest(bumps, location, rangeMeters);
  }

  const progress = routeProgress(routePoints, location);
  let best: BumpAhead | null = null;
  for (const bump of bumps) {
    const index = findClosestPointIndex(bump.location, routePoints);
    if (index < progress.segmentIndex) continue; // already behind us
    const distanceMeters = haversineDistance(location, bump.location);
    if (distanceMeters > rangeMeters) continue;
    if (!best || distanceMeters < best.distanceMeters) best = { bump, distanceMeters };
  }
  return best;
}

function nearest(bumps: SpeedBump[], location: LatLng, rangeMeters: number): BumpAhead | null {
  let best: BumpAhead | null = null;
  for (const bump of bumps) {
    const distanceMeters = haversineDistance(location, bump.location);
    if (distanceMeters > rangeMeters) continue;
    if (!best || distanceMeters < best.distanceMeters) best = { bump, distanceMeters };
  }
  return best;
}

/** How many bumps the driver still has to cross on this route. */
export function bumpsRemaining(
  bumps: SpeedBump[] | undefined | null,
  location: LatLng | null,
  routePoints: LatLng[] | undefined | null,
): number {
  if (!bumps || bumps.length === 0) return 0;
  if (!location || !routePoints || routePoints.length < 2) return bumps.length;

  const progress = routeProgress(routePoints, location);
  return bumps.filter((b) => findClosestPointIndex(b.location, routePoints) >= progress.segmentIndex).length;
}

/** Label for a bump's kind, as the HUD and report sheet say it. */
export function bumpKindLabel(bump: SpeedBump): string {
  return bump.source === 'user' ? 'reported bump' : 'speed table';
}
