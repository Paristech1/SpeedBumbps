import { describe, it, expect } from 'vitest';
import {
  canonicalToken,
  normalizeStreetTokens,
  ordinal,
  partialTokenMatches,
  tokenMatches,
} from '@/lib/address-index/normalize';
import { parseQuery } from '@/lib/address-index/parse';
import { bucketKey, formatHouse, streetKey } from '@/lib/address-index/keys.mjs';

describe('canonicalToken', () => {
  it('maps predirs and street types to OPA spelling', () => {
    expect(['N', 'NORTH'].map(canonicalToken)).toEqual(['N', 'N']);
    expect(['ST', 'STR', 'STREET'].map(canonicalToken)).toEqual(['ST', 'ST', 'ST']);
    expect(['AV', 'AVE', 'AVENUE'].map(canonicalToken)).toEqual(['AVE', 'AVE', 'AVE']);
    expect(['BLVD', 'BOULEVARD', 'PARKWAY', 'TERRACE', 'MT', 'SAINT'].map(canonicalToken))
      .toEqual(['BLVD', 'BLVD', 'PKWY', 'TER', 'MOUNT', 'ST']);
  });

  it('turns numbers and words into ordinals', () => {
    expect(['5', '5TH', 'FIFTH'].map(canonicalToken)).toEqual(['5TH', '5TH', '5TH']);
    expect(['21', '22', '23', '11', '12', '13', 'TWENTIETH'].map(canonicalToken))
      .toEqual(['21ST', '22ND', '23RD', '11TH', '12TH', '13TH', '20TH']);
    expect(canonicalToken('123')).toBe('123');
  });

  it('leaves names alone', () => {
    expect(canonicalToken('FRANKLIN')).toBe('FRANKLIN');
  });
});

describe('ordinal', () => {
  it('uses the right suffix', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 42, 63, 99].map(ordinal))
      .toEqual(['1ST', '2ND', '3RD', '4TH', '11TH', '12TH', '13TH', '21ST', '42ND', '63RD', '99TH']);
  });
});

describe('normalizeStreetTokens', () => {
  it('canonicalises every word', () => {
    expect(normalizeStreetTokens('north franklin street')).toEqual(['N', 'FRANKLIN', 'ST']);
    expect(normalizeStreetTokens('N. 5th St.')).toEqual(['N', '5TH', 'ST']);
    expect(normalizeStreetTokens('twenty-first st')).toEqual(['21ST', 'ST']);
  });

  it('keeps a partial last word as typed', () => {
    expect(normalizeStreetTokens('n fr', true)).toEqual(['N', 'FR']);
    expect(normalizeStreetTokens('n 5', true)).toEqual(['N', '5']);
  });

  it('expands name aliases to OPA names', () => {
    expect(normalizeStreetTokens('jfk blvd')).toEqual(['JOHN', 'F', 'KENNEDY', 'BLVD']);
    expect(normalizeStreetTokens('kennedy boulevard')).toEqual(['JOHN', 'F', 'KENNEDY', 'BLVD']);
    expect(normalizeStreetTokens('john f kennedy blvd')).toEqual(['JOHN', 'F', 'KENNEDY', 'BLVD']);
    expect(normalizeStreetTokens('mlk dr')).toEqual(['M', 'L', 'KING', 'DR']);
    expect(normalizeStreetTokens('martin luther king jr drive')).toEqual(['M', 'L', 'KING', 'DR']);
    expect(normalizeStreetTokens('s columbus blvd')).toEqual(['S', 'CHRIS', 'COLUMBUS', 'BLVD']);
    expect(normalizeStreetTokens('cecil moore ave')).toEqual(['CECIL', 'B', 'MOORE', 'AVE']);
  });
});

describe('token matching', () => {
  it('matches OPA names that spell a direction out', () => {
    expect(tokenMatches('S', 'SOUTH')).toBe(true);
    expect(tokenMatches('W', 'WEST')).toBe(true);
    expect(tokenMatches('S', 'SPRUCE')).toBe(false);
  });

  it('matches half-typed words', () => {
    expect(partialTokenMatches('FR', 'FRANKLIN')).toBe(true);
    expect(partialTokenMatches('STRE', 'ST')).toBe(true);
    expect(partialTokenMatches('AVEN', 'AVE')).toBe(true);
    expect(partialTokenMatches('FIF', '5TH')).toBe(true);
    expect(partialTokenMatches('5', '5TH')).toBe(true);
    expect(partialTokenMatches('FIFTH', '5TH')).toBe(true);
    expect(partialTokenMatches('NOR', 'N')).toBe(false);
    expect(partialTokenMatches('FRO', 'FRANKLIN')).toBe(false);
  });
});

