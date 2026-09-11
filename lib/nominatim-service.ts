/**
 * Nominatim geocoding — OpenStreetMap, free, no API key.
 *
 * NOTE: Nominatim requires a User-Agent header. Browsers cannot set this,
 * so geocoding requests are proxied through /api/geocode (server-side).
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

/** Search addresses via the /api/geocode proxy. */
export async function searchAddress(query: string): Promise<GeocodingResult[]> {
  if (!query.trim()) return [];

  const url = new URL('/api/geocode', window.location.origin);
  url.searchParams.set('q', query);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(await readError(response));

  return await response.json() as GeocodingResult[];
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
