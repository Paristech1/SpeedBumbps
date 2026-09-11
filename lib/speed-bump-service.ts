/**
 * Speed bump data service.
 * Ported from Flutter: lib/features/routing/data/repositories/asset_speed_bump_repository.dart
 *
 * Loads speed bump data from /public/data/phl_speed_bumps.json.
 * In-memory cache after first load.
 */

import type { SpeedBump, LatLng } from '@/types/speedbumps';

interface RawSpeedBump {
  id: string;
  lat: number;
  lng: number;
}

/** Fired on window whenever the set of user-reported bumps changes. */
export const USER_REPORTS_CHANGED_EVENT = 'speedbumps:user-reports-changed';

let cachedBumps: SpeedBump[] | null = null;
let userBumps: SpeedBump[] = [];

/** Replace the set of user-reported bumps merged into loadAllBumps(). */
export function setUserReportedBumps(bumps: SpeedBump[]): void {
  userBumps = bumps;
}

/** Current user-reported bumps. */
export function getUserReportedBumps(): SpeedBump[] {
  return userBumps;
}

/** Load all speed bumps: JSON asset (cached after first fetch) + user reports. */
export async function loadAllBumps(): Promise<SpeedBump[]> {
  if (cachedBumps !== null) return [...cachedBumps, ...userBumps];

  const response = await fetch('/data/phl_speed_bumps.json');
  if (!response.ok) {
    throw new Error(`Failed to load speed bump data: ${response.status}`);
  }

  const raw = await response.json() as RawSpeedBump[];
  cachedBumps = raw.map((item) => ({
    id: item.id,
    location: { lat: item.lat, lng: item.lng },
    severity: 3, // default severity (matching Flutter defaults)
    isVerified: true,
    source: 'dataset' as const,
  }));

  return [...cachedBumps, ...userBumps];
}

/** Get speed bumps within a bounding box. */
export function getBumpsInBounds(
  bumps: SpeedBump[],
  sw: LatLng,
  ne: LatLng
): SpeedBump[] {
  return bumps.filter(
    (b) =>
      b.location.lat >= sw.lat &&
      b.location.lat <= ne.lat &&
      b.location.lng >= sw.lng &&
      b.location.lng <= ne.lng
  );
}

/** Whether a bump should be avoided given a minimum severity threshold. */
export function shouldAvoidBump(bump: SpeedBump, minSeverity: number): boolean {
  return bump.isVerified && bump.severity >= minSeverity;
}
