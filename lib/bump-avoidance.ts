/**
 * Speed bump avoidance.
 *
 * Algorithm:
 * 1. Ask the router for the fastest route plus up to two alternates.
 * 2. For every candidate, find bumps within 20 m of its geometry (using the
 *    candidate's own bounding box, padded, so bowed routes aren't missed).
 * 3. If the fastest route crosses bumps and the profile allows a detour,
 *    ask the router again with those bumps as excluded locations (Valhalla
 *    `exclude_locations`). If the result still crosses bumps, exclude those
 *    too and try once more.
 * 4. Score every candidate within the detour budget by (bump count, duration)
 *    and offer the winner as the alternative — but only if it has strictly
 *    fewer bumps than the fastest route.
 */

import type { LatLng, AppRoute, RouteCalculationResult, RouteAvoidanceProfile, SpeedBump } from '@/types/speedbumps';
import {
  getMinSeverityToAvoid,
  getDetourBudget,
  getRoutingCosting,
  DEFAULT_AVOIDANCE_PROFILE,
} from '@/types/speedbumps';
import { getRouteCandidates, osrmResultToAppRoute, type OsrmRouteResult } from './osrm-service';
import { loadAllBumps, getBumpsInBounds, shouldAvoidBump } from './speed-bump-service';
import { distanceToLineSegment, haversineDistance, expandBounds } from './geo-utils';

/**
 * Bumps are road-snapped (see scripts/snap-bumps-to-roads.mjs) and route
 * geometry is precision-5, so genuine hits land within a few metres. A wider
 * radius picks up bumps on cross streets at intersections.
 */
const BUMP_PROXIMITY_METERS = 15;
const BOUNDS_PADDING_METERS = 50;
const MAX_EXCLUDE_LOCATIONS = 50;
const MAX_EXCLUSION_ROUNDS = 2;
const ALTERNATES_TO_REQUEST = 2;
/**
 * A bump this close to the origin or destination sits on the street you must
 * use to start or finish; excluding that edge makes the route impossible.
 */
const UNAVOIDABLE_ENDPOINT_METERS = 80;

/**
 * Calculate route from origin to destination with speed bump avoidance.
 * Returns primary route (fastest) and optionally an alternative with fewer bumps.
 */
export async function calculateRouteWithBumpAvoidance(
  origin: LatLng,
  destination: LatLng,
  avoidanceProfile: RouteAvoidanceProfile = DEFAULT_AVOIDANCE_PROFILE
): Promise<RouteCalculationResult> {
  const costing = getRoutingCosting(avoidanceProfile.vehicle);
  const minSeverity = getMinSeverityToAvoid(avoidanceProfile);
  const detourBudget = getDetourBudget(avoidanceProfile);

  const [candidates, allBumps] = await Promise.all([
    getRouteCandidates(origin, destination, { alternates: ALTERNATES_TO_REQUEST, costing }),
    loadAllBumps(),
  ]);
  const criticalBumps = allBumps.filter((b) => shouldAvoidBump(b, minSeverity));

  const scored = candidates.map((c) => annotateRoute(c, criticalBumps));
  const primary = scored[0];
  if (!primary) throw new Error('No routes returned');

  if (primary.speedBumpCount === 0 || detourBudget === 0) {
    return { primaryRoute: primary, alternativeRoute: undefined };
  }

  const maxDuration = primary.durationSeconds * (1 + detourBudget);
  const pool: AppRoute[] = scored.slice(1);

  // Bumps on the first/last street can't be routed around — don't ask.
  const isAvoidable = (b: SpeedBump) =>
    haversineDistance(b.location, origin) > UNAVOIDABLE_ENDPOINT_METERS &&
    haversineDistance(b.location, destination) > UNAVOIDABLE_ENDPOINT_METERS;

  // Exclusion rounds: tell the router to stay off the roads carrying the bumps
  // we've already hit. Each round widens the exclusion set with the bumps on
  // the best route so far.
  const excluded = new Map<string, SpeedBump>();
  let excludeSource: AppRoute = primary;
  for (let round = 0; round < MAX_EXCLUSION_ROUNDS; round++) {
    let added = 0;
    for (const b of excludeSource.bumpsOnRoute) {
      if (!isAvoidable(b) || excluded.has(b.id)) continue;
      excluded.set(b.id, b);
      added++;
    }
    if (excluded.size === 0 || (round > 0 && added === 0)) break;

    const exclude = pickExcludeLocations([...excluded.values()], excludeSource.polylinePoints);
    let results: OsrmRouteResult[];
    try {
      results = await getRouteCandidates(origin, destination, { exclude, costing });
    } catch {
      break; // router rejected the exclusion — settle for what we have
    }
    const annotated = results.map((r) => annotateRoute(r, criticalBumps));
    pool.push(...annotated);

    const best = pickBest(annotated, Infinity);
    if (!best || best.speedBumpCount === 0) break;
    if (best.speedBumpCount >= excludeSource.speedBumpCount) break; // not converging
    excludeSource = best;
  }

  const alternative = pickBest(pool, maxDuration);
  if (!alternative || alternative.speedBumpCount >= primary.speedBumpCount) {
    return { primaryRoute: primary, alternativeRoute: undefined };
  }
  if (isSameGeometry(alternative, primary)) {
    return { primaryRoute: primary, alternativeRoute: undefined };
  }

  return { primaryRoute: primary, alternativeRoute: alternative };
}

