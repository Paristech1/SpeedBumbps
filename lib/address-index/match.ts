/**
 * Match parsed queries against the City address index. Pure: the street
 * dictionary, a shard loader and the intersection table are passed in, so
 * tests run on fixtures and the route (via store.ts) runs on data/address-index/.
 */

import type { GeocodingResult, LatLng } from '@/types/speedbumps';
import type { IndexHit } from '@/lib/search-results';
import { haversineDistance } from '@/lib/geo-utils';
import { bucketKey, formatHouse } from './keys.mjs';
import { PREDIRS, canonicalToken, partialTokenMatches, tokenMatches } from './normalize';
import type { ParsedQuery } from './parse';

// --- File formats (written by scripts/build-address-index.mjs) -------------

/** key, display, predir, name, type, minHouse, maxHouse, count, lat, lng, zips */
export type StreetTuple = [
  string, string, string, string, string, number, number, number, number, number, string[],
];

export interface StreetsFile {
  version: number;
  builtAt: string;
  source: string;
  streets: StreetTuple[];
}

/** house, suffix, lat, lng, index into the street's zips (-1 = unknown) */
export type HouseRow = [number, string, number, number, number];

/** Street key → rows sorted by house, then suffix. */
export type Shard = Record<string, HouseRow[]>;

export type ShardLoader = (bucket: string) => Shard | null | Promise<Shard | null>;

/** Sorted "KEYA|KEYB" → where the two streets meet ([lat, lng], one per corner). */
export type IntersectionPairs = Record<string, [number, number][]>;

export interface IntersectionsFile {
  version: number;
  pairs: IntersectionPairs;
}

/** Loaded index data a search runs against. */
export interface IndexData {
  streets: StreetIndex;
  loadShard: ShardLoader;
  /** Only needed for intersection queries; null when the file is missing. */
  intersections?: IntersectionPairs | null;
}

// --- In-memory index -------------------------------------------------------

export interface IndexedStreet {
  key: string;
  display: string;
  predir: string;
  name: string;
  type: string;
  minHouse: number;
  maxHouse: number;
  count: number;
  centroid: LatLng;
  zips: string[];
  bucket: string;
  /** Searchable token arrays: with predir (N FRANKLIN ST) and without (FRANKLIN ST). */
  sequences: { tokens: string[]; nameEnd: number }[];
}

export interface StreetIndex {
  streets: IndexedStreet[];
  byKey: Map<string, IndexedStreet>;
  /** "NAME|TYPE" → every direction of that street (N 16th St, S 16th St). */
  byNameType: Map<string, IndexedStreet[]>;
}

export function buildStreetIndex(file: StreetsFile): StreetIndex {
  const streets = file.streets.map(([key, display, predir, name, type, minHouse, maxHouse, count, lat, lng, zips]) => {
    const nameTokens = name.split(' ');
    const tail = type ? [...nameTokens, type] : nameTokens;
    const sequences = [{ tokens: tail, nameEnd: nameTokens.length }];
    if (predir) sequences.unshift({ tokens: [predir, ...tail], nameEnd: nameTokens.length + 1 });
    return {
      key, display, predir, name, type, minHouse, maxHouse, count, zips,
      centroid: { lat, lng },
      bucket: bucketKey(name),
      sequences,
    };
  });
  const byNameType = new Map<string, IndexedStreet[]>();
  for (const street of streets) {
    const key = `${street.name}|${street.type}`;
    byNameType.set(key, [...(byNameType.get(key) ?? []), street]);
  }
  return { streets, byKey: new Map(streets.map((s) => [s.key, s])), byNameType };
}

// --- Street matching -------------------------------------------------------

const EXACT = 2;
const PREFIX = 1;

/**
 * 2 = the typed words name the whole street (type optional, predir optional),
 * 1 = the typed words start it ("n fr" → N Franklin St, "franklin" → Franklin Mills Blvd),
 * 0 = no match. A finished street ("south st", "…st, philadelphia") must be
 * exact, so "south st" doesn't pick S St Bernard St.
 */
export function streetMatchScore(street: IndexedStreet, typed: string[], lastPartial: boolean): number {
  let best = 0;
  for (const { tokens, nameEnd } of street.sequences) {
    if (typed.length > tokens.length) continue;
    let exact = typed.length >= nameEnd;
    const last = typed.length - 1;
    const matches = typed.every((word, i) => {
      if (tokenMatches(word, tokens[i])) return true;
      if (i !== last || !lastPartial) return false;
      // A finished word that just wasn't normalised yet ("fifth" → 5TH) is still exact
      if (tokenMatches(canonicalToken(word), tokens[i])) return true;
      if (partialTokenMatches(word, tokens[i])) {
        exact = false;
        return true;
      }
      return false;
    });
    if (matches && (exact || lastPartial)) best = Math.max(best, exact ? EXACT : PREFIX);
  }
  return best;
}

