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
  isInPhillyRegion,
  mentionsDistantState,
  PHILLY_CENTER,
  METRO_BBOX,
  METRO_VIEWBOX,
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

  it('ranks results that match the typed words above whatever is merely nearby', () => {
    const center = at(39.9526, -75.1652);
    const closeButWrong: GeocodingResult = {
      shortName: 'Terminal Bar', displayName: '100 Filbert Street', location: at(39.9527, -75.1653), kind: 'place',
    };
    const theRealThing: GeocodingResult = {
      shortName: 'Reading Terminal Market', displayName: '51 North 12th Street', location: at(39.9533, -75.1590), kind: 'place',
    };
    const merged = mergeSearchResults('reading terminal market', [closeButWrong, theRealThing], [], 8, center);
    expect(merged[0].shortName).toBe('Reading Terminal Market');
  });

  it('matches names with apostrophes and half-typed words', () => {
    const tj: GeocodingResult = {
      shortName: "Trader Joe's", displayName: '2121 Market Street', location: at(39.9539, -75.1760), kind: 'place',
    };
    const other: GeocodingResult = {
      shortName: 'Joe Hand Gym', displayName: '7 Ridge Avenue', location: at(39.9530, -75.1650), kind: 'place',
    };
    expect(mergeSearchResults('trader joes', [tj, other], [], 8, at(39.9526, -75.1652))[0].shortName).toBe("Trader Joe's");
    expect(mergeSearchResults('trader joe', [tj, other], [], 8, at(39.9526, -75.1652))[0].shortName).toBe("Trader Joe's");
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

describe('Philly-first ranking', () => {
  const at = (lat: number, lng: number) => ({ lat, lng });
  const house = (num: string, street: string, lat: number, lng: number): GeocodingResult => ({
    shortName: `${num} ${street}`, displayName: '', location: at(lat, lng), kind: 'address', houseNumber: num, street,
  });

  it('puts a Philly address above the same address out of town', () => {
    const reading = house('1234', 'South Street', 40.335, -75.927);   // Reading, PA
    const philly = house('1234', 'South Street', 39.941, -75.163);
    // No bias point (location denied) — Philly still wins
    expect(mergeSearchResults('1234 south st', [reading, philly], [])[0]).toBe(philly);
    expect(mergeSearchResults('1234 south st', [reading], [philly])[0]).toBe(philly);
  });

  it('prefers a local partial match over an exact match far away', () => {
    const farExact = house('1234', 'South Street', 39.286, -76.612);  // Baltimore
    const localStreet = house('1234', 'South 21st Street', 39.941, -75.178);
    expect(mergeSearchResults('1234 south st', [farExact, localStreet], [])[0]).toBe(localStreet);
  });

  it('keeps nearby chains first, Philly before the suburbs', () => {
    const center = at(39.9496, -75.1503);
    const lancaster: GeocodingResult = { shortName: 'Wawa', displayName: 'Lancaster', location: at(40.0379, -76.3055), kind: 'place' };
    const kingOfPrussia: GeocodingResult = { shortName: 'Wawa', displayName: 'King of Prussia', location: at(40.0893, -75.3960), kind: 'place' };
    const centerCity: GeocodingResult = { shortName: 'Wawa', displayName: '1100 Walnut Street', location: at(39.9479, -75.1591), kind: 'place' };
    const merged = mergeSearchResults('wawa', [lancaster, kingOfPrussia, centerCity], [], 8, center);
    expect(merged.map((r) => r.displayName)).toEqual(['1100 Walnut Street', 'King of Prussia', 'Lancaster']);
  });

  it('does not read a state code as the start of another word', () => {
    const florida: GeocodingResult = {
      shortName: '100 Ocean Drive', displayName: 'South Beach, Miami Beach, FL', location: at(25.7823, -80.1301),
      kind: 'address', houseNumber: '100', street: 'Ocean Drive',
    };
    const philly: GeocodingResult = {
      shortName: '100 South Beach Street', displayName: 'Florence Street, Philadelphia', location: at(39.93, -75.17),
      kind: 'address', houseNumber: '100', street: 'South Beach Street',
    };
    // "fl" must not match "Florence": the Miami result is the one that fits
    expect(mergeSearchResults('100 south beach, miami beach, FL', [philly], [florida])[0]).toBe(florida);
  });

  it('does not bury results when the query names another state', () => {
    const dc: GeocodingResult = {
      shortName: '1600 Pennsylvania Avenue Northwest', displayName: 'Washington, DC', location: at(38.8977, -77.0365),
      kind: 'address', houseNumber: '1600', street: 'Pennsylvania Avenue Northwest',
    };
    const philly = house('1600', 'Pennsylvania Avenue', 39.9700, -75.1770);
    const merged = mergeSearchResults('1600 pennsylvania ave, washington dc', [philly], [dc]);
    expect(merged[0]).toBe(dc);
  });

  it('still prefers local when the query names a nearby state', () => {
    const haddonfield = house('8', 'South Haddon Avenue', 39.8912, -75.0377);
    const far = house('8', 'Haddon Avenue', 42.3601, -71.0589);
    expect(mergeSearchResults('8 Haddon Ave, Haddonfield NJ', [far], [haddonfield])[0]).toBe(haddonfield);
  });
});

describe('isInPhillyRegion', () => {
  it('covers the city, the suburbs and South Jersey', () => {
    expect(isInPhillyRegion(PHILLY_CENTER)).toBe(true);
    expect(isInPhillyRegion({ lat: 39.9259, lng: -75.1196 })).toBe(true);  // Camden, NJ
    expect(isInPhillyRegion({ lat: 40.0893, lng: -75.3960 })).toBe(true);  // King of Prussia
    expect(isInPhillyRegion({ lat: 39.7459, lng: -75.5466 })).toBe(true);  // Wilmington, DE (edge)
  });

  it('excludes the rest of the world', () => {
    expect(isInPhillyRegion({ lat: 40.7128, lng: -74.0060 })).toBe(false); // New York
    expect(isInPhillyRegion({ lat: 40.3356, lng: -75.9269 })).toBe(false); // Reading, PA
    expect(isInPhillyRegion({ lat: 39.2904, lng: -76.6122 })).toBe(false); // Baltimore
  });
});

describe('mentionsDistantState', () => {
  it('spots a locality in another state', () => {
    expect(mentionsDistantState('1600 pennsylvania ave, washington dc')).toBe(true);
    expect(mentionsDistantState('grand central, new york')).toBe(true);
    expect(mentionsDistantState('123 main st, brooklyn, NY 11201')).toBe(true);
    expect(mentionsDistantState('south beach, FL')).toBe(true);
  });

  it('treats PA, NJ and DE as local', () => {
    expect(mentionsDistantState('1234 south st')).toBe(false);
    expect(mentionsDistantState('123 E Main St, Norristown, PA')).toBe(false);
    expect(mentionsDistantState('8 Haddon Ave, Haddonfield NJ')).toBe(false);
    expect(mentionsDistantState('100 Market St, Wilmington, DE')).toBe(false);
  });

  it('ignores state names used as street names', () => {
    expect(mentionsDistantState('indiana avenue')).toBe(false);
    expect(mentionsDistantState('2100 Indiana Ave, Philadelphia')).toBe(false);
    expect(mentionsDistantState('washington ave')).toBe(false);
    expect(mentionsDistantState('wawa in')).toBe(false);
    expect(mentionsDistantState('california')).toBe(false);
  });
});

describe('metro bounds strings', () => {
  it('uses each provider\u2019s coordinate order', () => {
    expect(METRO_BBOX).toBe('-75.55,39.7,-74.7,40.35');      // minLon,minLat,maxLon,maxLat
    expect(METRO_VIEWBOX).toBe('-75.55,40.35,-74.7,39.7');   // left,top,right,bottom
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
