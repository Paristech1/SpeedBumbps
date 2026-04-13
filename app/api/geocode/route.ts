/**
 * Nominatim geocoding proxy.
 * Nominatim requires a User-Agent header — browsers cannot set this, so we proxy server-side.
 * Ported from Flutter: lib/features/routing/data/datasources/nominatim_geocoding_api.dart
 */

import { NextRequest, NextResponse } from 'next/server';
import type { GeocodingResult } from '@/types/speedbumps';

// Philadelphia bounding box
const PHILLY_VIEWBOX = '-75.28,40.14,-74.96,39.87';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q');
  if (!query || !query.trim()) {
    return NextResponse.json([]);
  }

  const searchQuery = `${query.trim()}, Philadelphia, PA`;
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', searchQuery);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '5');
  url.searchParams.set('viewbox', PHILLY_VIEWBOX);
  url.searchParams.set('bounded', '0');
  url.searchParams.set('addressdetails', '1');

  const response = await fetch(url.toString(), {
    headers: {
      'User-Agent': 'SpeedBumps-App/1.0 (https://github.com/speedbumps)',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Geocoding service unavailable' }, { status: 502 });
  }

  const data = await response.json() as NominatimResult[];

  const results: GeocodingResult[] = data.map((item) => {
    const address = item.address ?? {};
    const shortParts = [
      address.road ?? address.pedestrian ?? address.path,
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
  });

  return NextResponse.json(results);
}

interface NominatimResult {
  place_id?: number;
  display_name?: string;
  lat?: string;
  lon?: string;
  address?: {
    road?: string;
    pedestrian?: string;
    path?: string;
    suburb?: string;
    neighbourhood?: string;
    city_district?: string;
  };
}
