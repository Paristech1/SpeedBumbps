/**
 * Nominatim geocoding proxy (forward search + reverse lookup).
 *
 * Nominatim requires a User-Agent header — browsers cannot set this, so we
 * proxy server-side. Its usage policy is ~1 request/second, so results are
 * cached in-process (LRU, 24 h) and marked cacheable for the CDN.
 *
 *   GET /api/geocode?q=<address>            → GeocodingResult[]
 *   GET /api/geocode?reverse=<lat>,<lng>    → GeocodingResult | null
 */

import { NextRequest, NextResponse } from 'next/server';
import type { GeocodingResult } from '@/types/speedbumps';

// Philadelphia bounding box
const PHILLY_VIEWBOX = '-75.28,40.14,-74.96,39.87';

const NOMINATIM_HEADERS = {
  'User-Agent': 'SpeedBumps-App/1.0 (https://github.com/paristech1/speedbumbps)',
  Accept: 'application/json',
};

const CACHE_MAX_ENTRIES = 200;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CDN_CACHE_HEADER = 'public, s-maxage=86400, stale-while-revalidate=604800';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Tiny LRU: Map preserves insertion order; re-inserting on hit moves to the back. */
class LruCache<T> {
  private map = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    while (this.map.size > CACHE_MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}

const searchCache = new LruCache<GeocodingResult[]>();
const reverseCache = new LruCache<GeocodingResult | null>();

export async function GET(request: NextRequest) {
  const reverse = request.nextUrl.searchParams.get('reverse');
  if (reverse) return handleReverse(reverse);

  const query = request.nextUrl.searchParams.get('q');
  if (!query || !query.trim()) {
    return NextResponse.json([]);
  }
  return handleSearch(query.trim());
}

async function handleSearch(query: string) {
  const key = query.toLowerCase();
  const cached = searchCache.get(key);
  if (cached) return jsonCached(cached);

  const searchQuery = `${query}, Philadelphia, PA`;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  url.searchParams.set('viewbox', PHILLY_VIEWBOX);
  url.searchParams.set('bounded', '0');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
  if (!response.ok) return upstreamError(response.status);

  const data = await response.json() as NominatimResult[];
  const results = data.map(toGeocodingResult);
  searchCache.set(key, results);
  return jsonCached(results);
}

async function handleReverse(param: string) {
  const [lat, lng] = param.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: 'reverse must be "lat,lng"' }, { status: 400 });
  }

  // ~11 m grid so nearby taps share a cache entry
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = reverseCache.get(key);
  if (cached !== undefined) return jsonCached(cached);

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
  if (!response.ok) return upstreamError(response.status);

  const data = await response.json() as NominatimResult & { error?: string };
  const result = data.error || !data.lat ? null : toGeocodingResult(data);
  reverseCache.set(key, result);
  return jsonCached(result);
}

function jsonCached(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': CDN_CACHE_HEADER } });
}

function upstreamError(status: number) {
  const message =
    status === 429
      ? 'Address search is busy — wait a moment and try again'
      : 'Geocoding service unavailable';
  return NextResponse.json({ error: message }, { status: 502 });
}

function toGeocodingResult(item: NominatimResult): GeocodingResult {
  const address = item.address ?? {};
  const road = address.road ?? address.pedestrian ?? address.path;
  const houseNumber = address.house_number;
  const street = road && houseNumber ? `${houseNumber} ${road}` : road;
  const shortParts = [
    street,
    address.suburb ?? address.neighbourhood ?? address.city_district,
  ].filter(Boolean);
  const shortName = shortParts.length > 0
    ? shortParts.join(', ')
    : (item.display_name ?? '').split(',')[0];

  return {
    displayName: item.display_name ?? '',
    shortName,
    location: {
      lat: parseFloat(item.lat ?? '0'),
      lng: parseFloat(item.lon ?? '0'),
    },
  };
}

interface NominatimResult {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    house_number?: string;
    road?: string;
    pedestrian?: string;
    path?: string;
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
  };
}
