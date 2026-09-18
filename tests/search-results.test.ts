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
  filterProviderResults,
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

describe('mergeSearchResults with City index hits', () => {
  const at = (lat: number, lng: number) => ({ lat, lng });
  const indexHouse = (num: string, street: string, lat: number, approximate = false): GeocodingResult => ({
    shortName: `${num} ${street}`, displayName: 'Philadelphia, PA', location: at(lat, -75.14), kind: 'address', houseNumber: num, street, approximate,
  });
  const photonHouse: GeocodingResult = {
    shortName: '4521 North Franklin Street', displayName: '', location: at(40.3, -75.14), kind: 'address', houseNumber: '4521', street: 'North Franklin Street',
  };
  const wawa: GeocodingResult = { shortName: 'Wawa', displayName: '', location: at(40.01, -75.14), kind: 'place', category: 'Convenience store' };

  it('ranks index tiers above provider results, nearest first within a tier', () => {
    const merged = mergeSearchResults('4521 n fr', [wawa, photonHouse], [], 8, at(40.0, -75.14), [
      { tier: 3, result: indexHouse('4521', 'N Fairhill St', 40.0, true) },
      { tier: 2, result: indexHouse('4521', 'N Front St', 40.05) },
      { tier: 2, result: indexHouse('4521', 'N Franklin St', 40.02) },
      { tier: 1, result: indexHouse('4521', 'N Franklin St', 40.1) },
    ]);
    expect(merged.map((r) => r.location.lat)).toEqual([40.1, 40.02, 40.05, 40.0, 40.3, 40.01]);
  });

  it('keeps index order when there is no bias point', () => {
    const merged = mergeSearchResults('123 5th st', [], [], 8, null, [
      { tier: 1, result: indexHouse('123', 'S 5th St', 39.94) },
      { tier: 1, result: indexHouse('123', 'N 5th St', 39.95) },
    ]);
    expect(merged.map((r) => r.shortName)).toEqual(['123 S 5th St', '123 N 5th St']);
  });

  it('prefers the index copy when a provider returns the same address', () => {
    const photonCopy = { ...photonHouse, location: at(40.0151, -75.1402) };
    const merged = mergeSearchResults('4521 n franklin st', [photonCopy], [], 8, null, [
      { tier: 1, result: indexHouse('4521', 'N Franklin St', 40.015) },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].shortName).toBe('4521 N Franklin St');
  });

  it('swaps an approximate index pin for a provider\'s exact copy, keeping its rank', () => {
    const approx = indexHouse('1234', 'South St', 39.9437, true);
    const nominatimExact: GeocodingResult = { ...house1234South, location: at(39.9436, -75.1401) };
    const merged = mergeSearchResults('1234 south st', [wawa], [nominatimExact], 8, null, [{ tier: 3, result: approx }]);
    expect(merged[0]).toBe(nominatimExact);
    expect(merged).toHaveLength(2);
  });

  const house1234South: GeocodingResult = {
    shortName: '1234 South Street', displayName: '', location: at(0, 0), kind: 'address', houseNumber: '1234', street: 'South Street',
  };

  it('caps index hits at 5 and the total at the limit', () => {
    const hits = Array.from({ length: 7 }, (_, i) => ({ tier: 1 as const, result: indexHouse(String(100 + i), 'Market St', 39.95 + i * 0.01) }));
    const many = Array.from({ length: 10 }, (_, i) => ({ ...wawa, location: at(40.2 + i * 0.01, -75) }));
    const merged = mergeSearchResults('100 market', many, [], 8, null, hits);
    expect(merged).toHaveLength(8);
    expect(merged.filter((r) => r.street === 'Market St')).toHaveLength(5);
  });
});

describe('filterProviderResults', () => {
  const at = (lat: number, lng: number) => ({ lat, lng });
  const cafe: GeocodingResult = { shortName: 'Bean Cafe', displayName: '1500 Wolf Street', location: at(39.92, -75.17), kind: 'place', category: 'Cafe' };
  const wilmington: GeocodingResult = { shortName: 'West 16th Street', displayName: 'Wilmington', location: at(39.74, -75.55), kind: 'street', street: 'West 16th Street' };
  const bigler: GeocodingResult = { shortName: 'Bigler Street', displayName: 'South Philadelphia', location: at(39.9146, -75.17), kind: 'street', street: 'Bigler Street' };
  const barnes: GeocodingResult = { shortName: 'Barnes & Noble', displayName: '1805 Walnut Street', location: at(39.95, -75.17), kind: 'place', category: 'Books' };

  it('T8: an unknown intersection keeps nothing unrelated', () => {
    const filter = { kind: 'intersection' as const, sides: ['zzz', 'qqq'] as [string, string] };
    const kept = filterProviderResults([cafe, wilmington], filter);
    expect(kept).toEqual([]);
    expect(mergeSearchResults('zzz & qqq', kept, [])).toEqual([]);
  });

  it('keeps the typed streets for an intersection, but no POIs', () => {
    const filter = { kind: 'intersection' as const, sides: ['s 16th', 'bigler'] as [string, string] };
    expect(filterProviderResults([cafe, wilmington, bigler], filter)).toEqual([bigler]);
    // Photon labels some bare streets "address"; without a house number it's still the street
    const bareStreet: GeocodingResult = { shortName: 'North 5th Street', displayName: '19106', location: at(39.953, -75.147), kind: 'address', street: 'North 5th Street' };
    const house: GeocodingResult = { ...bareStreet, shortName: '12 North 5th Street', houseNumber: '12' };
    expect(filterProviderResults([bareStreet, house], { kind: 'intersection', sides: ['5th', 'market'] })).toEqual([bareStreet]);
  });

  it('keeps places named after both sides ("Barnes & Noble", "AT&T")', () => {
    expect(filterProviderResults([barnes, cafe], { kind: 'intersection', sides: ['barnes', 'noble'] })).toEqual([barnes]);
    const att: GeocodingResult = { ...barnes, shortName: 'AT&T Store' };
    expect(filterProviderResults([att], { kind: 'intersection', sides: ['at', 't'] })).toEqual([att]);
  });

  it('T9: an exact index house keeps only up to 2 nearby places', () => {
    const house = at(39.9146, -75.1749);
    const street: GeocodingResult = { shortName: 'Bigler Street', displayName: '', location: at(39.9146, -75.1745), kind: 'street', street: 'Bigler Street' };
    const farPoi: GeocodingResult = { ...cafe, shortName: 'Far Cafe', location: at(39.96, -75.17) };
    const nearPoi: GeocodingResult = { ...cafe, shortName: 'Corner Store', location: at(39.9150, -75.1752) };
    const filter = { kind: 'exactAddress' as const, anchors: [house] };
    expect(filterProviderResults([street, farPoi, nearPoi], filter)).toEqual([nearPoi]);
    const many = Array.from({ length: 4 }, (_, i) => ({ ...nearPoi, shortName: `Shop ${i}` }));
    expect(filterProviderResults(many, filter)).toHaveLength(2);
  });

  it('leaves results alone without a filter', () => {
    expect(filterProviderResults([cafe, bigler], null)).toEqual([cafe, bigler]);
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
