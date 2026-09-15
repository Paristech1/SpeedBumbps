import { describe, it, expect } from 'vitest';
import {
  leadingHouseNumber,
  categoryLabel,
  photonToResult,
  nominatimToResult,
  mergeSearchResults,
  biasCacheKey,
  cleanQuery,
  normalizeStreet,
  hasHouseOnTypedStreet,
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

  it('keeps Photon order for non-address queries without a bias point', () => {
    const merged = mergeSearchResults('frankford', [photonStreet], [nominatimHouse]);
    expect(merged[0]).toBe(photonStreet);
  });

  it('sorts chain queries nearest-first when a bias point is given', () => {
    const center = at(39.95, -75.16);
    const far: GeocodingResult = { shortName: 'CVS', displayName: 'South 70th Street', location: at(39.91, -75.23), kind: 'place', category: 'Pharmacy' };
    const near: GeocodingResult = { shortName: 'CVS Pharmacy', displayName: '1201 Walnut Street', location: at(39.949, -75.161), kind: 'place', category: 'Pharmacy', houseNumber: '1201' };
    const merged = mergeSearchResults('cvs', [far, near], [], 8, center);
    expect(merged[0].shortName).toBe('CVS Pharmacy');
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

describe('cleanQuery', () => {
  it('strips unit designators', () => {
    expect(cleanQuery('1600 n broad st apt 2')).toBe('1600 n broad st');
    expect(cleanQuery('1600 N Broad St, Apt. 4B, Philadelphia')).toBe('1600 N Broad St, Philadelphia');
    expect(cleanQuery('1500 Market St Suite 300')).toBe('1500 Market St');
    expect(cleanQuery('10 S 2nd St #5')).toBe('10 S 2nd St');
  });

  it('leaves normal addresses alone', () => {
    expect(cleanQuery('8 Haddon Ave, Haddonfield NJ')).toBe('8 Haddon Ave, Haddonfield NJ');
    expect(cleanQuery('  trader   joes ')).toBe('trader joes');
  });
});

describe('normalizeStreet', () => {
  it('expands abbreviations', () => {
    expect(normalizeStreet('N. Broad St')).toEqual(['north', 'broad', 'street']);
    expect(normalizeStreet('JFK Blvd')).toEqual(['john', 'f', 'kennedy', 'boulevard']);
  });
});

describe('mergeSearchResults street ranking', () => {
  const at = (lat: number, lng: number) => ({ lat, lng });
  const house = (num: string, street: string): GeocodingResult => ({
    shortName: `${num} ${street}`, displayName: '', location: at(39.9 + Math.random() * 0.1, -75.1), kind: 'address', houseNumber: num, street,
  });

  it('prefers the typed street over the same number on a different street', () => {
    const photon = [house('1234', 'South 21st Street'), house('1234', 'South 18th Street')];
    const nominatim = [house('1234', 'South Street')];
    expect(mergeSearchResults('1234 south st', photon, nominatim)[0].street).toBe('South Street');
    expect(mergeSearchResults('1234 South Street, Philadelphia, PA 19147', photon, nominatim)[0].street).toBe('South Street');
  });

  it('matches streets without a typed direction', () => {
    const photon: GeocodingResult[] = [
      { shortName: 'Carl\'s Service', displayName: '', location: at(39.89, -75.03), kind: 'place', houseNumber: '515', street: 'North Haddon Avenue' },
    ];
    const nominatim = [house('8', 'South Haddon Avenue')];
    expect(mergeSearchResults('8 Haddon Ave, Haddonfield NJ', photon, nominatim)[0].houseNumber).toBe('8');
  });

  it('treats a half-typed street as a match', () => {
    const photon = [house('1500', 'Morris Street'), house('1500', 'Market Street')];
    expect(mergeSearchResults('1500 mark', photon, [])[0].street).toBe('Market Street');
  });
});

describe('hasHouseOnTypedStreet', () => {
  const house = (num: string, street: string): GeocodingResult => ({
    shortName: `${num} ${street}`, displayName: '', location: { lat: 39.95, lng: -75.16 }, kind: 'address', houseNumber: num, street,
  });

  it('is false when the number only exists on other streets', () => {
    expect(hasHouseOnTypedStreet('1234 south st', [house('1234', 'South 21st Street')])).toBe(false);
  });

  it('is false when the street matches but the number does not', () => {
    expect(hasHouseOnTypedStreet('8 haddon ave', [house('515', 'North Haddon Avenue')])).toBe(false);
  });

  it('is true for the right house, including half-typed streets', () => {
    expect(hasHouseOnTypedStreet('1600 n broad st', [house('1600', 'North Broad Street')])).toBe(true);
    expect(hasHouseOnTypedStreet('1500 mark', [house('1500', 'Market Street')])).toBe(true);
  });

  it('is always true for non-address queries', () => {
    expect(hasHouseOnTypedStreet('wawa', [])).toBe(true);
  });
});

describe('biasCacheKey', () => {
  it('buckets nearby points together', () => {
    expect(biasCacheKey(at(39.9526, -75.1652))).toBe(biasCacheKey(at(39.9541, -75.1671)));
    expect(biasCacheKey(null)).toBe('none');
  });

  function at(lat: number, lng: number) { return { lat, lng }; }
});
