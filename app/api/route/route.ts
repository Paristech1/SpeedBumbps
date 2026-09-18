/**
 * Routing proxy — tries Valhalla (fast, reliable) first, then OSRM servers as fallback.
 * Normalises all responses to OSRM's JSON shape so the client layer is unchanged.
 */

import { NextRequest, NextResponse } from 'next/server';
import { valhallaTypeToOsrm } from '@/lib/valhalla-maneuvers';

const SERVER_TIMEOUT_MS = 8000;

// --- Valhalla (primary) ---

const VALHALLA_URL = 'https://valhalla1.openstreetmap.de/route';

// Valhalla uses the same Google-encoded polyline format per leg shape.
// We decode and re-encode as a single full-trip polyline in OSRM format.

interface ValhallaManeuver {
  type: number;
  instruction: string;
  time: number;
  length: number; // km
  begin_shape_index: number;
  end_shape_index?: number;
  street_names?: string[];
}

interface ValhallaLeg {
  shape: string;
  maneuvers: ValhallaManeuver[];
  summary: { time: number; length: number };
}

interface ValhallaTrip {
  legs: ValhallaLeg[];
  summary: { time: number; length: number };
  status: number;
  status_message: string;
}

interface ValhallaOptions {
  /** Points (lng,lat) whose nearest road edges are excluded from the path search. */
  exclude: [number, number][];
  /** Number of alternate routes to request (0–3; Valhalla ignores it for >2 locations). */
  alternates: number;
  costing: ValhallaCosting;
}

const VALHALLA_COSTINGS = ['auto', 'motorcycle', 'bicycle'] as const;
type ValhallaCosting = (typeof VALHALLA_COSTINGS)[number];

/** Public Valhalla server caps exclude_locations (service_limits.max_exclude_locations). */
const MAX_EXCLUDE_LOCATIONS = 50;
const MAX_ALTERNATES = 3;

async function fetchValhalla(
  originLng: number, originLat: number,
  destLng: number, destLat: number,
  waypointCoords: [number, number][],
  options: ValhallaOptions,
): Promise<OsrmLikeResponse> {
  const locations = [
    { lon: originLng, lat: originLat },
    ...waypointCoords.map(([lng, lat]) => ({ lon: lng, lat })),
    { lon: destLng, lat: destLat },
  ];

  const body: Record<string, unknown> = {
    locations,
    costing: options.costing,
    directions_options: { units: 'kilometers' },
  };
  if (options.alternates > 0 && locations.length === 2) {
    body.alternates = Math.min(MAX_ALTERNATES, options.alternates);
  }
  if (options.exclude.length > 0) {
    body.exclude_locations = options.exclude
      .slice(0, MAX_EXCLUDE_LOCATIONS)
      .map(([lng, lat]) => ({ lon: lng, lat }));
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);

  const res = await fetch(VALHALLA_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'SpeedBumps-App/1.0' },
    body: JSON.stringify(body),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!res.ok) throw new Error(`Valhalla ${res.status}`);
  const data = await res.json() as { trip: ValhallaTrip; alternates?: Array<{ trip: ValhallaTrip }> };
  const primary = valhallaToOsrm(data.trip);
  for (const alt of data.alternates ?? []) {
    if (alt?.trip?.legs?.length) {
      primary.routes.push(...valhallaToOsrm(alt.trip).routes);
    }
  }
  return primary;
}

/** Decode a Google-format encoded polyline to [lat, lng] pairs. */
function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  while (index < len) {
    let b: number, shift = 0, result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    points.push([lat / 1e6, lng / 1e6]);
  }
  return points;
}

/** Encode [lat, lng] pairs back to Google polyline (precision 5). */
function encodePolyline(points: [number, number][]): string {
  let output = '';
  let prevLat = 0, prevLng = 0;
  for (const [lat, lng] of points) {
    const encLat = Math.round(lat * 1e5);
    const encLng = Math.round(lng * 1e5);
    output += encodeValue(encLat - prevLat);
    output += encodeValue(encLng - prevLng);
    prevLat = encLat;
    prevLng = encLng;
  }
  return output;
}

function encodeValue(value: number): string {
  let v = value < 0 ? ~(value << 1) : value << 1;
  let result = '';
  while (v >= 0x20) {
    result += String.fromCharCode(((0x20 | (v & 0x1f)) + 63));
    v >>= 5;
  }
  result += String.fromCharCode(v + 63);
  return result;
}

interface OsrmStep {
  maneuver: { type: string; modifier: string; location: [number, number] };
  name: string;
  distance: number;
  duration: number;
  location: [number, number];
}

interface OsrmLeg {
  steps: OsrmStep[];
  distance: number;
  duration: number;
}

interface OsrmLikeResponse {
  code: string;
  routes: Array<{
    geometry: string;
    distance: number;
    duration: number;
    legs: OsrmLeg[];
  }>;
}

