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
 * number, exact house-number matches float to the top (Photon first, then
 * Nominatim's interpolated addresses); otherwise Photon's relevance order wins.
 */
export function mergeSearchResults(
  query: string,
  photon: GeocodingResult[],
  nominatim: GeocodingResult[],
  limit = MAX_SEARCH_RESULTS,
): GeocodingResult[] {
  const number = leadingHouseNumber(query);
  const matches = (r: GeocodingResult) => !!number && r.houseNumber?.toLowerCase() === number;

  const ordered = number
    ? [
        ...photon.filter(matches),
        ...nominatim.filter(matches),
        ...photon.filter((r) => !matches(r)),
        ...nominatim.filter((r) => !matches(r)),
      ]
    : [...photon, ...nominatim];

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