/** Too little typed to pick a street: only a direction ("4521 n") or one letter ("4521 f"). */
function tooVague(typed: string[], lastPartial: boolean): boolean {
  if (typed.every((t) => PREDIRS.has(canonicalToken(t)))) return true;
  const name = PREDIRS.has(typed[0]) ? typed.slice(1) : typed;
  return lastPartial && name.length === 1 && name[0].length < 2 && !/^\d/.test(name[0]);
}

interface Candidate {
  street: IndexedStreet;
  score: number;
  distance: number;
}

/** Streets matching the typed words, best first: exact > prefix, then nearest, then biggest. */
function rankStreets(
  index: StreetIndex,
  typed: string[],
  lastPartial: boolean,
  near: LatLng,
  keep: (street: IndexedStreet) => boolean = () => true,
): Candidate[] {
  if (tooVague(typed, lastPartial)) return [];
  const candidates: Candidate[] = [];
  for (const street of index.streets) {
    if (!keep(street)) continue;
    const score = streetMatchScore(street, typed, lastPartial);
    if (score > 0) candidates.push({ street, score, distance: haversineDistance(near, street.centroid) });
  }
  return candidates.sort((a, b) => b.score - a.score || a.distance - b.distance || b.street.count - a.street.count);
}

// --- House lookup ----------------------------------------------------------

/** Houses up to this far outside a street's known range still select it (new construction). */
const RANGE_SLACK = 50;
/** How far (in house numbers) to look for a stand-in when the exact house is missing. */
const APPROX_WINDOW = 100;
const MAX_CANDIDATE_STREETS = 5;
export const MAX_INDEX_HITS = 5;

