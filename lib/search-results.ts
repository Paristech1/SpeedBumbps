/**
 * Pure helpers for place search: normalising Photon + Nominatim responses
 * into GeocodingResult, and merging/ranking them. Kept free of fetch so the
 * geocode route and tests can share it.
 */

import type { GeocodingResult, GeocodingKind, LatLng } from '@/types/speedbumps';
import { haversineDistance } from '@/lib/geo-utils';

export const MAX_SEARCH_RESULTS = 8;

/** Queries that start with a house number ("1500 mark", "4500 frankford av"). */
export function leadingHouseNumber(query: string): string | null {
  const match = query.trim().match(/^(\d+[a-z]?)\b/i);
  return match ? match[1].toLowerCase() : null;
}

// Apartment/unit designators confuse both geocoders ("1600 n broad st apt 2")
const UNIT_PATTERN = /,?\s*\b(?:apt|apartment|unit|suite|ste|rm|room|floor|fl)\b\.?\s*[\w-]+|,?\s*#\s*[\w-]+/gi;

/** Strip unit designators and tidy whitespace before sending a query upstream. */
export function cleanQuery(query: string): string {
  return query
    .replace(UNIT_PATTERN, '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,]+|[\s,]+$/g, '');
}

const STREET_ABBREVIATIONS: Record<string, string> = {
  n: 'north', s: 'south', e: 'east', w: 'west',
  st: 'street', str: 'street', ave: 'avenue', av: 'avenue',
  blvd: 'boulevard', rd: 'road', dr: 'drive', ln: 'lane', pl: 'place',
  ct: 'court', pkwy: 'parkway', hwy: 'highway', ter: 'terrace', sq: 'square',
  jfk: 'john f kennedy',
};

const DIRECTIONALS = new Set(['north', 'south', 'east', 'west']);

/** Lowercase street tokens with common abbreviations expanded. */
export function normalizeStreet(street: string): string[] {
  return street
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => (STREET_ABBREVIATIONS[token] ?? token).split(' '));
}

/** Street tokens the user typed: text before the first comma, minus the house number. */
function queryStreetTokens(query: string): string[] {
  const firstPart = cleanQuery(query).split(',')[0];
  return normalizeStreet(firstPart.replace(/^\s*\d+[a-z]?\b/i, ''));
}

/**
 * How well a result's street matches what was typed:
 * 2 = same street ("n broad st" ~ "North Broad Street"),
 * 1 = still typing it ("1500 mark" ~ "Market Street"),
 * 0 = different street ("south st" vs "South 21st Street").
 */
function streetMatchLevel(typed: string[], street: string | undefined): 0 | 1 | 2 {
  if (!street || typed.length === 0) return 0;
  const full = normalizeStreet(street);
  // Let "haddon ave" match "South Haddon Avenue" when no direction was typed
  const candidates = DIRECTIONALS.has(full[0]) && !DIRECTIONALS.has(typed[0]) ? [full, full.slice(1)] : [full];

  let best: 0 | 1 | 2 = 0;
  for (const tokens of candidates) {
    if (typed.length > tokens.length) continue;
    const last = typed.length - 1;
    if (!typed.slice(0, last).every((t, i) => t === tokens[i])) continue;
    if (typed[last] === tokens[last] && typed.length === tokens.length) return 2;
    if (tokens[last].startsWith(typed[last])) best = 1;
  }
  return best;
}

/** Right street outranks right house number on the wrong street. */
function addressScore(result: GeocodingResult, houseNumber: string, typed: string[]): number {
  const street = result.street ?? (result.kind === 'street' ? result.shortName : undefined);
  const houseMatches = result.houseNumber?.toLowerCase() === houseNumber;
  return streetMatchLevel(typed, street) * 2 + (houseMatches ? 1 : 0);
}

/**
 * True when some result already has the typed house number on the typed
 * (or still-being-typed) street — i.e. Nominatim is unlikely to add anything.
 * Always true for queries without a house number.
 */
export function hasHouseOnTypedStreet(query: string, results: GeocodingResult[]): boolean {
  const number = leadingHouseNumber(query);
  if (!number) return true;
  const typed = queryStreetTokens(query);
  return results.some((result) => {
    const street = result.street ?? (result.kind === 'street' ? result.shortName : undefined);
    return result.houseNumber?.toLowerCase() === number && streetMatchLevel(typed, street) > 0;
  });
}

// ---------------------------------------------------------------------------
// Photon (komoot) — typo-tolerant, prefix-friendly, includes shops/amenities
// ---------------------------------------------------------------------------

export interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    locality?: string;
    city?: string;
    state?: string;
    postcode?: string;
    osm_key?: string;
    osm_value?: string;
    type?: string;
  };
}

/** OSM keys that describe the shape of a place rather than what it is. */
const STRUCTURAL_KEYS = new Set(['building', 'highway', 'place', 'boundary', 'landuse']);

