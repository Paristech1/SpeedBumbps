/**
 * Google Places (New) — the place search the OSM geocoders can't be.
 *
 * Photon's public server is a demo that throttles production use, Nominatim's
 * policy forbids search-as-you-type, and neither knows businesses the way a
 * driver expects ("chipotle", a doctor's office, "the target on columbus").
 * Places Autocomplete does, and with session tokens the keystrokes are free:
 * a session is billed once, when the driver picks a result and we fetch its
 * location (Place Details, Essentials fields only).
 *
 * Server-only. Off unless GOOGLE_MAPS_API_KEY is set; without it search runs
 * on the City index + Photon/Nominatim exactly as before.
 *
 * Suggestions carry no coordinates. They come back `pending`, with the place
 * id, and are resolved through `fetchGooglePlace` when chosen.
 */

import type { GeocodingKind, GeocodingResult, LatLng } from '@/types/speedbumps';

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const DETAILS_URL = 'https://places.googleapis.com/v1/places/';
// Essentials SKU only: anything richer (displayName, rating, hours) bills higher.
const DETAILS_FIELDS = 'location,formattedAddress,addressComponents,types';
// Greater Philly and its suburbs; a bias, not a wall — "cherry hill mall" still works.
const BIAS_RADIUS_M = 40000;

export function googlePlacesKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

/** Session tokens are ours to mint; keep them to a UUID shape so junk can't be forwarded. */
export function isSessionToken(value: string | null): value is string {
  return !!value && /^[0-9a-f-]{16,64}$/i.test(value);
}

export class GoogleError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

interface Prediction {
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
  types?: string[];
  distanceMeters?: number;
}

const ADDRESS_TYPES = new Set(['street_address', 'premise', 'subpremise']);
const AREA_TYPES = new Set([
  'locality', 'sublocality', 'neighborhood', 'postal_code', 'administrative_area_level_1',
  'administrative_area_level_2', 'administrative_area_level_3', 'political', 'country',
]);

function kindFor(types: string[] = []): GeocodingKind {
  if (types.some((t) => ADDRESS_TYPES.has(t))) return 'address';
  if (types.includes('route') || types.includes('intersection')) return 'street';
  if (types.length > 0 && types.every((t) => AREA_TYPES.has(t) || t === 'geocode')) return 'area';
  return 'place';
}

/** "22 E Johnson St" → { houseNumber: "22", street: "E Johnson St" } */
function splitHouse(main: string): { houseNumber?: string; street?: string } {
  const m = main.match(/^(\d+[a-z]?)\s+(.+)$/i);
  return m ? { houseNumber: m[1], street: m[2] } : {};
}

/** Tidy "Philadelphia, PA, USA" → "Philadelphia, PA". */
function tidySecondary(text: string): string {
  return text.replace(/,\s*(USA|United States)$/i, '');
}

export function predictionToResult(p: Prediction, near: LatLng): GeocodingResult | null {
  const main = p.structuredFormat?.mainText?.text ?? p.text?.text;
  if (!p.placeId || !main) return null;
  const kind = kindFor(p.types);
  return {
    shortName: main,
    displayName: tidySecondary(p.structuredFormat?.secondaryText?.text ?? ''),
    // Not known until the place is resolved; `pending` says so. The bias
    // point keeps the type honest and is never used for routing.
    location: near,
    pending: true,
    placeId: p.placeId,
    kind,
    ...(typeof p.distanceMeters === 'number' ? { distanceMeters: p.distanceMeters } : {}),
    ...(kind === 'address' ? splitHouse(main) : {}),
  };
}

async function googleFetch<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  if (!res.ok) {
    let message = `Google Places ${res.status}`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      // not JSON
    }
    throw new GoogleError(res.status, message);
  }
  return (await res.json()) as T;
}

export async function fetchGoogleSuggestions(
  key: string,
  query: string,
  near: LatLng,
  origin: LatLng | null,
  sessionToken: string | undefined,
  timeoutMs: number,
): Promise<GeocodingResult[]> {
  const body: Record<string, unknown> = {
    input: query,
    includedRegionCodes: ['us'],
    locationBias: { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: BIAS_RADIUS_M } },
    languageCode: 'en',
  };
  if (origin) body.origin = { latitude: origin.lat, longitude: origin.lng };
  if (sessionToken) body.sessionToken = sessionToken;

  const data = await googleFetch<{ suggestions?: { placePrediction?: Prediction }[] }>(
    AUTOCOMPLETE_URL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify(body),
    },
    timeoutMs,
  );
  return (data.suggestions ?? [])
    .map((s) => (s.placePrediction ? predictionToResult(s.placePrediction, near) : null))
    .filter((r): r is GeocodingResult => r !== null);
}

interface PlaceDetails {
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  addressComponents?: { longText?: string; shortText?: string; types?: string[] }[];
  types?: string[];
}

export function detailsToResult(d: PlaceDetails, placeId: string, label?: string): GeocodingResult | null {
  const lat = d.location?.latitude;
  const lng = d.location?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const part = (type: string) => d.addressComponents?.find((c) => c.types?.includes(type))?.shortText;
  const houseNumber = part('street_number');
  const street = part('route');
  const address = tidySecondary(d.formattedAddress ?? '');
  const kind = kindFor(d.types);
  const shortName = label || (houseNumber && street ? `${houseNumber} ${street}` : address.split(',')[0]) || 'Dropped pin';
  return {
    shortName,
    displayName: address,
    location: { lat, lng },
    placeId,
    kind,
    ...(houseNumber ? { houseNumber } : {}),
    ...(street ? { street } : {}),
  };
}

/** Where a chosen suggestion actually is. Passing the session token closes (and bills) the session. */
export async function fetchGooglePlace(
  key: string,
  placeId: string,
  sessionToken: string | undefined,
  label: string | undefined,
  timeoutMs: number,
): Promise<GeocodingResult | null> {
  const url = new URL(DETAILS_URL + encodeURIComponent(placeId));
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
  const data = await googleFetch<PlaceDetails>(
    url.toString(),
    { headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': DETAILS_FIELDS } },
    timeoutMs,
  );
  return detailsToResult(data, placeId, label);
}
