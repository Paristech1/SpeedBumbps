/**
 * Search with Google Places behind it — driven through the real route
 * handler, with Google's HTTP answers stubbed. The City address index is the
 * real one on disk.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { detailsToResult, predictionToResult } from '@/lib/google-places';
import type { GeocodingResult } from '@/types/speedbumps';

const NEAR = { lat: 39.9752, lng: -75.1668 };
const SESSION = '6f1d0c8e-2b7a-4c1e-9f3d-8a2b4c6d8e0f';

const prediction = (placeId: string, main: string, secondary: string, types: string[], distanceMeters?: number) => ({
  placePrediction: {
    placeId,
    text: { text: `${main}, ${secondary}` },
    structuredFormat: { mainText: { text: main }, secondaryText: { text: secondary } },
    types,
    ...(distanceMeters ? { distanceMeters } : {}),
  },
});

describe('predictionToResult', () => {
  it('maps an address suggestion as pending, with the house split out', () => {
    const r = predictionToResult(
      prediction('ChIJjohnson22', '22 E Johnson St', 'Philadelphia, PA, USA', ['street_address', 'geocode'], 8100).placePrediction,
      NEAR,
    );
    expect(r).toMatchObject({
      shortName: '22 E Johnson St',
      displayName: 'Philadelphia, PA',
      pending: true,
      placeId: 'ChIJjohnson22',
      kind: 'address',
      houseNumber: '22',
      street: 'E Johnson St',
      distanceMeters: 8100,
    });
  });

  it('calls a business a place', () => {
    const r = predictionToResult(prediction('ChIJwawa', 'Wawa', 'Girard Ave, Philadelphia, PA, USA', ['convenience_store', 'store', 'establishment']).placePrediction, NEAR);
    expect(r?.kind).toBe('place');
  });
});

describe('detailsToResult', () => {
  it('reads the location and the house from address components', () => {
    const r = detailsToResult(
      {
        location: { latitude: 40.04611, longitude: -75.18187 },
        formattedAddress: '22 E Johnson St, Philadelphia, PA 19144, USA',
        addressComponents: [
          { shortText: '22', types: ['street_number'] },
          { shortText: 'E Johnson St', types: ['route'] },
        ],
        types: ['street_address'],
      },
      'ChIJjohnson22',
    );
    expect(r).toMatchObject({
      shortName: '22 E Johnson St',
      displayName: '22 E Johnson St, Philadelphia, PA 19144',
      location: { lat: 40.04611, lng: -75.18187 },
      houseNumber: '22',
      street: 'E Johnson St',
    });
    expect(r?.pending).toBeUndefined();
  });
});

describe('/api/geocode with Google Places', () => {
  let calls: { url: string; init?: RequestInit }[];

  const stubFetch = (respond: (url: string, init?: RequestInit) => Response) => {
    calls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return respond(url, init);
    }));
  };
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  const get = async (qs: string) => {
    vi.resetModules(); // the route keeps per-instance caches
    const { GET } = await import('@/app/api/geocode/route');
    return GET(new NextRequest(`http://localhost/api/geocode?${qs}`));
  };

  beforeEach(() => {
    process.env.GOOGLE_MAPS_API_KEY = 'test-key';
  });
  afterEach(() => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    vi.unstubAllGlobals();
  });

  it('answers the recorded search with the typed house, and none of the stray streets', async () => {
    stubFetch(() => json({
      suggestions: [
        prediction('ChIJjohnson22', '22 E Johnson St', 'Philadelphia, PA, USA', ['street_address']),
        prediction('ChIJchalmers', 'Chalmers Ave', 'Philadelphia, PA, USA', ['route']),
      ],
    }));

    const res = await get(`q=${encodeURIComponent('22 East Johnson street')}&near=39.98,-75.17&session=${SESSION}`);
    const body = await res.json() as GeocodingResult[];

    expect(body[0].shortName).toBe('22 E Johnson St');
    expect(body.map((r) => r.shortName)).not.toContain('Chalmers Ave');
    expect(res.headers.get('Cache-Control')).toBe('no-store');

    const sent = JSON.parse(String(calls[0].init?.body));
    expect(calls[0].url).toContain('places:autocomplete');
    expect(sent).toMatchObject({ input: '22 East Johnson street', sessionToken: SESSION, includedRegionCodes: ['us'] });
    expect(sent.locationBias.circle.center).toEqual({ latitude: 39.98, longitude: -75.17 });
  });

  it('keeps Google’s order for businesses', async () => {
    stubFetch(() => json({
      suggestions: [
        prediction('ChIJwawa1', 'Wawa', 'W Girard Ave, Philadelphia, PA, USA', ['convenience_store'], 900),
        prediction('ChIJwawa2', 'Wawa', 'N Broad St, Philadelphia, PA, USA', ['convenience_store'], 2100),
      ],
    }));
    const body = await (await get('q=wawa&near=39.98,-75.17')).json() as GeocodingResult[];
    expect(body.map((r) => r.placeId)).toEqual(['ChIJwawa1', 'ChIJwawa2']);
    expect(body.every((r) => r.pending)).toBe(true);
  });

  it('falls back to Photon when Google refuses', async () => {
    stubFetch((url) => (url.includes('googleapis') ? json({ error: { message: 'API key not valid' } }, 403) : json({ features: [] })));
    await get('q=wawa&near=39.98,-75.17');
    expect(calls.some((c) => c.url.includes('photon.komoot.io'))).toBe(true);
  });

  it('resolves a pick with the same session and only Essentials fields', async () => {
    stubFetch(() => json({
      location: { latitude: 40.04611, longitude: -75.18187 },
      formattedAddress: '22 E Johnson St, Philadelphia, PA 19144, USA',
      addressComponents: [{ shortText: '22', types: ['street_number'] }, { shortText: 'E Johnson St', types: ['route'] }],
      types: ['street_address'],
    }));
    const res = await get(`place=ChIJjohnson22&session=${SESSION}&label=${encodeURIComponent('22 E Johnson St')}`);
    const body = await res.json() as GeocodingResult;

    expect(body.location).toEqual({ lat: 40.04611, lng: -75.18187 });
    expect(calls[0].url).toContain(`places/ChIJjohnson22?sessionToken=${SESSION}`);
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers['X-Goog-FieldMask']).toBe('location,formattedAddress,addressComponents,types');
  });

  it('reports whether Google is on in the status check', async () => {
    const body = await (await get('status')).json();
    expect(body.googlePlaces).toBe(true);
  });
});
