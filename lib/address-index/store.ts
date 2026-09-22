/**
 * Server-only loader for the City address index in data/address-index/
 * (not public/: the geocode function reads it from disk, and next.config.ts
 * traces it into the function bundle). Files load lazily and stay cached per
 * warm instance. If the index is missing, lookups return nothing and search
 * falls back to Photon/Nominatim.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LatLng } from '@/types/speedbumps';
import type { IndexHit } from '@/lib/search-results';
import { INDEX_VERSION } from './keys.mjs';
import {
  buildStreetIndex,
  isStreetPair,
  searchAddressIndex,
  type IntersectionPairs,
  type IntersectionsFile,
  type Shard,
  type StreetIndex,
  type StreetsFile,
} from './match';
import type { ParsedQuery } from './parse';

/**
 * Where the index might sit. Hosts don't agree on the working directory of a
 * function: Vercel runs from the app root, a Lambda-style bundle (Netlify)
 * may run from its task root. An explicit ADDRESS_INDEX_DIR wins.
 */
function candidateDirs(): string[] {
  const rel = path.join('data', 'address-index');
  return [
    process.env.ADDRESS_INDEX_DIR,
    path.join(process.cwd(), rel),
    process.env.LAMBDA_TASK_ROOT && path.join(process.env.LAMBDA_TASK_ROOT, rel),
  ].filter((d): d is string => !!d);
}

/** First candidate that actually holds the index; the cwd one when none does, so the warning names it. */
function resolveIndexDir(): string {
  const dirs = candidateDirs();
  return dirs.find((d) => existsSync(path.join(d, 'streets.json'))) ?? path.join(process.cwd(), 'data', 'address-index');
}
const SHARD_CACHE_MAX = 40;

export interface AddressIndexStore {
  getStreets(): Promise<StreetIndex | null>;
  getShard(bucket: string): Promise<Shard | null>;
  getIntersections(): Promise<IntersectionPairs | null>;
}

export function createAddressIndexStore(explicitDir?: string): AddressIndexStore {
  let dir = explicitDir;
  let streets: Promise<StreetIndex | null> | null = null;
  let intersections: Promise<IntersectionPairs | null> | null = null;
  // LRU: Map keeps insertion order; re-inserting on hit moves a bucket to the back
  const shards = new Map<string, Promise<Shard | null>>();
  let warned = false;

  async function readJson<T>(file: string): Promise<T | null> {
    try {
      dir ??= resolveIndexDir();
      return JSON.parse(await readFile(path.join(dir, file), 'utf8')) as T;
    } catch (err) {
      if (!warned) {
        warned = true;
        console.warn(`[address-index] ${file} unavailable, using Photon/Nominatim only:`, (err as Error).message);
      }
      return null;
    }
  }

  return {
    getStreets() {
      streets ??= readJson<StreetsFile>('streets.json').then((file) => {
        if (!file) return null;
        if (file.version !== INDEX_VERSION) {
          console.warn(`[address-index] streets.json is version ${file.version}, expected ${INDEX_VERSION}; ignoring it`);
          return null;
        }
        return buildStreetIndex(file);
      });
      return streets;
    },

    getIntersections() {
      intersections ??= readJson<IntersectionsFile>('intersections.json').then((file) => {
        if (!file) return null;
        if (file.version !== INDEX_VERSION) {
          console.warn(`[address-index] intersections.json is version ${file.version}, expected ${INDEX_VERSION}; ignoring it`);
          return null;
        }
        return file.pairs;
      });
      return intersections;
    },

    getShard(bucket) {
      if (!/^[A-Z0-9_]{2}$/.test(bucket)) return Promise.resolve(null);
      let shard = shards.get(bucket);
      if (shard) {
        shards.delete(bucket);
      } else {
        shard = readJson<Shard>(path.join('shards', `${bucket}.json`));
      }
      shards.set(bucket, shard);
      while (shards.size > SHARD_CACHE_MAX) {
        const oldest = shards.keys().next().value;
        if (oldest === undefined) break;
        shards.delete(oldest);
      }
      return shard;
    },
  };
}

const cityIndex = createAddressIndexStore();

/**
 * Whether this instance can read the index — behind /api/geocode?status, so a
 * deploy can be checked from a phone instead of inferred from bad results.
 */
export async function cityIndexStatus(store = cityIndex): Promise<{ loaded: boolean; streets: number }> {
  try {
    const streets = await store.getStreets();
    return { loaded: !!streets, streets: streets?.streets.length ?? 0 };
  } catch {
    return { loaded: false, streets: 0 };
  }
}

/** City-index hits for a query; never throws (errors fall back to Photon/Nominatim). */
export async function searchCityIndex(parsed: ParsedQuery, near: LatLng, store = cityIndex): Promise<IndexHit[]> {
  if (parsed.kind === 'other') return [];
  try {
    const streets = await store.getStreets();
    if (!streets) return [];
    const intersections = parsed.kind === 'intersection' ? await store.getIntersections() : null;
    return await searchAddressIndex(parsed, { streets, loadShard: store.getShard, intersections }, near);
  } catch (err) {
    console.warn('[address-index] lookup failed:', err);
    return [];
  }
}

/** "x & y" where both sides are Philly streets. False if the index is unavailable. */
export async function isCityStreetPair(parsed: ParsedQuery, near: LatLng, store = cityIndex): Promise<boolean> {
  if (parsed.kind !== 'intersection') return false;
  try {
    const streets = await store.getStreets();
    return !!streets && isStreetPair(parsed, streets, near);
  } catch {
    return false;
  }
}
