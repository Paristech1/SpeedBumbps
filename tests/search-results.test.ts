import { describe, it, expect } from 'vitest';
import {
  leadingHouseNumber,
  categoryLabel,
  photonToResult,
  nominatimToResult,
  mergeSearchResults,
  biasCacheKey,
} from '@/lib/search-results';
import type { GeocodingResult } from '@/types/speedbumps';

describe('leadingHouseNumber', () => {
  it('extracts a leading number', () => {
    expect(leadingHouseNumber('1500 mark')).toBe('1500');
    expect(leadingHouseNumber('  12B South St')).toBe('12b');
  });

  it('ignores queries without a leading number', () => {
    expect(leadingHouseNumber('wawa')).toBeNull();
    expect(leadingHouseNumber('7-eleven')).toBe('7');
    expect(leadingHouseNumber('pier 40')).toBeNull();
  });
});

describe('categoryLabel', () => {
  it('humanises OSM values', () => {
    expect(categoryLabel('shop', 'convenience')).toBe('Convenience store');
    expect(categoryLabel('amenity', 'cafe')).toBe('Cafe');
    expect(categoryLabel('shop', 'bicycle_rental')).toBe('Bicycle rental');
  });

  it('skips structural keys', () => {
    expect(categoryLabel('highway', 'secondary')).toBeUndefined();
    expect(categoryLabel('building', 'commercial')).toBeUndefined();
  });
});

describe('photonToResult', () => {
  it('uses the business name for shops, with the address as detail', () => {
    const r = photonToResult({
      geometry: { coordinates: [-75.176, 39.953] },
      properties: {
        name: "Trader Joe's", housenumber: '2121', street: 'Market Street',
        district: 'Center City', city: 'Philadelphia', osm_key: 'shop', osm_value: 'supermarket',
      },
    });
    expect(r).toMatchObject({
      shortName: "Trader Joe's",
      displayName: '2121 Market Street, Center City, Philadelphia',
      kind: 'place',
      category: 'Grocery store',
      location: { lat: 39.953, lng: -75.176 },
    });
  });

  it('uses the street address for plain houses', () => {
    const r = photonToResult({
      geometry: { coordinates: [-75.1, 40] },
      properties: { housenumber: '4500', street: 'Frankford Avenue', city: 'Philadelphia', osm_key: 'building', osm_value: 'yes', type: 'house' },
    });
    expect(r?.shortName).toBe('4500 Frankford Avenue');
    expect(r?.kind).toBe('address');
  });

  it('drops features with no usable name', () => {
    expect(photonToResult({ geometry: { coordinates: [0, 0] }, properties: {} })).toBeNull();
  });
});

describe('mergeSearchResults', () => {
  const at = (lat: number, lng: number) => ({ lat, lng });
  const photonStreet: GeocodingResult = { shortName: 'Frankford Avenue', displayName: '', location: at(40.01, -75.08), kind: 'street' };
  const nominatimHouse = nominatimToResult({
    display_name: '4500, Frankford Avenue, Philadelphia', lat: '40.02', lon: '-75.08',
    address: { house_number: '4500', road: 'Frankford Avenue' },
  });

  it('floats exact house-number matches above street results', () => {
    const merged = mergeSearchResults('4500 frankford av', [photonStreet], [nominatimHouse]);
    expect(merged[0].shortName).toBe('4500 Frankford Avenue');
    expect(merged[1]).toBe(photonStreet);
  });

  it('keeps Photon order for non-address queries', () => {
    const merged = mergeSearchResults('frankford', [photonStreet], [nominatimHouse]);
    expect(merged[0]).toBe(photonStreet);
  });

  it('dedupes the same place from both providers', () => {
    const photonHouse: GeocodingResult = { ...nominatimHouse, displayName: 'Photon copy', location: at(40.0201, -75.0801) };
    const merged = mergeSearchResults('4500 frankford', [photonHouse], [nominatimHouse]);
    expect(merged).toHaveLength(1);
    expect(merged[0].displayName).toBe('Photon copy');
  });

  it('caps the result count', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ shortName: `Wawa ${i}`, displayName: '', location: at(40 + i * 0.01, -75) }));
    expect(mergeSearchResults('wawa', many, [])).toHaveLength(8);
  });
});

describe('biasCacheKey', () => {
  it('buckets nearby points together', () => {
    expect(biasCacheKey(at(39.9526, -75.1652))).toBe(biasCacheKey(at(39.9541, -75.1671)));
    expect(biasCacheKey(null)).toBe('none');
  });

  function at(lat: number, lng: number) { return { lat, lng }; }
});
