/**
 * Pure helpers for place search: normalising Photon + Nominatim responses
 * into GeocodingResult, and merging/ranking them. Kept free of fetch so the
 * geocode route and tests can share it.
 */

import type { GeocodingResult, GeocodingKind, LatLng } from '@/types/speedbumps';
import { haversineDistance } from '@/lib/geo-utils';

export const MAX_SEARCH_RESULTS = 8;

// ---------------------------------------------------------------------------
// Home region — this is a Philadelphia app, so local results rank first
// ---------------------------------------------------------------------------

/** City Hall. Used as the ranking anchor when the user's location is unknown. */
export const PHILLY_CENTER: LatLng = { lat: 39.9526, lng: -75.1652 };

/**
 * Greater Philly: the city plus Bucks/Montco/Delco/Chester, South Jersey and
 * northern Delaware — roughly the area someone would drive to from Philly.
 */
const METRO_BOUNDS = { minLat: 39.70, minLng: -75.55, maxLat: 40.35, maxLng: -74.70 };

/** Photon `bbox` order: minLon,minLat,maxLon,maxLat. */
export const METRO_BBOX =
  `${METRO_BOUNDS.minLng},${METRO_BOUNDS.minLat},${METRO_BOUNDS.maxLng},${METRO_BOUNDS.maxLat}`;

/** Nominatim `viewbox` order: left,top,right,bottom. */
export const METRO_VIEWBOX =
  `${METRO_BOUNDS.minLng},${METRO_BOUNDS.maxLat},${METRO_BOUNDS.maxLng},${METRO_BOUNDS.minLat}`;

/** True for results inside greater Philadelphia. */
export function isInPhillyRegion(location: LatLng): boolean {
  return (
    location.lat >= METRO_BOUNDS.minLat && location.lat <= METRO_BOUNDS.maxLat &&
    location.lng >= METRO_BOUNDS.minLng && location.lng <= METRO_BOUNDS.maxLng
  );
}

// States that mean "not around here". Only ever matched against the part of the
// query after a comma, where a state is a place rather than a street name:
// Philadelphia has an Indiana Avenue, and "wawa in" is not a search in Indiana.
const DISTANT_STATE_NAMES = [
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa', 'kansas',
  'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan', 'minnesota',
  'mississippi', 'missouri', 'montana', 'nebraska', 'nevada', 'new hampshire', 'new mexico',
  'new york', 'north carolina', 'north dakota', 'ohio', 'oklahoma', 'oregon', 'rhode island',
  'south carolina', 'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia',
  'washington dc', 'west virginia', 'wisconsin', 'wyoming',
];

const DISTANT_STATE_CODES = new Set([
  'al', 'ak', 'az', 'ar', 'ca', 'co', 'ct', 'dc', 'fl', 'ga', 'hi', 'id', 'il', 'in', 'ia',
  'ks', 'ky', 'me', 'md', 'ma', 'mi', 'mn', 'ms', 'mo', 'mt', 'ne', 'nv', 'nh', 'nm', 'ny',
  'nc', 'nd', 'oh', 'ok', 'or', 'ri', 'sc', 'sd', 'tn', 'tx', 'ut', 'vt', 'va', 'wa', 'wv',
  'wi', 'wy',
]);

/**
 * True when the query spells out a locality in a state outside the Philly
 * region — "1600 pennsylvania ave, washington dc", "123 main st, brooklyn ny".
 * Those searches mean somewhere else, so local results must not jump the queue.
 *
 * Only the text after the first comma is considered, so street names that
 * happen to be state names ("indiana avenue") are left alone.
 */
export function mentionsDistantState(query: string): boolean {
  const parts = query.toLowerCase().replace(/[^a-z0-9\s,]/g, ' ').split(',');
  if (parts.length < 2) return false;
  const locality = parts.slice(1).join(' ').replace(/\s+/g, ' ').trim();
  if (DISTANT_STATE_NAMES.some((name) => new RegExp(`\\b${name}\\b`).test(locality))) return true;

  const localityWords = locality.split(' ').filter(Boolean);
  const last = localityWords[localityWords.length - 1];
  // The last word, or the one before a trailing ZIP ("brooklyn, ny 11201")
  const stateWord = last && /^\d{5}$/.test(last) ? localityWords[localityWords.length - 2] : last;
  return !!stateWord && DISTANT_STATE_CODES.has(stateWord);
}

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

