/**
 * OSRM routing service — free, no API key required.
 * Ported from Flutter: lib/features/routing/data/datasources/osrm_directions_api.dart
 */

import type { LatLng, RouteStep, AppRoute } from '@/types/speedbumps';
import { haversineDistance } from './geo-utils';

const OSRM_PROXY_URL = '/api/route';

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

export type RoutingCosting = 'auto' | 'motorcycle' | 'bicycle';

export interface RouteRequestOptions {
  /** Intermediate via points (forces the path through them). */
  waypoints?: LatLng[];
  /** Points whose nearest roads should be excluded from the path (Valhalla only). */
  exclude?: LatLng[];
  /** How many alternate routes to request in addition to the primary (0–3). */
  alternates?: number;
  costing?: RoutingCosting;
}

/**
 * Fetch one or more candidate routes from the routing proxy.
 * Returns the primary route first, followed by any alternates the server produced.
 */
export async function getRouteCandidates(
  origin: LatLng,
  destination: LatLng,
  options: RouteRequestOptions = {}
): Promise<OsrmRouteResult[]> {
  const coordParts: string[] = [];
  coordParts.push(`${origin.lng},${origin.lat}`);
  for (const wp of options.waypoints ?? []) {
    coordParts.push(`${wp.lng},${wp.lat}`);
  }
  coordParts.push(`${destination.lng},${destination.lat}`);

  const url = new URL(OSRM_PROXY_URL, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  url.searchParams.set('coords', coordParts.join(';'));
  url.searchParams.set('overview', 'full');
  url.searchParams.set('geometries', 'polyline');
  url.searchParams.set('steps', 'true');
  if (options.alternates && options.alternates > 0) {
    url.searchParams.set('alternates', String(options.alternates));
  }
  if (options.exclude && options.exclude.length > 0) {
    url.searchParams.set('exclude', options.exclude.map((p) => `${p.lng},${p.lat}`).join(';'));
  }
  if (options.costing && options.costing !== 'auto') {
    url.searchParams.set('costing', options.costing);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Routing request failed: ${response.status}`);
  }

  const json = await response.json();
  const code = json.code as string ?? '';
  if (code !== 'Ok') {
    throw new Error(`Routing error: ${code}`);
  }

  const routes = json.routes as unknown[] ?? [];
  if (routes.length === 0) {
    throw new Error('No routes returned');
  }

  return routes
    .map((r) => parseOsrmRoute(r as Record<string, unknown>))
    .filter((r) => r.polylinePoints.length >= 2);
}

/**
 * Fetch a single route (primary only). Kept for callers that only need one path.
 */
export async function getOsrmRoute(
  origin: LatLng,
  destination: LatLng,
  waypoints?: LatLng[]
): Promise<OsrmRouteResult> {
  const [first] = await getRouteCandidates(origin, destination, { waypoints });
  if (!first) throw new Error('No routes returned');
  return first;
}

function parseOsrmRoute(route: Record<string, unknown>): OsrmRouteResult {
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
      const loc = (stepMap.location ?? maneuver.location) as number[] | null;
      const sLng = loc && loc.length > 0 ? loc[0] : 0;
      const sLat = loc && loc.length > 1 ? loc[1] : 0;
      steps.push({
        instruction,
        distanceMeters: stepDistance,
        durationSeconds: Math.round(stepDuration),
        location: { lat: sLat, lng: sLng },
        polylineIndex: 0,
      });
    }
  }

  if (steps.length === 0 && polylinePoints.length >= 2) {
    steps.push({
      instruction: 'Head to destination',
      distanceMeters: distance,
      durationSeconds: Math.round(duration),
      location: polylinePoints[polylinePoints.length - 1],
      polylineIndex: polylinePoints.length - 1,
    });
  }

  assignStepPolylineIndices(steps, polylinePoints);

  return {
    polylinePoints,
    distanceMeters: distance,
    durationSeconds: Math.round(duration),
    steps,
  };
}

/**
 * Map each maneuver onto the route polyline. Indices are monotonic: a step's
 * maneuver can never sit before the previous step's, which keeps
 * progress-based step tracking stable even when maneuvers are close together.
 */
export function assignStepPolylineIndices(steps: RouteStep[], polylinePoints: LatLng[]): void {
  if (polylinePoints.length === 0) return;
  let searchFrom = 0;
  for (const step of steps) {
    let bestIdx = searchFrom;
    let bestDist = Infinity;
    for (let i = searchFrom; i < polylinePoints.length; i++) {
      const d = haversineDistance(step.location, polylinePoints[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    step.polylineIndex = bestIdx;
    searchFrom = bestIdx;
  }
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
    bumpsOnRoute: [],
    calculatedAt: new Date(),
  };
}
