/**
 * Nominatim geocoding — OpenStreetMap, free, no API key.
 * Ported from Flutter: lib/features/routing/data/datasources/nominatim_geocoding_api.dart
 *
 * NOTE: Nominatim requires a User-Agent header. Browsers cannot set this,
 * so geocoding requests are proxied through /api/geocode (server-side).
 */

import type { GeocodingResult } from '@/types/speedbumps';

/** Search addresses via the /api/geocode proxy. */
export async function searchAddress(query: string): Promise<GeocodingResult[]> {
  if (!query.trim()) return [];

  const url = new URL('/api/geocode', window.location.origin);
  url.searchParams.set('q', query);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Geocoding request failed: ${response.status}`);
  }

  const results = await response.json() as GeocodingResult[];
  return results;
}