/** Convert a raw router result into an AppRoute with bump statistics. */
function annotateRoute(result: OsrmRouteResult, criticalBumps: SpeedBump[]): AppRoute {
  const route = osrmResultToAppRoute(result);
  const bumps = detectBumpsOnRoute(route.polylinePoints, criticalBumps);
  return {
    ...route,
    speedBumpCount: bumps.length,
    isSpeedBumpFree: bumps.length === 0,
    bumpsOnRoute: bumps,
  };
}

/** Fewest bumps, then fastest, among routes no slower than `maxDuration`. */
function pickBest(routes: AppRoute[], maxDuration: number): AppRoute | undefined {
  let best: AppRoute | undefined;
  for (const r of routes) {
    if (r.durationSeconds > maxDuration) continue;
    if (
      !best ||
      r.speedBumpCount < best.speedBumpCount ||
      (r.speedBumpCount === best.speedBumpCount && r.durationSeconds < best.durationSeconds)
    ) {
      best = r;
    }
  }
  return best;
}

/**
 * Choose which bumps to hand the router as exclusions, respecting the server
 * cap. Bumps are ordered along the route so the exclusions are spread over
 * the whole path rather than clustered near the origin.
 */
function pickExcludeLocations(bumps: SpeedBump[], routePoints: LatLng[]): LatLng[] {
  if (bumps.length <= MAX_EXCLUDE_LOCATIONS) return bumps.map((b) => b.location);
  const ordered = bumps
    .map((b) => ({ b, idx: closestIndex(b.location, routePoints) }))
    .sort((a, z) => a.idx - z.idx);
  const stride = ordered.length / MAX_EXCLUDE_LOCATIONS;
  const picked: LatLng[] = [];
  for (let i = 0; i < MAX_EXCLUDE_LOCATIONS; i++) {
    picked.push(ordered[Math.floor(i * stride)].b.location);
  }
  return picked;
}

function closestIndex(target: LatLng, points: LatLng[]): number {
  let minDist = Infinity;
  let idx = 0;
  for (let i = 0; i < points.length; i++) {
    const d = haversineDistance(target, points[i]);
    if (d < minDist) {
      minDist = d;
      idx = i;
    }
  }
  return idx;
}

/** Two routes are "the same" if their lengths and durations match closely. */
function isSameGeometry(a: AppRoute, b: AppRoute): boolean {
  return (
    Math.abs(a.distanceMeters - b.distanceMeters) < 5 &&
    Math.abs(a.durationSeconds - b.durationSeconds) < 2 &&
    a.polylinePoints.length === b.polylinePoints.length
  );
}

/** Detect bumps that intersect the route (within BUMP_PROXIMITY_METERS of any segment). */
export function detectBumpsOnRoute(routePoints: LatLng[], bumps: SpeedBump[]): SpeedBump[] {
  if (routePoints.length < 2 || bumps.length === 0) return [];

  const bounds = polylineBounds(routePoints);
  if (!bounds) return [];
  const expanded = expandBounds(bounds.sw, bounds.ne, BOUNDS_PADDING_METERS);
  const nearby = getBumpsInBounds(bumps, expanded.sw, expanded.ne);

  const intersecting: SpeedBump[] = [];
  for (const bump of nearby) {
    for (let i = 0; i < routePoints.length - 1; i++) {
      const dist = distanceToLineSegment(bump.location, routePoints[i], routePoints[i + 1]);
      if (dist <= BUMP_PROXIMITY_METERS) {
        intersecting.push(bump);
        break;
      }
    }
  }
  return intersecting;
}

/** Minimum bounding box for a list of route points. */
export function polylineBounds(points: LatLng[]): { sw: LatLng; ne: LatLng } | null {
  if (points.length === 0) return null;
  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;
  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  return { sw: { lat: minLat, lng: minLng }, ne: { lat: maxLat, lng: maxLng } };
}

export { haversineDistance };
