/**
 * Place search + reverse geocoding proxy.
 *
 * Forward search blends two OpenStreetMap-backed services:
 *   - Photon (komoot): typo-tolerant autocomplete that finds shops, restaurants
 *     and partial addresses ("wawa", "trader joes", "1500 mark").
 *   - Nominatim: only queried when the text starts with a house number, since
 *     it interpolates addresses Photon doesn't have ("4500 frankford av").
 *     If Photon already has the typed house on the typed street we only give
 *     Nominatim a short grace period; otherwise we wait for it. Calls are
 *     spaced ~1/s per its usage policy, and skipped if the client gave up.
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
  cleanQuery,
  hasHouseOnTypedStreet,
  leadingHouseNumber,
  mergeSearchResults,
  nominatimToResult,
  photonToResult,
  type NominatimResult,
  type PhotonFeature,
} from '@/lib/search-results';

// Greater Philly metro (Photon bbox order: minLon,minLat,maxLon,maxLat) — hard filter
const METRO_BBOX = '-75.55,39.70,-74.70,40.35';
// Same area in Nominatim viewbox order (left,top,right,bottom) — a preference, not a filter
const METRO_VIEWBOX = '-75.55,40.35,-74.70,39.70';
const PHILLY_CENTER: LatLng = { lat: 39.9526, lng: -75.1652 };

const USER_AGENT = 'SpeedBumps-App/1.0 (https://github.com/paristech1/speedbumbps)';
const UPSTREAM_HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };
const PHOTON_TIMEOUT_MS = 4000;
// Nominatim is often slow but is the only source for many exact addresses
const NOMINATIM_TIMEOUT_MS = 8000;
// How long to wait for Nominatim when Photon already found the address
const NOMINATIM_GRACE_MS = 400;
const NOMINATIM_MIN_INTERVAL_MS = 1100;

let nominatimQueue: Promise<void> = Promise.resolve();
let lastNominatimAt = 0;

/** Wait for a Nominatim slot (~1 request/second). Rejects if the client already disconnected. */
function nominatimSlot(signal?: AbortSignal): Promise<void> {
  const slot = nominatimQueue.then(async () => {
    signal?.throwIfAborted();
    const wait = lastNominatimAt + NOMINATIM_MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    signal?.throwIfAborted();
    lastNominatimAt = Date.now();
  });
  nominatimQueue = slot.catch(() => {});
  return slot;
}

type Settled<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
  return promise.then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

function errorStatus(error: unknown): number {
  return error instanceof UpstreamError ? error.status : 502;
}

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
  if (reverse) return handleReverse(reverse, request.signal);

  const query = cleanQuery(params.get('q') ?? '').slice(0, 200);
  if (!query) {
    return NextResponse.json([]);
  }
  return handleSearch(query, parseLatLng(params.get('near')), request.signal);
}

async function handleSearch(query: string, near: LatLng | null, signal: AbortSignal) {
  const key = `${query.toLowerCase()}|${biasCacheKey(near)}`;
  const cached = searchCache.get(key);
  if (cached) return jsonCached(cached);

  const wantsAddress = leadingHouseNumber(query) !== null;
  const photonPromise = settle(fetchPhoton(query, near ?? PHILLY_CENTER));
  const nominatimPromise = wantsAddress ? settle(fetchNominatim(query, signal)) : null;

  const photon = await photonPromise;
  // null = not asked, or skipped because Photon already had the address
  let nominatim: Settled<GeocodingResult[]> | null = null;
  if (nominatimPromise) {
    const photonFoundIt = photon.ok && hasHouseOnTypedStreet(query, photon.value);
    nominatim = photonFoundIt
      ? await Promise.race([
          nominatimPromise,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), NOMINATIM_GRACE_MS)),
        ])
      : await nominatimPromise;
  } else if (!photon.ok) {
    // Photon down and Nominatim wasn't asked — fall back so search still works
    nominatim = await settle(fetchNominatim(query, signal));
  }

  if (!photon.ok && !nominatim?.ok) {
    return upstreamError(errorStatus(photon.error));
  }

  const results = mergeSearchResults(
    query,
    photon.ok ? photon.value : [],
    nominatim?.ok ? nominatim.value : [],
    MAX_SEARCH_RESULTS,
    near,
  );
  // Don't pin a partial result set when a provider failed
  if (photon.ok && (nominatim === null || nominatim.ok)) {
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

  const data = await fetchJson<{ features?: PhotonFeature[] }>(url, PHOTON_TIMEOUT_MS);
  return (data.features ?? [])
    .map(photonToResult)
    .filter((r): r is GeocodingResult => r !== null);
}

async function fetchNominatim(query: string, signal?: AbortSignal): Promise<GeocodingResult[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  // No forced ", Philadelphia" — it broke suburb/NJ addresses. The viewbox keeps Philly first.
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('viewbox', METRO_VIEWBOX);
  url.searchParams.set('bounded', '0');
  url.searchParams.set('addressdetails', '1');

  await nominatimSlot(signal);
  const data = await fetchJson<NominatimResult[]>(url, NOMINATIM_TIMEOUT_MS, signal);
  return data.map(nominatimToResult);
}

async function fetchJson<T>(url: URL, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const response = await fetch(url.toString(), {
    headers: UPSTREAM_HEADERS,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new UpstreamError(response.status);
  return await response.json() as T;
}

async function handleReverse(param: string, signal: AbortSignal) {
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
    await nominatimSlot(signal);
    const data = await fetchJson<NominatimResult & { error?: string }>(url, NOMINATIM_TIMEOUT_MS, signal);
    const result = data.error || !data.lat ? null : nominatimToResult(data);
    reverseCache.set(key, result);
    return jsonCached(result);
  } catch (err) {
    return upstreamError(errorStatus(err));
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