function lowerBound(rows: HouseRow[], house: number): number {
  let lo = 0;
  let hi = rows.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (rows[mid][0] < house) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The typed house, or the nearest house on the same side of the street
 * (same parity) within ±100 — flagged approximate.
 */
export function findHouse(
  rows: HouseRow[],
  house: number,
  suffix: string,
): { row: HouseRow; approximate: boolean } | null {
  const start = lowerBound(rows, house);
  let end = start;
  while (end < rows.length && rows[end][0] === house) end++;
  if (end > start) {
    const same = rows.slice(start, end);
    // Rows sort "" before letters, so same[0] is the plain house when it exists
    if (!suffix) return { row: same[0], approximate: false };
    const withSuffix = same.find((r) => r[1] === suffix);
    return withSuffix ? { row: withSuffix, approximate: false } : { row: same[0], approximate: true };
  }

  let below: HouseRow | undefined;
  for (let i = start - 1; i >= 0 && rows[i][0] >= house - APPROX_WINDOW; i--) {
    if ((rows[i][0] - house) % 2 === 0) {
      // Walk back to the plain (no-suffix) row for this house
      while (i > 0 && rows[i - 1][0] === rows[i][0]) i--;
      below = rows[i];
      break;
    }
  }
  let above: HouseRow | undefined;
  for (let i = start; i < rows.length && rows[i][0] <= house + APPROX_WINDOW; i++) {
    if ((rows[i][0] - house) % 2 === 0) {
      above = rows[i];
      break;
    }
  }
  const nearest = !above || (below && house - below[0] <= above[0] - house) ? below : above;
  return nearest ? { row: nearest, approximate: true } : null;
}

function addressResult(
  street: IndexedStreet,
  row: HouseRow,
  approximate: boolean,
  typedHouse: string,
): GeocodingResult {
  // Approximate hits keep the number the user asked for; the pin is the nearest real house
  const houseNumber = approximate ? typedHouse : formatHouse(row[0], row[1]);
  const zip = street.zips[row[4]];
  return {
    shortName: `${houseNumber} ${street.display}`,
    displayName: zip ? `Philadelphia, PA ${zip}` : 'Philadelphia, PA',
    location: { lat: row[2], lng: row[3] },
    kind: 'address',
    houseNumber,
    street: street.display,
    approximate,
  };
}

async function searchAddress(
  parsed: Extract<ParsedQuery, { kind: 'address' }>,
  index: StreetIndex,
  loadShard: ShardLoader,
  near: LatLng,
): Promise<IndexHit[]> {
  const { house, houseSuffix, streetTokens, lastTokenPartial, zip } = parsed;
  // Range filter: "4521 n fr" only keeps N Fr… streets that have a 4500 block
  const candidates = rankStreets(index, streetTokens, lastTokenPartial, near, (street) =>
    house >= street.minHouse - RANGE_SLACK &&
    house <= street.maxHouse + RANGE_SLACK &&
    (!zip || street.zips.includes(zip)),
  ).slice(0, MAX_CANDIDATE_STREETS);

  const typedHouse = formatHouse(house, houseSuffix);
  const hits: (IndexHit & { distance: number })[] = [];
  for (const { street, score } of candidates) {
    const rows = (await loadShard(street.bucket))?.[street.key];
    if (!rows) continue;
    const found = findHouse(rows, house, houseSuffix);
    if (!found) continue;
    const result = addressResult(street, found.row, found.approximate, typedHouse);
    const tier = found.approximate ? 3 : score === EXACT ? 1 : 2;
    hits.push({ result, tier, distance: haversineDistance(near, result.location) });
  }
  return hits
    .sort((a, b) => a.tier - b.tier || a.distance - b.distance)
    .slice(0, MAX_INDEX_HITS)
    .map(({ result, tier }) => ({ result, tier }));
}

// --- Intersections ---------------------------------------------------------

const INTERSECTION_SIDE_STREETS = 3;
const MAX_INTERSECTION_HITS = 3;
/** Corners of the same two streets closer than this are one place. */
const DUPLICATE_POINT_M = 75;

/**
 * Candidate streets for one side of "x & y". Without a typed direction,
 * every direction of a matched street is included ("16th" → N and S 16th St).
 */
function intersectionSide(index: StreetIndex, typed: string[], lastPartial: boolean, near: LatLng): IndexedStreet[] {
  const top = rankStreets(index, typed, lastPartial, near).slice(0, INTERSECTION_SIDE_STREETS).map((c) => c.street);
  if (typed.length > 1 && PREDIRS.has(typed[0])) return top;
  const expanded = new Set(top);
  for (const street of top) {
    for (const variant of index.byNameType.get(`${street.name}|${street.type}`) ?? []) expanded.add(variant);
  }
  return [...expanded];
}

/** Where the typed streets meet, from centerline topology (exact nodes, not guesses). */
function searchIntersection(
  parsed: Extract<ParsedQuery, { kind: 'intersection' }>,
  index: StreetIndex,
  pairs: IntersectionPairs,
  near: LatLng,
): IndexHit[] {
  const sideA = intersectionSide(index, parsed.a, false, near);
  const sideB = sideA.length ? intersectionSide(index, parsed.b, parsed.lastTokenPartial, near) : [];

  const corners: { location: LatLng; shortName: string; distance: number }[] = [];
  for (const a of sideA) {
    for (const b of sideB) {
      if (a.key === b.key) continue;
      const pair = a.key < b.key ? `${a.key}|${b.key}` : `${b.key}|${a.key}`;
      for (const [lat, lng] of pairs[pair] ?? []) {
        const location = { lat, lng };
        corners.push({ location, shortName: `${a.display} & ${b.display}`, distance: haversineDistance(near, location) });
      }
    }
  }

  const hits: IndexHit[] = [];
  for (const corner of corners.sort((x, y) => x.distance - y.distance)) {
    if (hits.some((h) => haversineDistance(h.result.location, corner.location) < DUPLICATE_POINT_M)) continue;
    hits.push({
      tier: 1,
      result: {
        shortName: corner.shortName,
        displayName: 'Philadelphia, PA',
        location: corner.location,
        kind: 'street',
        approximate: false,
      },
    });
    if (hits.length >= MAX_INTERSECTION_HITS) break;
  }
  return hits;
}

// ---------------------------------------------------------------------------

/**
 * City-index results for a parsed query, best first. Empty for non-address
 * queries or when nothing matches — Photon/Nominatim cover those.
 */
export async function searchAddressIndex(parsed: ParsedQuery, data: IndexData, near: LatLng): Promise<IndexHit[]> {
  if (parsed.kind === 'address') return searchAddress(parsed, data.streets, data.loadShard, near);
  if (parsed.kind === 'intersection' && data.intersections) {
    return searchIntersection(parsed, data.streets, data.intersections, near);
  }
  return [];
}
