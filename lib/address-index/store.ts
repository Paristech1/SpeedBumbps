/**
 * Server-only loader for the City address index in data/address-index/
 * (not public/: the geocode function reads it from disk, and next.config.ts
 * traces it into the function bundle). Files load lazily and stay cached per
 * warm instance. If the index is missing, lookups return nothing and search
 * falls back to Photon/Nominatim.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { LatLng } from '@/types/speedbumps';
import type { IndexHit } from '@/lib/search-results';
import { INDEX_VERSION } from './keys.mjs';
import { buildStreetIndex, searchAddressIndex, type Shard, type StreetIndex, type StreetsFile } from './match';
import type { ParsedQuery } from './parse';

const DEFAULT_DIR = path.join(process.cwd(), 'data', 'address-index');
const SHARD_CACHE_MAX = 40;

export interface AddressIndexStore {
  getStreets(): Promise<StreetIndex | null>;
  getShard(bucket: string): Promise<Shard | null>;
}

export function createAddressIndexStore(dir = DEFAULT_DIR): AddressIndexStore {
  let streets: Promise<StreetIndex | null> | null = null;
  // LRU: Map keeps insertion order; re-inserting on hit moves a bucket to the back
  const shards = new Map<string, Promise<Shard | null>>();
  let warned = false;

  async function readJson<T>(file: string): Promise<T | null> {
    try {
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

/** City-index hits for a query; never throws (errors fall back to Photon/Nominatim). */
export async function searchCityIndex(parsed: ParsedQuery, near: LatLng, store = cityIndex): Promise<IndexHit[]> {
  if (parsed.kind === 'other') return [];
  try {
    const streets = await store.getStreets();
    if (!streets) return [];
    return await searchAddressIndex(parsed, streets, store.getShard, near);
  } catch (err) {
    console.warn('[address-index] lookup failed:', err);
    return [];
  }
}