function valhallaToOsrm(trip: ValhallaTrip): OsrmLikeResponse {
  // Decode each leg shape, collect all points into one full polyline
  const allPoints: [number, number][] = [];
  const osrmLegs: OsrmLeg[] = [];

  for (const leg of trip.legs) {
    // Valhalla encodes at precision 6 (1e6), OSRM uses precision 5 (1e5)
    const legPoints = decodePolyline(leg.shape); // precision 6 from Valhalla

    if (allPoints.length === 0) {
      allPoints.push(...legPoints);
    } else {
      // Skip the first point of subsequent legs (duplicate of previous leg's last)
      allPoints.push(...legPoints.slice(1));
    }

    const steps: OsrmStep[] = leg.maneuvers.map((m) => {
      const { type, modifier } = valhallaTypeToOsrm(m.type);
      const point = legPoints[m.begin_shape_index] ?? legPoints[0];
      return {
        maneuver: { type, modifier, location: [point[1], point[0]] }, // OSRM uses [lng, lat]
        name: m.street_names?.[0] ?? '',
        distance: Math.round(m.length * 1000), // km → m
        duration: Math.round(m.time),
        location: [point[1], point[0]],
      };
    });

    osrmLegs.push({
      steps,
      distance: Math.round(leg.summary.length * 1000),
      duration: Math.round(leg.summary.time),
    });
  }

  // Re-encode full trip at precision 5 for OSRM client compatibility
  // allPoints already hold real lat/lng floats (decoded from Valhalla's precision-6 polyline)
  const geometry = encodePolyline(allPoints);

  return {
    code: 'Ok',
    routes: [{
      geometry,
      distance: Math.round(trip.summary.length * 1000),
      duration: Math.round(trip.summary.time),
      legs: osrmLegs,
    }],
  };
}

// --- OSRM fallback servers ---

const OSRM_SERVERS = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  'https://router.project-osrm.org/route/v1/driving',
];

async function fetchOsrm(coordsPath: string, forwardParams: URLSearchParams): Promise<OsrmLikeResponse> {
  for (const server of OSRM_SERVERS) {
    const upstream = new URL(`${server}/${coordsPath}`);
    for (const [key, value] of forwardParams.entries()) {
      upstream.searchParams.set(key, value);
    }
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SERVER_TIMEOUT_MS);
      const res = await fetch(upstream.toString(), {
        signal: controller.signal,
        headers: { 'User-Agent': 'SpeedBumps-App/1.0' },
      });
      clearTimeout(timeoutId);
      if (!res.ok) continue;
      return await res.json() as OsrmLikeResponse;
    } catch {
      // try next
    }
  }
  throw new Error('All OSRM servers unavailable');
}

// --- Handler ---

export async function GET(request: NextRequest) {
  const coords = request.nextUrl.searchParams.get('coords');
  if (!coords) {
    return NextResponse.json({ error: 'Missing coords parameter' }, { status: 400 });
  }

  // Parse coords: "lng1,lat1;lng2,lat2;..."
  const parts = coords.split(';').map((c) => c.split(',').map(Number) as [number, number]);
  if (parts.length < 2) {
    return NextResponse.json({ error: 'Need at least 2 coordinate pairs' }, { status: 400 });
  }

  if (parts.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat))) {
    return NextResponse.json({ error: 'Malformed coords parameter' }, { status: 400 });
  }

  const [originLng, originLat] = parts[0];
  const [destLng, destLat] = parts[parts.length - 1];
  const waypointCoords = parts.slice(1, -1);

  // Optional Valhalla-only options (ignored by the OSRM fallback)
  const excludeParam = request.nextUrl.searchParams.get('exclude') ?? '';
  const exclude = excludeParam
    ? excludeParam
        .split(';')
        .map((c) => c.split(',').map(Number) as [number, number])
        .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat))
    : [];
  const alternates = Math.max(0, Math.min(MAX_ALTERNATES, Number(request.nextUrl.searchParams.get('alternates') ?? 0) || 0));
  const costingParam = request.nextUrl.searchParams.get('costing') ?? 'auto';
  const costing: ValhallaCosting = (VALHALLA_COSTINGS as readonly string[]).includes(costingParam)
    ? (costingParam as ValhallaCosting)
    : 'auto';

  // Try Valhalla first (fastest and most reliable)
  try {
    const result = await fetchValhalla(originLng, originLat, destLng, destLat, waypointCoords, {
      exclude,
      alternates,
      costing,
    });
    return NextResponse.json(result);
  } catch (err) {
    // An exclusion request that Valhalla can't satisfy (e.g. "No path") must
    // not fall through to OSRM: OSRM would ignore the exclusions and hand back
    // the very route the caller is trying to avoid.
    if (exclude.length > 0) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: `No route avoiding those locations: ${message}` }, { status: 422 });
    }
    // fall through to OSRM
  }

  // Try OSRM servers as fallback (no exclusion support — client scores what it gets)
  const OSRM_FORWARDABLE = new Set(['overview', 'geometries', 'steps', 'alternatives']);
  const forwardParams = new URLSearchParams();
  for (const [key, value] of request.nextUrl.searchParams.entries()) {
    if (OSRM_FORWARDABLE.has(key)) forwardParams.set(key, value);
  }
  if (alternates > 0 && waypointCoords.length === 0) forwardParams.set('alternatives', 'true');

  try {
    const result = await fetchOsrm(coords, forwardParams);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Routing unavailable: ${message}` }, { status: 502 });
  }
}