const CATEGORY_LABELS: Record<string, string> = {
  convenience: 'Convenience store',
  fuel: 'Gas station',
  fast_food: 'Fast food',
  supermarket: 'Grocery store',
  department_store: 'Department store',
  mall: 'Shopping mall',
  pharmacy: 'Pharmacy',
  chemist: 'Pharmacy',
  bus_station: 'Bus station',
  station: 'Station',
  car_repair: 'Auto repair',
  car_wash: 'Car wash',
  charging_station: 'EV charging',
  ice_cream: 'Ice cream',
  doityourself: 'Hardware store',
  hardware: 'Hardware store',
  clothes: 'Clothing store',
  alcohol: 'Liquor store',
};

export function categoryLabel(osmKey?: string, osmValue?: string): string | undefined {
  if (!osmKey || !osmValue || STRUCTURAL_KEYS.has(osmKey) || osmValue === 'yes') return undefined;
  const label = CATEGORY_LABELS[osmValue] ?? osmValue.replace(/_/g, ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function photonKind(p: NonNullable<PhotonFeature['properties']>): GeocodingKind {
  if (categoryLabel(p.osm_key, p.osm_value)) return 'place';
  if (p.housenumber || p.type === 'house') return 'address';
  if (p.osm_key === 'highway' || p.type === 'street') return 'street';
  return 'area';
}

export function photonToResult(feature: PhotonFeature): GeocodingResult | null {
  const p = feature.properties;
  const coords = feature.geometry?.coordinates;
  if (!p || !coords) return null;

  const kind = photonKind(p);
  const street = p.street && p.housenumber ? `${p.housenumber} ${p.street}` : p.street;
  const area = p.district ?? p.locality;
  const city = p.city ?? p.state;

  let shortName: string;
  let detail: (string | undefined)[];
  if (kind === 'place' || (kind === 'area' && p.name)) {
    shortName = p.name ?? street ?? '';
    detail = [street, area, city];
  } else if (kind === 'street') {
    shortName = p.name ?? p.street ?? '';
    detail = [area, city];
  } else {
    shortName = street ?? p.name ?? '';
    detail = [area, city, p.postcode];
  }
  if (!shortName) return null;

  return {
    shortName,
    displayName: [...new Set(detail.filter((s): s is string => !!s && s !== shortName))].join(', '),
    location: { lat: coords[1], lng: coords[0] },
    kind,
    category: kind === 'place' ? categoryLabel(p.osm_key, p.osm_value) : undefined,
    houseNumber: p.housenumber,
    street: p.street ?? (kind === 'street' ? p.name : undefined),
  };
}

// ---------------------------------------------------------------------------
// Nominatim — better at interpolated house-number addresses
// ---------------------------------------------------------------------------

export interface NominatimResult {
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

export function nominatimToResult(item: NominatimResult): GeocodingResult {
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
    kind: houseNumber ? 'address' : undefined,
    houseNumber,
    street: road,
  };
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

const DUPLICATE_RADIUS_M = 75;

function isDuplicate(a: GeocodingResult, b: GeocodingResult): boolean {
  const sameName = a.shortName.split(',')[0].trim().toLowerCase() === b.shortName.split(',')[0].trim().toLowerCase();
  return sameName && haversineDistance(a.location, b.location) < DUPLICATE_RADIUS_M;
}

/**
 * Combine Photon and Nominatim results. When the query starts with a house
 * number, results are ranked by street match first, then house number, so
 * "1234 south st" prefers 1234 South Street over 1234 South 21st Street.
 * Ties keep provider order (Photon, then Nominatim); non-address queries
 * keep Photon's relevance order.
 */
export function mergeSearchResults(
  query: string,
  photon: GeocodingResult[],
  nominatim: GeocodingResult[],
  limit = MAX_SEARCH_RESULTS,
  near?: LatLng | null,
): GeocodingResult[] {
  const number = leadingHouseNumber(query);
  let ordered = [...photon, ...nominatim];
  if (number) {
    const typed = queryStreetTokens(query);
    ordered = ordered
      .map((result, index) => ({ result, index, score: addressScore(result, number, typed) }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (near) {
          return haversineDistance(near, a.result.location) - haversineDistance(near, b.result.location);
        }
        return a.index - b.index;
      })
      .map(({ result }) => result);
  } else if (near) {
    // Chain / POI queries: Photon relevance can miss nearby-first; bias by distance.
    ordered = [...ordered].sort(
      (a, b) => haversineDistance(near, a.location) - haversineDistance(near, b.location),
    );
  }

  const merged: GeocodingResult[] = [];
  for (const result of ordered) {
    if (merged.some((existing) => isDuplicate(existing, result))) continue;
    merged.push(result);
    if (merged.length >= limit) break;
  }
  return merged;
}

/** Round a bias point to a ~5 km grid so nearby users share cache entries. */
export function biasCacheKey(near: LatLng | null): string {
  return near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : 'none';
}
