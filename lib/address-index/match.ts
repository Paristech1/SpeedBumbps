/**
 * Match parsed queries against the City address index. Pure: the street
 * dictionary and a shard loader are passed in, so tests run on fixtures and
 * the route (via store.ts) runs on data/address-index/.
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
  return { streets, byKey: new Map(streets.map((s) => [s.key, s])) };
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
/** Address points on two streets this close means they cross (or meet) here. */
const INTERSECTION_MAX_GAP_M = 60;
/** Grid cell (degrees) — bigger than the max gap in both axes at Philly's latitude. */
const GRID_CELL_DEG = 0.0008;
const DUPLICATE_POINT_M = 75;

/** Closest pair of address points between two streets (grid-bucketed, not O(n·m)). */
export function closestPoints(a: HouseRow[], b: HouseRow[]): { a: HouseRow; b: HouseRow; meters: number } | null {
  const cell = (lat: number, lng: number) => [Math.floor(lat / GRID_CELL_DEG), Math.floor(lng / GRID_CELL_DEG)];
  const grid = new Map<string, HouseRow[]>();
  for (const row of b) {
    const [y, x] = cell(row[2], row[3]);
    const k = `${y},${x}`;
    const list = grid.get(k);
    if (list) list.push(row);
    else grid.set(k, [row]);
  }

  let best: { a: HouseRow; b: HouseRow; meters: number } | null = null;
  for (const rowA of a) {
    const [y, x] = cell(rowA[2], rowA[3]);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const rowB of grid.get(`${y + dy},${x + dx}`) ?? []) {
          const meters = haversineDistance({ lat: rowA[2], lng: rowA[3] }, { lat: rowB[2], lng: rowB[3] });
          if (!best || meters < best.meters) best = { a: rowA, b: rowB, meters };
        }
      }
    }
  }
  return best;
}

async function searchIntersection(
  parsed: Extract<ParsedQuery, { kind: 'intersection' }>,
  index: StreetIndex,
  loadShard: ShardLoader,
  near: LatLng,
): Promise<IndexHit[]> {
  const sideA = rankStreets(index, parsed.a, false, near).slice(0, INTERSECTION_SIDE_STREETS);
  if (sideA.length === 0) return [];
  const sideB = rankStreets(index, parsed.b, parsed.lastTokenPartial, near).slice(0, INTERSECTION_SIDE_STREETS);

  const rowsFor = async (street: IndexedStreet) => (await loadShard(street.bucket))?.[street.key] ?? [];
  const hits: IndexHit[] = [];
  for (const { street: streetA } of sideA) {
    for (const { street: streetB } of sideB) {
      if (streetA.key === streetB.key) continue;
      const pair = closestPoints(await rowsFor(streetA), await rowsFor(streetB));
      if (!pair || pair.meters > INTERSECTION_MAX_GAP_M) continue;
      const location = { lat: (pair.a[2] + pair.b[2]) / 2, lng: (pair.a[3] + pair.b[3]) / 2 };
      // N 5th & Market and S 5th & Market are the same corner
      if (hits.some((h) => haversineDistance(h.result.location, location) < DUPLICATE_POINT_M)) continue;
      const shortName = `${streetA.display} & ${streetB.display}`;
      hits.push({
        tier: 3,
        result: { shortName, displayName: 'Philadelphia, PA', location, kind: 'street', approximate: true },
      });
    }
  }
  return hits.slice(0, MAX_INDEX_HITS);
}

// ---------------------------------------------------------------------------

/**
 * City-index results for a parsed query, best first. Empty for non-address
 * queries or when nothing matches — Photon/Nominatim cover those.
 */
export async function searchAddressIndex(
  parsed: ParsedQuery,
  index: StreetIndex,
  loadShard: ShardLoader,
  near: LatLng,
): Promise<IndexHit[]> {
  if (parsed.kind === 'address') return searchAddress(parsed, index, loadShard, near);
  if (parsed.kind === 'intersection') return searchIntersection(parsed, index, loadShard, near);
  return [];
}
