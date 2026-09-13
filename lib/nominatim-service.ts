/**
 * Place search + reverse geocoding — OpenStreetMap data, no API key.
 *
 * Requests are proxied through /api/geocode (server-side) so we can send a
 * User-Agent, combine Photon + Nominatim, and cache upstream responses.
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

  const key = url.search.toLowerCase();
  const cached = clientCache.get(key);
  if (cached) return cached;

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
