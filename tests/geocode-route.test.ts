/**
 * Covers the Philly-first search strategy in the geocode route with the
 * upstream services stubbed: which Photon calls go out, and in what order
 * the merged results come back.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/geocode/route';
import type { GeocodingResult } from '@/types/speedbumps';

const NEAR = '39.9496,-75.1503';

interface Feature {
  name: string;
  lat: number;
  lon: number;
  city?: string;
}

function photonBody(features: Feature[]) {
  return {
    features: features.map((f) => ({
      geometry: { coordinates: [f.lon, f.lat] },
      properties: { name: f.name, city: f.city, osm_key: 'shop', osm_value: 'convenience' },
    })),
  };
}

/** A Photon house-number feature, as returned for address queries. */
function photonAddressBody(housenumber: string, street: string, lat: number, lon: number, city: string) {
  return {
    features: [{
      geometry: { coordinates: [lon, lat] },
      properties: { housenumber, street, city, type: 'house', osm_key: 'building', osm_value: 'yes' },
    }],
  };
}

let calls: string[] = [];

/** Stub Photon/Nominatim. `photon` receives the request URL so a test can vary by bbox. */
function stubUpstream(photon: (url: URL) => object, nominatim: object = []) {
  vi.stubGlobal('fetch', vi.fn(async (input: string) => {
    const url = new URL(input);
    calls.push(url.host + (url.searchParams.has('bbox') ? ' [bbox]' : ''));
    const body = url.host === 'photon.komoot.io' ? photon(url) : nominatim;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }));
}

async function search(query: string, near: string | null = NEAR): Promise<GeocodingResult[]> {
  const url = new URL('http://localhost/api/geocode');
  url.searchParams.set('q', query);
  if (near) url.searchParams.set('near', near);
  const response = await GET(new NextRequest(url));
  expect(response.status).toBe(200);
  return await response.json() as GeocodingResult[];
}

beforeEach(() => {
  calls = [];
  vi.unstubAllGlobals();
});

describe('geocode route: Philly first', () => {
  it('searches the metro only when the metro has results', async () => {
    stubUpstream(() => photonBody([
      { name: 'Wawa', lat: 39.9479, lon: -75.1591, city: 'Philadelphia' },
      { name: 'Wawa', lat: 40.0893, lon: -75.3960, city: 'King of Prussia' },
    ]));

    const results = await search('wawa metro-only');
    expect(calls).toEqual(['photon.komoot.io [bbox]']);
    expect(results.map((r) => r.displayName)).toEqual(['Philadelphia', 'King of Prussia']);
  });

  it('widens past the metro when the metro comes up empty', async () => {
    // The bbox pass finds nothing; the nationwide pass finds the real place
    stubUpstream((url) => url.searchParams.has('bbox')
      ? photonBody([])
      : photonBody([{ name: 'Statue of Liberty', lat: 40.6892, lon: -74.0445, city: 'New York' }]));

    const results = await search('statue of liberty');
    expect(calls).toEqual(['photon.komoot.io [bbox]', 'photon.komoot.io']);
    expect(results.map((r) => r.shortName)).toEqual(['Statue of Liberty']);
  });

  it('keeps a local hit on top of the widened results', async () => {
    stubUpstream((url) => url.searchParams.has('bbox')
      ? photonBody([{ name: 'Liberty Bell Center', lat: 39.9496, lon: -75.1503, city: 'Philadelphia' }])
      : photonBody([
          { name: 'Liberty Bell Museum', lat: 40.6009, lon: -75.4714, city: 'Allentown' },
          { name: 'Liberty Bell Center', lat: 39.9496, lon: -75.1503, city: 'Philadelphia' },
        ]));

    const results = await search('liberty bell');
    // One local result is below the threshold, so it still widens — and dedupes
    expect(calls).toEqual(['photon.komoot.io [bbox]', 'photon.komoot.io']);
    expect(results.map((r) => r.displayName)).toEqual(['Philadelphia', 'Allentown']);
  });

  it('skips the Philly-only pass when the query names another state', async () => {
    stubUpstream(() => photonBody([
      { name: 'Grand Central Terminal', lat: 40.7527, lon: -73.9772, city: 'New York' },
    ]));

    const results = await search('grand central terminal, new york');
    expect(calls).toEqual(['photon.komoot.io']);
    expect(results.map((r) => r.shortName)).toEqual(['Grand Central Terminal']);
  });

  it('ranks the Philly address first even with no user location', async () => {
    // Same house number on the same street name in Reading (outside the metro,
    // so only the widened pass sees it) and in Philadelphia.
    stubUpstream(
      (url) => url.searchParams.has('bbox')
        ? photonBody([])
        : photonAddressBody('1234', 'South Street', 40.335, -75.927, 'Reading'),
      [{
        display_name: '1234, South Street, Philadelphia, PA',
        lat: '39.941', lon: '-75.163',
        address: { house_number: '1234', road: 'South Street', suburb: 'South Philadelphia' },
      }],
    );

    const results = await search('1234 south st', null);
    // Address queries also hit Nominatim; it runs alongside Photon, so order varies
    expect([...new Set(calls)].sort()).toEqual([
      'nominatim.openstreetmap.org', 'photon.komoot.io', 'photon.komoot.io [bbox]',
    ]);
    expect(results[0].shortName).toBe('1234 South Street, South Philadelphia');
    expect(results[1].displayName).toContain('Reading');
  });
});