/** Lowercase words, apostrophes closed up so "joes" ~ "Joe's". */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['\u2019]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** What the user is looking for: everything before the first comma. */
function queryTokens(query: string): string[] {
  return words(cleanQuery(query).split(',')[0]);
}

/**
 * Where they said to look: the city/state after the first comma, ZIP dropped.
 * "1600 pennsylvania ave, washington dc" → ['washington', 'dc'].
 */
function localityTokens(query: string): string[] {
  const parts = cleanQuery(query).split(',').slice(1);
  return words(parts.join(' ')).filter((word) => !/^\d{5}$/.test(word));
}

/** Words from a result the user could plausibly have typed. */
function resultWords(result: GeocodingResult): string[] {
  return words(`${result.shortName} ${result.displayName} ${result.category ?? ''}`);
}

/**
 * True when every word typed shows up in the result's text. Photon is fuzzy and
 * happily returns near-misses, so this separates "actually what you typed" from
 * "something that happened to be close by".
 */
function matchesQueryText(result: GeocodingResult, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const candidates = resultWords(result);
  return tokens.every((token) => candidates.some((word) => (
    // Longer tokens may still be half-typed ("phi" ~ Philadelphia); a one- or
    // two-letter token has to be the whole word, so ", FL" isn't "Florence St"
    token.length > 2 ? word.startsWith(token) : word === token
  )));
}

/**
 * How relevant a result is to the query: street/house match for address
 * queries ("1234 south st"), otherwise whether the typed words appear at all.
 */
function relevanceScore(result: GeocodingResult, houseNumber: string | null, typed: string[], tokens: string[]): number {
  if (houseNumber) return addressScore(result, houseNumber, typed);
  return matchesQueryText(result, tokens) ? 1 : 0;
}

// Distance is compared in coarse buckets so that results which are effectively
// equidistant keep the provider's own relevance order.
const DISTANCE_BUCKET_M = 250;

/**
 * Combine Photon and Nominatim results, ranked for a Philadelphia app:
 *
 *  1. plausible matches first — anything that matches the street or the words
 *     typed outranks a result that just happens to be nearby;
 *  2. then the city the user actually typed, when they typed one
 *     ("123 e main st, norristown pa" → Norristown before Center City);
 *  3. then greater-Philly results, unless the query names another state
 *     ("1600 pennsylvania ave, washington dc"), so local beats out-of-town;
 *  4. then how well it matches ("1234 south st" prefers 1234 South Street over
 *     1234 South 21st Street);
 *  5. then distance from the user (or from City Hall when GPS is unavailable);
 *  6. then provider order (Photon, then Nominatim).
 */
export function mergeSearchResults(
  query: string,
  photon: GeocodingResult[],
  nominatim: GeocodingResult[],
  limit = MAX_SEARCH_RESULTS,
  near?: LatLng | null,
): GeocodingResult[] {
  const number = leadingHouseNumber(query);
  const typed = number ? queryStreetTokens(query) : [];
  const tokens = number ? [] : queryTokens(query);
  const locality = localityTokens(query);
  const preferLocal = !mentionsDistantState(query);
  // No GPS is not a reason to rank blind: fall back to City Hall.
  const bias = near ?? PHILLY_CENTER;

  const ordered = [...photon, ...nominatim]
    .map((result, index) => {
      const relevance = relevanceScore(result, number, typed, tokens);
      return {
        result,
        index,
        relevance,
        plausible: relevance > 0 ? 1 : 0,
        // Neutral when nobody matches, e.g. results that carry no city text
        inTypedCity: matchesQueryText(result, locality) && locality.length > 0 ? 1 : 0,
        local: preferLocal && isInPhillyRegion(result.location) ? 1 : 0,
        distance: Math.round(haversineDistance(bias, result.location) / DISTANCE_BUCKET_M),
      };
    })
    .sort((a, b) =>
      b.plausible - a.plausible ||
      b.inTypedCity - a.inTypedCity ||
      b.local - a.local ||
      b.relevance - a.relevance ||
      a.distance - b.distance ||
      a.index - b.index,
    )
    .map(({ result }) => result);

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
