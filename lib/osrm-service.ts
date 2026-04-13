/**
 * OSRM routing service — free, no API key required.
 * Ported from Flutter: lib/features/routing/data/datasources/osrm_directions_api.dart
 */

import type { LatLng, RouteStep, AppRoute } from '@/types/speedbumps';

const OSRM_BASE_URL = 'https://router.project-osrm.org/route/v1/driving';

/**
 * Build a human-readable instruction from OSRM maneuver fields.
 * The OSRM demo server often doesn't populate `maneuver.instruction`,
 * so we construct it from `type`, `modifier`, and the step's `name` (street).
 */
function buildInstruction(type: string, modifier: string, streetName: string): string {
  const onto = streetName ? ` onto ${streetName}` : '';
  const on = streetName ? ` on ${streetName}` : '';

  switch (type) {
    case 'depart':
      return streetName ? `Head on ${streetName}` : 'Depart';
    case 'arrive':
      return 'Arrive at destination';
    case 'turn': {
      switch (modifier) {
        case 'left': return `Turn left${onto}`;
        case 'right': return `Turn right${onto}`;
        case 'slight left': return `Slight left${onto}`;
        case 'slight right': return `Slight right${onto}`;
        case 'sharp left': return `Sharp left${onto}`;
        case 'sharp right': return `Sharp right${onto}`;
        case 'uturn': return 'Make a U-turn';
        case 'straight': return `Continue straight${onto}`;
        default: return `Turn${onto}`;
      }
    }
    case 'new name':
    case 'notification':
      return streetName ? `Continue onto ${streetName}` : 'Continue';
    case 'continue':
      return streetName ? `Continue${on}` : 'Continue';
    case 'merge':
      if (modifier === 'slight left' || modifier === 'left') return `Merge left${onto}`;
      if (modifier === 'slight right' || modifier === 'right') return `Merge right${onto}`;
      return `Merge${onto}`;
    case 'on ramp':
    case 'off ramp':
      if (modifier?.includes('left')) return `Take the ramp on the left${onto}`;
      if (modifier?.includes('right')) return `Take the ramp on the right${onto}`;
      return `Take the ramp${onto}`;
    case 'fork':
      if (modifier?.includes('left')) return streetName ? `Keep left onto ${streetName}` : 'Keep left';
      if (modifier?.includes('right')) return streetName ? `Keep right onto ${streetName}` : 'Keep right';
      return streetName ? `Keep straight onto ${streetName}` : 'Continue';
    case 'end of road':
      if (modifier === 'left') return `At end of road, turn left${onto}`;
      if (modifier === 'right') return `At end of road, turn right${onto}`;
      return `At end of road, continue${onto}`;
    case 'roundabout':
    case 'rotary':
      return streetName ? `Take the roundabout to ${streetName}` : 'Enter the roundabout';
    case 'exit roundabout':
    case 'exit rotary':
      return streetName ? `Exit roundabout onto ${streetName}` : 'Exit the roundabout';
    default:
      return streetName ? `Continue on ${streetName}` : 'Continue';
  }
}

export interface OsrmRouteResult {
  polylinePoints: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
}

/**
 * Decode Google-format encoded polyline string to LatLng array.
 * Ported exactly from osrm_directions_api.dart decodePolyline()
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

/**
 * Fetch a route from OSRM.
 * Coordinates are lng,lat format (OSRM convention).
 */
export async function getOsrmRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints?: LatLng[]
): Promise<OsrmRouteResult> {
  const coords: string[] = [];
  coords.push(`${origin.lng},${origin.lat}`);
  if (waypoints && waypoints.length > 0) {
    for (const wp of waypoints) {
      coords.push(`${wp.lng},${wp.lat}`);
    }
  }
  coords.push(`${destination.lng},${destination.lat}`);

  const path = coords.join(';');
  const url = new URL(`${OSRM_BASE_URL}/${path}`);
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'polyline');
  url.searchParams.set('steps', 'true');

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`OSRM request failed: ${response.status}`);
  }

  const json = await response.json();
  const code = json.code as string ?? '';
  if (code !== 'Ok') {
    throw new Error(`OSRM error: ${code}`);
  }

  const routes = json.routes as unknown[] ?? [];
  if (routes.length === 0) {
    throw new Error('No routes returned from OSRM');
  }

  const route = routes[0] as Record<string, unknown>;
  const geometry = (route.geometry as string) ?? '';
  const distance = (route.distance as number) ?? 0;
  const duration = (route.duration as number) ?? 0;
  const legs = (route.legs as unknown[]) ?? [];

  const polylinePoints = geometry ? decodePolyline(geometry) : [];

  const steps: RouteStep[] = [];
  for (const leg of legs) {
    const legMap = leg as Record<string, unknown>;
    const legSteps = (legMap.steps as unknown[]) ?? [];
    for (const s of legSteps) {
      const stepMap = s as Record<string, unknown>;
      const maneuver = (stepMap.maneuver as Record<string, unknown>) ?? {};
      const maneuverType = (maneuver.type as string) ?? '';
      const maneuverModifier = (maneuver.modifier as string) ?? '';
      const streetName = (stepMap.name as string) ?? '';
      const instruction = buildInstruction(maneuverType, maneuverModifier, streetName);
      const stepDistance = (stepMap.distance as number) ?? 0;
      const stepDuration = (stepMap.duration as number) ?? 0;
      const loc = stepMap.location as number[] | null;
      const sLng = loc && loc.length > 0 ? loc[0] : 0;
      const sLat = loc && loc.length > 1 ? loc[1] : 0;
      steps.push({
        instruction,
        distanceMeters: stepDistance,
        durationSeconds: Math.round(stepDuration),
        location: { lat: sLat, lng: sLng },
      });
    }
  }

  if (steps.length === 0 && polylinePoints.length >= 2) {
    steps.push({
      instruction: 'Head to destination',
      distanceMeters: distance,
      durationSeconds: Math.round(duration),
      location: polylinePoints[polylinePoints.length - 1],
    });
  }

  return {
    polylinePoints,
    distanceMeters: distance,
    durationSeconds: Math.round(duration),
    steps,
  };
}

/** Convert an OsrmRouteResult to an AppRoute domain entity. */
export function osrmResultToAppRoute(result: OsrmRouteResult): AppRoute {
  return {
    id: `route-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    polylinePoints: result.polylinePoints,
    steps: result.steps,
    distanceMeters: result.distanceMeters,
    durationSeconds: result.durationSeconds,
    speedBumpCount: 0,
    isSpeedBumpFree: false,
    calculatedAt: new Date(),
  };
}