describe('keys', () => {
  it('builds street keys and buckets', () => {
    expect(streetKey('N', 'FRANKLIN', 'ST')).toBe('N_FRANKLIN_ST');
    expect(streetKey(null, 'MARKET', 'ST')).toBe('MARKET_ST');
    expect(streetKey(null, 'M L KING', 'DR')).toBe('M_L_KING_DR');
    expect(bucketKey('FRANKLIN')).toBe('FR');
    expect(bucketKey('5TH')).toBe('5T');
    expect(bucketKey('M L KING')).toBe('ML');
    expect(bucketKey('X')).toBe('X_');
  });

  it('formats house suffixes', () => {
    expect(formatHouse(1234, '')).toBe('1234');
    expect(formatHouse(1234, 'R')).toBe('1234R');
    expect(formatHouse(256, '2')).toBe('256 1/2');
  });
});

describe('parseQuery', () => {
  it('parses a full address', () => {
    expect(parseQuery('4521 n franklin st')).toEqual({
      kind: 'address', house: 4521, houseSuffix: '', streetTokens: ['N', 'FRANKLIN', 'ST'], lastTokenPartial: false,
    });
    expect(parseQuery('4521 north franklin street')).toEqual(parseQuery('4521 n franklin st'));
  });

  it('marks the last word partial while typing', () => {
    expect(parseQuery('4521 N Fr')).toMatchObject({ streetTokens: ['N', 'FR'], lastTokenPartial: true });
    expect(parseQuery('4521 franklin')).toMatchObject({ streetTokens: ['FRANKLIN'], lastTokenPartial: true });
    expect(parseQuery('4521 franklin ')).toMatchObject({ lastTokenPartial: false });
    expect(parseQuery('4521 n franklin st,')).toMatchObject({ lastTokenPartial: false });
  });

  it('strips units, city, state and keeps the zip', () => {
    const expected = { kind: 'address', house: 4521, streetTokens: ['N', 'FRANKLIN', 'ST'], lastTokenPartial: false, zip: '19140' };
    expect(parseQuery('4521 n franklin st apt 2, philadelphia, pa 19140')).toMatchObject(expected);
    expect(parseQuery('4521 N Franklin St, Philadelphia, PA 19140-1234')).toMatchObject(expected);
    expect(parseQuery('4521 n franklin st philadelphia pa 19140')).toMatchObject(expected);
    expect(parseQuery('4521 n franklin st, phil')).toMatchObject({ kind: 'address', streetTokens: ['N', 'FRANKLIN', 'ST'] });
  });

  it('parses house suffixes and ranges', () => {
    expect(parseQuery('1234r south st')).toMatchObject({ house: 1234, houseSuffix: 'R' });
    expect(parseQuery('256 1/2 s 3rd st')).toMatchObject({ house: 256, houseSuffix: '2', streetTokens: ['S', '3RD', 'ST'] });
    expect(parseQuery('1234-36 n franklin st')).toMatchObject({ house: 1234, houseSuffix: '', streetTokens: ['N', 'FRANKLIN', 'ST'] });
  });

  it('normalises numbered streets', () => {
    const tokens = ['5TH', 'ST'];
    expect(parseQuery('123 5th st')).toMatchObject({ streetTokens: tokens });
    expect(parseQuery('123 fifth st')).toMatchObject({ streetTokens: tokens });
    expect(parseQuery('123 5 st')).toMatchObject({ streetTokens: tokens });
  });

  it('parses intersections', () => {
    const expected = { kind: 'intersection', a: ['BROAD'], b: ['GIRARD'], lastTokenPartial: true };
    expect(parseQuery('broad and girard')).toEqual(expected);
    expect(parseQuery('broad & girard')).toEqual(expected);
    expect(parseQuery('Broad St @ Girard Ave')).toMatchObject({ a: ['BROAD', 'ST'], b: ['GIRARD', 'AVE'], lastTokenPartial: false });
    expect(parseQuery('5th and market')).toMatchObject({ kind: 'intersection', a: ['5TH'], b: ['MARKET'] });
  });

  it('leaves everything else to Photon', () => {
    expect(parseQuery('wawa')).toEqual({ kind: 'other' });
    expect(parseQuery('n franklin st')).toEqual({ kind: 'other' });
    expect(parseQuery('7-eleven')).toEqual({ kind: 'other' });
    expect(parseQuery('19140')).toEqual({ kind: 'other' });
    expect(parseQuery('')).toEqual({ kind: 'other' });
  });

  it('skips addresses outside Philadelphia', () => {
    expect(parseQuery('8 Haddon Ave, Haddonfield NJ')).toEqual({ kind: 'other' });
    expect(parseQuery('123 E Main St, Norristown, PA')).toEqual({ kind: 'other' });
  });
});
