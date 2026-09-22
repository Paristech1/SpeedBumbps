/**
 * Place search + reverse geocoding, through the /api/geocode proxy.
 *
 * The server answers from the City address index first, then Google Places
 * when a key is configured (else Photon + Nominatim). Google suggestions come
 * back `pending` — resolve one with `resolvePlace` before using its location.
 */

import type { GeocodingResult, LatLng } from '@/types/speedbumps';

async function readError(response: Response): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    if (body?.error) return body.error;
  } catch {
    // non-JSON body
  }
  return `Geocoding request failed: ${response.status}`;
}

const CLIENT_CACHE_MAX = 60;
const clientCache = new Map<string, GeocodingResult[]>();

export interface SearchOptions {
  /** Bias results toward this point (usually the user's location). */
  near?: LatLng | null;
  /** Abort stale requests when the user keeps typing. */
  signal?: AbortSignal;
  /** Groups one search's keystrokes and its pick into one Places billing session. */
  session?: string;
}

/** A fresh token per search session: new focus, new field, or after a pick. */
export function newSearchSession(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-0000-0000`;
}

/** Search places and addresses via the /api/geocode proxy. */
export async function searchAddress(query: string, options: SearchOptions = {}): Promise<GeocodingResult[]> {
  const q = query.trim();
  if (!q) return [];

  const url = new URL('/api/geocode', window.location.origin);
  url.searchParams.set('q', q);
  if (options.near) {
    // 2 decimals (~1 km) is plenty for ranking and keeps cache hits high
    url.searchParams.set('near', `${options.near.lat.toFixed(2)},${options.near.lng.toFixed(2)}`);
  }

  // The cache key leaves the session out on purpose: the text decides the results.
  const key = url.search.toLowerCase();
  const cached = clientCache.get(key);
  if (cached) return cached;
  if (options.session) url.searchParams.set('session', options.session);

  const response = await fetch(url.toString(), { signal: options.signal });
  if (!response.ok) throw new Error(await readError(response));

  const results = await response.json() as GeocodingResult[];
  clientCache.set(key, results);
  if (clientCache.size > CLIENT_CACHE_MAX) {
    const oldest = clientCache.keys().next().value;
    if (oldest !== undefined) clientCache.delete(oldest);
  }
  return results;
}

/**
 * The real location of a suggestion. Already-located results come straight
 * back; a pending Google suggestion is looked up (which closes its session).
 */
export async function resolvePlace(result: GeocodingResult, session?: string): Promise<GeocodingResult> {
  if (!result.pending || !result.placeId) return result;
  const url = new URL('/api/geocode', window.location.origin);
  url.searchParams.set('place', result.placeId);
  url.searchParams.set('label', result.shortName);
  if (session) url.searchParams.set('session', session);
  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(await readError(response));
  const resolved = await response.json() as GeocodingResult;
  // Keep the words the driver saw on the row they tapped.
  return { ...resolved, shortName: result.shortName, displayName: resolved.displayName || result.displayName };
}

/** Reverse-geocode a map point into an address. Returns null if nothing is nearby. */
export async function reverseGeocode(point: LatLng): Promise<GeocodingResult | null> {
  const url = new URL('/api/geocode', window.location.origin);
  url.searchParams.set('reverse', `${point.lat},${point.lng}`);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(await readError(response));

  return await response.json() as GeocodingResult | null;
}

/** Fallback label for a raw coordinate when reverse geocoding fails. */
export function coordinateLabel(point: LatLng): string {
  return `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
}
