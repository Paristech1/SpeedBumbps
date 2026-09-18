import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { buildIntersections, fromXY, prepareSegment } from '@/lib/address-index/centerline.mjs';
import { parseQuery } from '@/lib/address-index/parse';
import { createAddressIndexStore, searchCityIndex } from '@/lib/address-index/store';
import type { LatLng } from '@/types/speedbumps';

const store = createAddressIndexStore(fileURLToPath(new URL('./fixtures/address-index', import.meta.url)));
const PHILLY_CENTER: LatLng = { lat: 39.9526, lng: -75.1652 };
const search = (query: string, near: LatLng = PHILLY_CENTER) => searchCityIndex(parseQuery(query), near, store);

describe('intersection parsing (T5)', () => {
  it('accepts &, and, at, @ and /', () => {
    const expected = { kind: 'intersection', a: ['16TH'], b: ['BIGLER'] };
    for (const query of ['16th & bigler', '16th and bigler', '16th at bigler', '16th @ bigler', '16th/bigler', '16th&bigler']) {
      expect(parseQuery(query), query).toMatchObject(expected);
    }
    expect(parseQuery('s 16th st at bigler st')).toMatchObject({ kind: 'intersection', a: ['S', '16TH', 'ST'], b: ['BIGLER', 'ST'] });
  });

  it('keeps each side as typed for upstream queries', () => {
    expect(parseQuery('S 16th & Bigler')).toMatchObject({ text: ['S 16th', 'Bigler'] });
  });
});

describe('intersection lookup', () => {
  it('T6: finds the corner from the topology table, exact and top tier', async () => {
    for (const query of ['16th & bigler', '16th and bigler', 'S 16th & Bigler', 's 16th st at bigler st']) {
      const hits = await search(query);
      expect(hits, query).toHaveLength(1);
      expect(hits[0].tier).toBe(1);
      expect(hits[0].result).toEqual({
        shortName: 'S 16th St & Bigler St',
        displayName: 'Philadelphia, PA',
        location: { lat: 39.91462, lng: -75.1748 },
        kind: 'street',
        approximate: false,
      });
    }
  });

  it('respects a typed direction', async () => {
    expect(await search('n 16th & bigler')).toEqual([]);
  });

  it('T7: streets that meet twice give both corners, nearest first', async () => {
    const north = await search('crescent and park', { lat: 40.06, lng: -75.2 });
    expect(north.map((h) => h.result.location.lat)).toEqual([40.0527, 40.05]);
    const south = await search('crescent and park', { lat: 40.04, lng: -75.2 });
    expect(south.map((h) => h.result.location.lat)).toEqual([40.05, 40.0527]);
  });

  it('merges the same corner reached from N and S sides of a street', async () => {
    const hits = await search('5th and market');
    expect(hits).toHaveLength(1);
    expect(hits[0].result.shortName).toMatch(/5th St & Market St$/);
  });

  it('returns nothing for streets that never meet or do not exist', async () => {
    expect(await search('market and girard')).toEqual([]);
    expect(await search('zzqx & qqzx')).toEqual([]);
  });

  it('returns nothing when intersections.json is missing', async () => {
    const empty = createAddressIndexStore(fileURLToPath(new URL('./fixtures/no-such-index', import.meta.url)));
    expect(await searchCityIndex(parseQuery('16th & bigler'), PHILLY_CENTER, empty)).toEqual([]);
  });
});

describe('buildIntersections', () => {
  const seg = (key: [string, string, string], fnode: number, tnode: number, points: [number, number][]) => {
    const coords = points.map((p) => {
      const { lat, lng } = fromXY(p);
      return [lng, lat];
    });
    return prepareSegment({ pre_dir: key[0], st_name: key[1], st_type: key[2], fnode_: fnode, tnode_: tnode }, coords)!;
  };

  it('pairs streets that share a node, once per corner', () => {
    const segments = [
      seg([' ', 'BIGLER', 'ST'], 1, 2, [[0, 0], [100, 0]]),
      seg([' ', 'BIGLER', 'ST'], 2, 3, [[100, 0], [200, 0]]),
      seg(['S', '16TH', 'ST'], 4, 2, [[100, -100], [100, 0]]),
      seg(['S', '16TH', 'ST'], 2, 5, [[100, 0], [100, 100]]),
      // A divided road's second carriageway meets Bigler 20 m away: same corner
      seg(['S', '16TH', 'ST'], 6, 7, [[120, -100], [120, 0]]),
      seg([' ', 'BIGLER', 'ST'], 7, 8, [[120, 0], [140, 0]]),
    ];
    const pairs = buildIntersections(segments, (s) => s.key);
    expect(Object.keys(pairs)).toEqual(['BIGLER_ST|S_16TH_ST']);
    expect(pairs['BIGLER_ST|S_16TH_ST']).toHaveLength(1);
  });

  it('keeps separate corners apart and skips filtered streets', () => {
    const segments = [
      seg([' ', 'CRESCENT', 'DR'], 1, 2, [[0, 0], [0, 300]]),
      seg([' ', 'PARK', 'LN'], 1, 9, [[0, 0], [-50, 150]]),
      seg([' ', 'PARK', 'LN'], 9, 2, [[-50, 150], [0, 300]]),
      seg(['NB', 'I-95', 'RAMP'], 2, 10, [[0, 300], [0, 400]]),
    ];
    const pairs = buildIntersections(segments, (s) => (s.key.includes('RAMP') ? null : s.key));
    expect(Object.keys(pairs)).toEqual(['CRESCENT_DR|PARK_LN']);
    expect(pairs['CRESCENT_DR|PARK_LN']).toHaveLength(2);
  });
});
