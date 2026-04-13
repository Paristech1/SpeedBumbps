/**
 * Speed bump avoidance algorithm.
 * Ported from Flutter: lib/features/routing/domain/usecases/calculate_route_with_bump_avoidance.dart
 *
 * Algorithm:
 * 1. Get default OSRM route
 * 2. Expand bounding box by 200m, get bumps in bounds
 * 3. Filter bumps by minSeverityToAvoid
 * 4. Detect bumps within 20m of route segments
 * 5. Generate avoidance waypoints (offset ±5 route points from each bump)
 * 6. Sort and deduplicate waypoints
 * 7. Re-request route with avoidance waypoints
 * 8. Return primary + alternative routes with bump counts
 */

import type { LatLng, AppRoute, RouteCalculationResult, RouteAvoidanceProfile, SpeedBump } from '@/types/speedbumps';
import { getMinSeverityToAvoid, DEFAULT_AVOIDANCE_PROFILE } from '@/types/speedbumps';
import { getOsrmRoute, osrmResultToAppRoute } from './osrm-service';
import { loadAllBumps, getBumpsInBounds, shouldAvoidBump } from './speed-bump-service';
import {
  distanceToLineSegment,
  haversineDistance,
  findClosestPointIndex,
  expandBounds,
  routeBounds,
} from './geo-utils';

const BUMP_PROXIMITY_METERS = 20;
const WAYPOINT_OFFSET_POINTS = 5;
const BOUNDS_PADDING_METERS = 200;

/**
 * Calculate route from origin to destination with optional speed bump avoidance.
 * Returns primary route (fastest) and optionally an alternative (bump-avoiding) route.
 */
export async function calculateRouteWithBumpAvoidance(
  origin: LatLng,
  destination: LatLng,
  avoidanceProfile: RouteAvoidanceProfile = DEFAULT_AVOIDANCE_PROFILE
): Promise<RouteCalculationResult> {
  // Step 1: Default route
  const defaultResult = await getOsrmRoute(origin, destination);
  const defaultRoute = osrmResultToAppRoute(defaultResult);

  // Step 2: Load bumps in expanded route bounds
  const { sw, ne } = routeBounds(origin, destination);
  const expanded = expandBounds(sw, ne, BOUNDS_PADDING_METERS);
  const allBumps = await loadAllBumps();
  const bumpsInBounds = getBumpsInBounds(allBumps, expanded.sw, expanded.ne);

  const minSeverity = getMinSeverityToAvoid(avoidanceProfile);
  const criticalBumps = bumpsInBounds.filter((b) => shouldAvoidBump(b, minSeverity));

  // Step 3: Detect bumps on route
  const bumpsOnRoute = detectBumpsOnRoute(defaultRoute.polylinePoints, criticalBumps);

  if (bumpsOnRoute.length === 0) {
    return {
      primaryRoute: { ...defaultRoute, isSpeedBumpFree: true, speedBumpCount: 0 },
      alternativeRoute: undefined,
    };
  }

  // Step 4: Generate avoidance waypoints
  const waypoints = generateAvoidanceWaypoints(bumpsOnRoute, defaultRoute.polylinePoints);

  let alternativeRoute: AppRoute | undefined;
  try {
    const altResult = await getOsrmRoute(origin, destination, waypoints);
    const altRoute = osrmResultToAppRoute(altResult);
    const bumpsOnAlt = detectBumpsOnRoute(altRoute.polylinePoints, criticalBumps);
    alternativeRoute = {
      ...altRoute,
      speedBumpCount: bumpsOnAlt.length,
      isSpeedBumpFree: bumpsOnAlt.length === 0,
    };
  } catch {
    // Avoidance routing failed — return primary only
    return {
      primaryRoute: {
        ...defaultRoute,
        speedBumpCount: bumpsOnRoute.length,
        isSpeedBumpFree: false,
      },
      alternativeRoute: undefined,
    };
  }

  return {
    primaryRoute: {
      ...defaultRoute,
      speedBumpCount: bumpsOnRoute.length,
      isSpeedBumpFree: false,
    },
    alternativeRoute,
  };
}

/** Detect bumps that intersect the route (within BUMP_PROXIMITY_METERS of any segment). */
function detectBumpsOnRoute(routePoints: LatLng[], bumps: SpeedBump[]): SpeedBump[] {
  const intersecting: SpeedBump[] = [];
  for (const bump of bumps) {
    let found = false;
    for (let i = 0; i < routePoints.length - 1 && !found; i++) {
      const dist = distanceToLineSegment(bump.location, routePoints[i], routePoints[i + 1]);
      if (dist <= BUMP_PROXIMITY_METERS) {
        intersecting.push(bump);
        found = true;
      }
    }
  }
  return intersecting;
}

/** Generate ordered, deduplicated waypoints to force route around detected bumps. */
function generateAvoidanceWaypoints(bumps: SpeedBump[], routePoints: LatLng[]): LatLng[] {
  if (routePoints.length === 0 || bumps.length === 0) return [];

  interface IndexedWaypoint {
    index: number;
    point: LatLng;
  }

  const indexed: IndexedWaypoint[] = [];
  for (const bump of bumps) {
    const idx = findClosestPointIndex(bump.location, routePoints);
    const before = idx - WAYPOINT_OFFSET_POINTS;
    const after = idx + WAYPOINT_OFFSET_POINTS;
    if (before >= 0 && before < routePoints.length) {
      indexed.push({ index: before, point: routePoints[before] });
    }
    if (after >= 0 && after < routePoints.length) {
      indexed.push({ index: after, point: routePoints[after] });
    }
  }

  indexed.sort((a, b) => a.index - b.index);

  const waypoints: LatLng[] = [];
  let last: LatLng | null = null;
  for (const item of indexed) {
    if (!last || last.lat !== item.point.lat || last.lng !== item.point.lng) {
      waypoints.push(item.point);
      last = item.point;
    }
  }
  return waypoints;
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
