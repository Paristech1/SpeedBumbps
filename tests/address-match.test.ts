import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { findHouse, type HouseRow } from '@/lib/address-index/match';
import { parseQuery } from '@/lib/address-index/parse';
import { createAddressIndexStore, searchCityIndex } from '@/lib/address-index/store';
import type { LatLng } from '@/types/speedbumps';

const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/address-index', import.meta.url));
const store = createAddressIndexStore(FIXTURE_DIR);
const PHILLY_CENTER: LatLng = { lat: 39.9526, lng: -75.1652 };

async function search(query: string, near: LatLng = PHILLY_CENTER) {
  return searchCityIndex(parseQuery(query), near, store);
}

async function names(query: string, near?: LatLng) {
  return (await search(query, near)).map((h) => h.result.shortName);
}

describe('address index: house numbers', () => {
  it('U1: finds the exact house', async () => {
    const [top] = await search('4521 n franklin st');
    expect(top.tier).toBe(1);
    expect(top.result).toEqual({
      shortName: '4521 N Franklin St',
      displayName: 'Philadelphia, PA 19140',
      location: { lat: 40.01463, lng: -75.1387 },
      kind: 'address',
      houseNumber: '4521',
      street: 'N Franklin St',
      approximate: false,
    });
  });

  it('U2: a half-typed street keeps only streets with that block', async () => {
    const hits = await search('4521 N Fr');
    expect(hits.map((h) => h.result.shortName).sort()).toEqual(['4521 N Franklin St', '4521 N Front St']);
    expect(hits.every((h) => h.tier === 2)).toBe(true);
  });

  it('U3: expands spelled-out direction and type', async () => {
    expect(await search('4521 north franklin street')).toEqual(await search('4521 n franklin st'));
  });

  it('U4: works without direction or type', async () => {
    const [top] = await search('4521 franklin');
    expect(top.result.shortName).toBe('4521 N Franklin St');
    expect(top.tier).toBe(1);
  });

  it('U5: numbered street without direction returns both, nearest first', async () => {
    const nearNorth = { lat: 39.9535, lng: -75.1475 };
    const nearSouth = { lat: 39.9480, lng: -75.1482 };
    expect(await names('123 5th st', nearNorth)).toEqual(['123 N 5th St', '123 S 5th St']);
    expect(await names('123 5th st', nearSouth)).toEqual(['123 S 5th St', '123 N 5th St']);
  });

  it('U6: ordinal words and bare numbers match numbered streets', async () => {
    const expected = await names('123 5th st');
    expect(await names('123 fifth st')).toEqual(expected);
    expect(await names('123 5 st')).toEqual(expected);
    expect(await names('123 fifth street')).toEqual(expected);
  });

  it('U7: AV and AVE resolve to the same street', async () => {
    const [av] = await names('1401 w girard av');
    expect(av).toBe('1401 W Girard Ave');
    expect(await names('1401 w girard ave')).toEqual([av]);
    expect(await names('1401 west girard avenue')).toEqual([av]);
  });

  it('U8: letter suffix picks the matching row', async () => {
    const [rear] = await search('1234r south st');
    expect(rear.result).toMatchObject({ shortName: '1234R South St', houseNumber: '1234R', approximate: false, location: { lat: 39.9435 } });
    const [plain] = await search('1234 south st');
    expect(plain.result).toMatchObject({ shortName: '1234 South St', approximate: false, location: { lat: 39.9437 } });
  });

  it('U9: missing house falls back to the nearest same-side house', async () => {
    const [top] = await search('4523 n franklin st');
    expect(top.tier).toBe(3);
    expect(top.result).toMatchObject({
      shortName: '4523 N Franklin St',
      houseNumber: '4523',
      approximate: true,
      location: { lat: 40.01463, lng: -75.1387 }, // 4521, not even-side 4522
    });
  });

  it('U11: strips unit, city, state and filters by zip', async () => {
    expect(await search('4521 n franklin st apt 2, philadelphia, pa 19140')).toEqual(await search('4521 n franklin st'));
    expect(await search('4521 n franklin st, 19120')).toEqual([]);
  });

  it('U12: ignores house numbers far outside the street range', async () => {
    expect(await search('99999 n franklin st')).toEqual([]);
  });

  it('U13: leaves non-address queries alone', async () => {
    expect(await search('wawa')).toEqual([]);
    expect(await search('trader joes')).toEqual([]);
  });

  it('keeps matching while a street type is half-typed', async () => {
    expect(await names('4521 n franklin stre')).toEqual(['4521 N Franklin St']);
  });

  it('waits for more than a direction or one letter', async () => {
    expect(await search('4521 n')).toEqual([]);
    expect(await search('4521 f')).toEqual([]);
  });

  it('does not match a direction onto a street without one', async () => {
    expect(await names('4502 n frankford ave')).toEqual([]);
    expect(await names('4502 frankford ave')).toEqual(['4502 Frankford Ave']);
  });
});

describe('address index: intersections', () => {
  it('U10: finds where two streets meet', async () => {
    for (const query of ['broad and girard', 'broad & girard', 'N Broad St at W Girard Ave']) {
      const hits = await search(query);
      expect(hits).toHaveLength(1);
      expect(hits[0].tier).toBe(3);
      expect(hits[0].result).toMatchObject({ shortName: 'N Broad St & W Girard Ave', kind: 'street', approximate: true });
      expect(hits[0].result.location.lat).toBeCloseTo(39.9713, 3);
      expect(hits[0].result.location.lng).toBeCloseTo(-75.1594, 3);
    }
  });

  it('returns nothing when the streets never meet', async () => {
    expect(await search('market and girard')).toEqual([]);
  });
});

describe('address index: missing files', () => {
  it('returns nothing instead of throwing', async () => {
    const empty = createAddressIndexStore(fileURLToPath(new URL('./fixtures/no-such-index', import.meta.url)));
    expect(await searchCityIndex(parseQuery('4521 n franklin st'), PHILLY_CENTER, empty)).toEqual([]);
  });
});

describe('findHouse', () => {
  const rows: HouseRow[] = [
    [100, '', 0, 0, 0],
    [102, '', 0, 0, 0],
    [102, 'R', 0, 0, 0],
    [105, '', 0, 0, 0],
    [300, '', 0, 0, 0],
  ];

  it('prefers the plain row when no suffix was typed', () => {
    expect(findHouse(rows, 102, '')).toEqual({ row: [102, '', 0, 0, 0], approximate: false });
  });

  it('marks a missing suffix as approximate', () => {
    expect(findHouse(rows, 100, 'R')).toEqual({ row: [100, '', 0, 0, 0], approximate: true });
  });

  it('only borrows from the same side of the street', () => {
    expect(findHouse(rows, 104, '')).toEqual({ row: [102, '', 0, 0, 0], approximate: true });
    expect(findHouse(rows, 103, '')).toEqual({ row: [105, '', 0, 0, 0], approximate: true });
  });

  it('gives up beyond ±100', () => {
    expect(findHouse(rows, 207, '')).toBeNull();
    expect(findHouse(rows, 205, '')).toEqual({ row: [105, '', 0, 0, 0], approximate: true });
  });
});
