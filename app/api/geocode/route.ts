/**
 * Place search + reverse geocoding proxy.
 *
 * Forward search blends two OpenStreetMap-backed services:
 *   - Photon (komoot): typo-tolerant autocomplete that finds shops, restaurants
 *     and partial addresses ("wawa", "trader joes", "1500 mark").
 *   - Nominatim: only queried when the text starts with a house number, since
 *     it interpolates addresses Photon doesn't have ("4500 frankford av").
 * Photon falls back to Nominatim if it's down. Results are cached in-process
 * (LRU, 24 h) and marked cacheable for the CDN.
 *
 *   GET /api/geocode?q=<text>[&near=<lat>,<lng>]  → GeocodingResult[]
 *   GET /api/geocode?reverse=<lat>,<lng>          → GeocodingResult | null
 */

import { NextRequest, NextResponse } from 'next/server';
import type { GeocodingResult, LatLng } from '@/types/speedbumps';
import {
  MAX_SEARCH_RESULTS,
  biasCacheKey,
  leadingHouseNumber,
  mergeSearchResults,
  nominatimToResult,
  photonToResult,
  type NominatimResult,
  type PhotonFeature,
} from '@/lib/search-results';

// Philadelphia bounding box (Nominatim viewbox order: left,top,right,bottom)
const PHILLY_VIEWBOX = '-75.28,40.14,-74.96,39.87';
// Greater Philly metro (Photon bbox order: minLon,minLat,maxLon,maxLat) — hard filter
const METRO_BBOX = '-75.55,39.70,-74.70,40.35';
const PHILLY_CENTER: LatLng = { lat: 39.9526, lng: -75.1652 };

const USER_AGENT = 'SpeedBumps-App/1.0 (https://github.com/paristech1/speedbumbps)';
const UPSTREAM_HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
const UPSTREAM_TIMEOUT_MS = 4000;

const CACHE_MAX_ENTRIES = 500;
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

class UpstreamError extends Error {
  constructor(readonly status: number) {
    super(`Upstream ${status}`);
  }
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const reverse = params.get('reverse');
  if (reverse) return handleReverse(reverse);

  const query = params.get('q');
  if (!query || !query.trim()) {
    return NextResponse.json([]);
  }
  return handleSearch(query.trim().slice(0, 200), parseLatLng(params.get('near')));
}

async function handleSearch(query: string, near: LatLng | null) {
  const key = `${query.toLowerCase()}|${biasCacheKey(near)}`;
  const cached = searchCache.get(key);
  if (cached) return jsonCached(cached);

  const wantsAddress = leadingHouseNumber(query) !== null;
  const [photon, nominatim] = await Promise.allSettled([
    fetchPhoton(query, near ?? PHILLY_CENTER),
    wantsAddress ? fetchNominatim(query) : Promise.resolve([]),
  ]);

  let photonResults = photon.status === 'fulfilled' ? photon.value : null;
  let nominatimResults = nominatim.status === 'fulfilled' ? nominatim.value : null;

  // Photon down and Nominatim wasn't asked — fall back so search still works
  if (photonResults === null && !wantsAddress) {
    try {
      nominatimResults = await fetchNominatim(query);
    } catch (err) {
      nominatimResults = null;
      if (err instanceof UpstreamError) return upstreamError(err.status);
    }
  }

  if (photonResults === null && nominatimResults === null) {
    const reason = photon.status === 'rejected' ? photon.reason : null;
    return upstreamError(reason instanceof UpstreamError ? reason.status : 502);
  }
  photonResults ??= [];
  nominatimResults ??= [];

  const results = mergeSearchResults(query, photonResults, nominatimResults);
  // Don't pin a partial result set when one provider failed
  if (photon.status === 'fulfilled' && nominatim.status === 'fulfilled') {
    searchCache.set(key, results);
    return jsonCached(results);
  }
  return NextResponse.json(results);
}

async function fetchPhoton(query: string, near: LatLng): Promise<GeocodingResult[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('lat', String(near.lat));
  url.searchParams.set('lon', String(near.lng));
  // Lean hard on proximity so "wawa" means the nearby one, not the town of Wawa, PA
  url.searchParams.set('location_bias_scale', '0.1');
  url.searchParams.set('zoom', '14');
  url.searchParams.set('bbox', METRO_BBOX);
  url.searchParams.set('limit', String(MAX_SEARCH_RESULTS + 4));
  url.searchParams.set('lang', 'en');

  const data = await fetchJson<{ features?: PhotonFeature[] }>(url);
  return (data.features ?? [])
    .map(photonToResult)
    .filter((r): r is GeocodingResult => r !== null);
}

async function fetchNominatim(query: string): Promise<GeocodingResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', /philadelphia|,\s*pa\b/i.test(query) ? query : `${query}, Philadelphia, PA`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  url.searchParams.set('viewbox', PHILLY_VIEWBOX);
  url.searchParams.set('bounded', '0');
  url.searchParams.set('addressdetails', '1');

  const data = await fetchJson<NominatimResult[]>(url);
  return data.map(nominatimToResult);
}

async function fetchJson<T>(url: URL): Promise<T> {
  const response = await fetch(url.toString(), {
    headers: UPSTREAM_HEADERS,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!response.ok) throw new UpstreamError(response.status);
  return await response.json() as T;
}

async function handleReverse(param: string) {
  const point = parseLatLng(param);
  if (!point) {
    return NextResponse.json({ error: 'reverse must be "lat,lng"' }, { status: 400 });
  }

  // ~11 m grid so nearby taps share a cache entry
  const key = `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`;
  const cached = reverseCache.get(key);
  if (cached !== undefined) return jsonCached(cached);

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('lat', String(point.lat));
  url.searchParams.set('lon', String(point.lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('zoom', '18');
  url.searchParams.set('addressdetails', '1');

  try {
    const data = await fetchJson<NominatimResult & { error?: string }>(url);
    const result = data.error || !data.lat ? null : nominatimToResult(data);
    reverseCache.set(key, result);
    return jsonCached(result);
  } catch (err) {
    return upstreamError(err instanceof UpstreamError ? err.status : 502);
  }
}

function parseLatLng(param: string | null): LatLng | null {
  if (!param) return null;
  const [lat, lng] = param.split(',').map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
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
