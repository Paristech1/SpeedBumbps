/**
 * The next bump in front of the driver — the one thing on the map that earns
 * the ember accent, and the line the HUD reads out ("speed table in 250 ft").
 *
 * "Ahead" is measured along the route, not as the crow flies: a bump on the
 * block you just left can be closer in metres than the one you are about to hit.
 */

import { haversineDistance, routeProgress } from './geo-utils';
import type { LatLng, SpeedBump } from '@/types/speedbumps';

/** Bumps further than this along the route aren't worth a warning yet. */
export const BUMP_AHEAD_RANGE_M = 400;

export interface BumpAhead {
  bump: SpeedBump;
  /** Metres from the driver to the bump measured along the route. */
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

  // Compare how much route each still has left rather than which vertex each
  // is nearest: on a long straight segment the driver and a bump they have
  // already crossed share a vertex, and the bump would read as ahead.
  const driverRemaining = routeProgress(routePoints, location).remainingMeters;

  let best: BumpAhead | null = null;
  for (const bump of bumps) {
    const bumpRemaining = routeProgress(routePoints, bump.location).remainingMeters;
    const distanceMeters = driverRemaining - bumpRemaining;
    if (distanceMeters <= 0) continue; // already behind us
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

  const driverRemaining = routeProgress(routePoints, location).remainingMeters;
  return bumps.filter((b) => routeProgress(routePoints, b.location).remainingMeters < driverRemaining).length;
}

/** Label for a bump's kind, as the HUD and report sheet say it. */
export function bumpKindLabel(bump: SpeedBump): string {
  return bump.source === 'user' ? 'reported bump' : 'speed table';
}
