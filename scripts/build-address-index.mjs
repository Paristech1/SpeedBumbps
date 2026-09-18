#!/usr/bin/env node
/**
 * Build the Philadelphia address index from the City's OPA property data.
 *
 * OpenStreetMap is missing many Philly house numbers, so Photon/Nominatim
 * can't find every real address. OPA (opa_properties_public, one row per
 * parcel) has every one of them. This script pages through it via the Carto
 * SQL API and writes a static index the /api/geocode route matches against:
 *
 *   data/address-index/streets.json       street dictionary
 *   data/address-index/shards/{FR}.json   house points, bucketed by the
 *                                         first two characters of the street name
 *   data/address-index/intersections.json street pairs → where they meet
 *
 * House points are street-front points: each parcel centroid is moved onto
 * its own street's centerline (City Street_Centerline, joined on street
 * code), clear of the corners, so routes start and end on the right street.
 * Intersections come from centerline topology (streets sharing a node).
 *
 * Rules:
 * - PRIVACY: select only address + coordinate columns. Never owner, mailing,
 *   sale or valuation fields.
 * - Retry each page up to 3x; any page that still fails aborts the run, and
 *   so does a suspiciously small result or poor centerline coverage (> 2% of
 *   streets unmatched, > 3% of houses unsnapped). A partial index is never written.
 * - Output is deterministic (sorted, one row per line) so monthly diffs stay
 *   small; if nothing changed, the files (and builtAt) are left untouched.
 *
 * Usage: node scripts/build-address-index.mjs (also runs monthly via GitHub Actions)
 */

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { INDEX_VERSION, PHILLY_BBOX, bucketKey, streetKey } from '../lib/address-index/keys.mjs';
import { buildIntersections, prepareSegment, snapHouse } from '../lib/address-index/centerline.mjs';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'address-index');
const TMP_DIR = `${OUT_DIR}.tmp`;
const CARTO_SQL_URL = 'https://phl.carto.com/api/v2/sql';
const SOURCE_TABLE = 'opa_properties_public';
const PAGE_SIZE = 50000;
const PAGE_DELAY_MS = 1000;
const MAX_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 120000;
// OPA has ~547k unique addresses; far fewer means Carto returned partial data
const MIN_UNIQUE_ADDRESSES = 400000;

const CENTERLINE_URL = 'https://services.arcgis.com/fLeGjb7u4uXqeF9q/arcgis/rest/services/Street_Centerline/FeatureServer/0/query';
// Whole-layer GeoJSON export, used if paging the FeatureServer fails
const CENTERLINE_FALLBACK_URL = 'https://hub.arcgis.com/api/v3/datasets/c36d828494cd44b5bd8b038be696c839_0/downloads/data?format=geojson&spatialRefId=4326&where=1%3D1';
const CENTERLINE_FIELDS = 'seg_id,fnode_,tnode_,pre_dir,st_name,st_type,suf_dir,st_code,l_f_add,l_t_add,r_f_add,r_t_add,class';
const CENTERLINE_PAGE_SIZE = 2000; // the layer's maxRecordCount
const CENTERLINE_PAGE_DELAY_MS = 500;
// ~41k segments; far fewer means a partial download
const MIN_CENTERLINE_SEGMENTS = 35000;
const MAX_UNMATCHED_STREET_SHARE = 0.02;
const MAX_UNSNAPPED_SHARE = 0.03;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round5 = (x) => Math.round(x * 1e5) / 1e5;

function pageSql(lastId) {
  // Address + coordinate columns only (see PRIVACY above)
  return `SELECT cartodb_id, house_number, suffix, street_direction, street_name, street_designation, street_code, zip_code,
       ST_Y(the_geom) AS lat, ST_X(the_geom) AS lng
FROM ${SOURCE_TABLE}
WHERE the_geom IS NOT NULL AND house_number IS NOT NULL AND street_name IS NOT NULL
  AND cartodb_id > ${lastId}
ORDER BY cartodb_id
LIMIT ${PAGE_SIZE}`;
}

async function fetchJson(url, label) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'speedbumps-address-index/1.0' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(typeof json.error === 'string' ? json.error : JSON.stringify(json.error));
      return json;
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw new Error(`${label} failed ${MAX_ATTEMPTS} times: ${err.message}`);
      const backoff = 2000 * 2 ** (attempt - 1);
      console.warn(`${label} failed (${err.message}); retrying in ${backoff / 1000}s…`);
      await sleep(backoff);
    }
  }
}

async function fetchPage(lastId) {
  const url = new URL(CARTO_SQL_URL);
  url.searchParams.set('q', pageSql(lastId));
  url.searchParams.set('format', 'json');
  const json = await fetchJson(url, `OPA page after cartodb_id ${lastId}`);
  if (!Array.isArray(json.rows)) throw new Error('OPA response has no rows array');
  return json.rows;
}

/** All centerline features (GeoJSON), paged; falls back to the whole-layer export. */
async function fetchCenterlines() {
  const features = [];
  try {
    for (let offset = 0; ; offset += CENTERLINE_PAGE_SIZE) {
      const url = new URL(CENTERLINE_URL);
      url.searchParams.set('where', '1=1');
      url.searchParams.set('outFields', CENTERLINE_FIELDS);
      url.searchParams.set('outSR', '4326');
      url.searchParams.set('f', 'geojson');
      url.searchParams.set('orderByFields', 'objectid');
      url.searchParams.set('resultOffset', String(offset));
      url.searchParams.set('resultRecordCount', String(CENTERLINE_PAGE_SIZE));
      const page = await fetchJson(url, `Centerline page at offset ${offset}`);
      if (!Array.isArray(page.features)) throw new Error('centerline response has no features array');
      features.push(...page.features);
      if (page.features.length < CENTERLINE_PAGE_SIZE) break;
      await sleep(CENTERLINE_PAGE_DELAY_MS);
    }
    console.log(`Centerlines: ${features.length} segments (paged)`);
    return features;
  } catch (err) {
    console.warn(`Centerline paging failed (${err.message}); downloading the full export instead…`);
    const json = await fetchJson(new URL(CENTERLINE_FALLBACK_URL), 'Centerline export');
    if (!Array.isArray(json.features)) throw new Error('centerline export has no features array');
    console.log(`Centerlines: ${json.features.length} segments (export)`);
    return json.features;
  }
}

const clean = (value) => (value == null ? '' : String(value).trim().toUpperCase().replace(/\s+/g, ' '));

/** "N FRANKLIN ST" → "N Franklin St", "S 5TH ST" → "S 5th St", "MCKEAN" → "McKean" */
function titleCase(text) {
  return text
    .split(' ')
    .map((word) => {
      const title = word.charAt(0) + word.slice(1).toLowerCase();
      return /^MC[A-Z]/.test(word) ? `Mc${word.charAt(2)}${word.slice(3).toLowerCase()}` : title;
    })
    .join(' ');
}

// ---------------------------------------------------------------------------
// 1. Download
// ---------------------------------------------------------------------------

const addresses = new Map(); // dedupe key → accumulated point
const designations = new Map();
const skipped = { badHouse: 0, outsideCity: 0 };
let rowsRead = 0;
let lastId = 0;

for (let page = 1; ; page++) {
  const rows = await fetchPage(lastId);
  rowsRead += rows.length;
  console.log(`Page ${page}: ${rows.length} rows (total ${rowsRead})`);

  for (const row of rows) {
    lastId = Math.max(lastId, row.cartodb_id);
    const type = clean(row.street_designation);
    designations.set(type || '(none)', (designations.get(type || '(none)') ?? 0) + 1);

    // Defensive: OPA keeps the letter in `suffix`, but accept "1234R" too
    const houseMatch = clean(row.house_number).match(/^(\d+)([A-Z])?$/);
    const house = houseMatch ? Number(houseMatch[1]) : 0;
    const name = clean(row.street_name);
    if (!house || !name) {
      skipped.badHouse++;
      continue;
    }
    const { lat, lng } = row;
    if (
      typeof lat !== 'number' || typeof lng !== 'number' ||
      lat < PHILLY_BBOX.minLat || lat > PHILLY_BBOX.maxLat || lng < PHILLY_BBOX.minLng || lng > PHILLY_BBOX.maxLng
    ) {
      skipped.outsideCity++;
      continue;
    }

    const suffix = clean(row.suffix) || houseMatch[2] || '';
    const predir = clean(row.street_direction);
    const zip = clean(row.zip_code).slice(0, 5);
    const code = Number(row.street_code) || null;
    // Condos repeat the same address once per unit
    const key = `${house}|${suffix}|${predir}|${name}|${type}`;
    const existing = addresses.get(key);
    if (existing) {
      existing.latSum += lat;
      existing.lngSum += lng;
      existing.n++;
      if (zip && (!existing.zip || zip < existing.zip)) existing.zip = zip;
      existing.code ??= code;
    } else {
      addresses.set(key, { house, suffix, predir, name, type, zip, code, latSum: lat, lngSum: lng, n: 1 });
    }
  }

  if (rows.length < PAGE_SIZE) break;
  await sleep(PAGE_DELAY_MS);
}

const rowsKept = rowsRead - skipped.badHouse - skipped.outsideCity;
if (addresses.size < MIN_UNIQUE_ADDRESSES) {
  throw new Error(`Only ${addresses.size} unique addresses (expected ≥ ${MIN_UNIQUE_ADDRESSES}); not writing a partial index`);
}

// ---------------------------------------------------------------------------
// 2. Street-front points (snap parcels onto their own street's centerline)
// ---------------------------------------------------------------------------

const segments = [];
for (const feature of await fetchCenterlines()) {
  const geometry = feature.geometry;
  const coords = geometry?.type === 'LineString'
    ? geometry.coordinates
    : geometry?.type === 'MultiLineString' ? geometry.coordinates.flat() : null;
  const segment = coords && prepareSegment(feature.properties ?? {}, coords);
  if (segment) segments.push(segment);
}
if (segments.length < MIN_CENTERLINE_SEGMENTS) {
  throw new Error(`Only ${segments.length} centerline segments (expected ≥ ${MIN_CENTERLINE_SEGMENTS}); not writing a partial index`);
}

const groupBy = (items, keyOf) => {
  const groups = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (key == null) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
};
const segmentsByCode = groupBy(segments, (s) => s.stCode);
const segmentsByName = groupBy(segments, (s) => s.key);

// OPA street code → OPA street key (the most common one), so intersections use search keys
const codeCounts = new Map();
for (const a of addresses.values()) {
  if (!a.code) continue;
  const key = streetKey(a.predir, a.name, a.type);
  const counts = codeCounts.get(a.code) ?? new Map();
  counts.set(key, (counts.get(key) ?? 0) + 1);
  codeCounts.set(a.code, counts);
}
const codeToKey = new Map([...codeCounts].map(([code, counts]) => [code, [...counts].sort((x, y) => y[1] - x[1])[0][0]]));

const unmatchedCodes = [...codeToKey.keys()].filter((code) => !segmentsByCode.has(code));
const unsnappedByStreet = new Map();
let unsnapped = 0;
for (const a of addresses.values()) {
  const key = streetKey(a.predir, a.name, a.type);
  const lat = a.latSum / a.n;
  const lng = a.lngSum / a.n;
  const front = snapHouse(segmentsByCode.get(a.code) ?? [], segmentsByName.get(key) ?? [], a.house, lat, lng);
  if (front) {
    a.lat = front.lat;
    a.lng = front.lng;
  } else {
    // Keep the parcel point; the router will still find a nearby road
    a.lat = round5(lat);
    a.lng = round5(lng);
    unsnapped++;
    unsnappedByStreet.set(key, (unsnappedByStreet.get(key) ?? 0) + 1);
  }
}

const unmatchedShare = unmatchedCodes.length / Math.max(codeToKey.size, 1);
const unsnappedShare = unsnapped / addresses.size;
const pct = (x) => `${(x * 100).toFixed(2)}%`;
console.log(`Street codes without a centerline: ${unmatchedCodes.length}/${codeToKey.size} (${pct(unmatchedShare)})`);
console.log(`Houses not snapped: ${unsnapped}/${addresses.size} (${pct(unsnappedShare)})`);
console.log(`  most unsnapped: ${[...unsnappedByStreet].sort((x, y) => y[1] - x[1]).slice(0, 20).map(([k, n]) => `${k}=${n}`).join(' ')}`);
if (unmatchedCodes.length > 0) {
  console.log(`  unmatched street codes: ${unmatchedCodes.slice(0, 20).map((code) => `${codeToKey.get(code)}(${code})`).join(' ')}`);
}
if (unmatchedShare > MAX_UNMATCHED_STREET_SHARE) {
  throw new Error(`${pct(unmatchedShare)} of OPA streets have no centerline (max ${pct(MAX_UNMATCHED_STREET_SHARE)})`);
}
if (unsnappedShare > MAX_UNSNAPPED_SHARE) {
  throw new Error(`${pct(unsnappedShare)} of houses couldn't be snapped to their street (max ${pct(MAX_UNSNAPPED_SHARE)})`);
}

// ---------------------------------------------------------------------------
// 3. Group by street
// ---------------------------------------------------------------------------

const streets = new Map();
for (const a of addresses.values()) {
  const key = streetKey(a.predir, a.name, a.type);
  let street = streets.get(key);
  if (!street) {
    street = { key, predir: a.predir, name: a.name, type: a.type, points: [] };
    streets.set(key, street);
  }
  street.points.push({ house: a.house, suffix: a.suffix, zip: a.zip, lat: a.lat, lng: a.lng });
}

const streetTuples = [];
const buckets = new Map(); // bucket → [key, rows][]
for (const street of [...streets.values()].sort((a, b) => (a.key < b.key ? -1 : 1))) {
  const points = street.points.sort((a, b) => a.house - b.house || (a.suffix < b.suffix ? -1 : a.suffix > b.suffix ? 1 : 0));
  const zips = [...new Set(points.map((p) => p.zip).filter(Boolean))].sort();
  const zipIndex = new Map(zips.map((zip, i) => [zip, i]));
  const centroidLat = round5(points.reduce((sum, p) => sum + p.lat, 0) / points.length);
  const centroidLng = round5(points.reduce((sum, p) => sum + p.lng, 0) / points.length);

  streetTuples.push([
    street.key,
    titleCase([street.predir, street.name, street.type].filter(Boolean).join(' ')),
    street.predir,
    street.name,
    street.type,
    points[0].house,
    points[points.length - 1].house,
    points.length,
    centroidLat,
    centroidLng,
    zips,
  ]);

  const bucket = bucketKey(street.name);
  if (!buckets.has(bucket)) buckets.set(bucket, []);
  // Row: [house, suffix, lat, lng, index into the street's zips (-1 = unknown)]
  buckets.get(bucket).push([street.key, points.map((p) => [p.house, p.suffix, p.lat, p.lng, zipIndex.get(p.zip) ?? -1])]);
}

// ---------------------------------------------------------------------------
// 4. Intersections from centerline topology, keyed like the search index
// ---------------------------------------------------------------------------

const intersections = buildIntersections(segments, (segment) => {
  const key = (segment.stCode != null && codeToKey.get(segment.stCode)) || segment.key;
  return streets.has(key) ? key : null;
});
const pairCount = Object.keys(intersections).length;
for (const pair of ['BIGLER_ST|S_16TH_ST', 'NECTARINE_ST|SLOAN_ST', 'N_BROAD_ST|W_GIRARD_AVE']) {
  console.log(`  intersection ${pair}: ${JSON.stringify(intersections[pair] ?? 'MISSING')}`);
}

// ---------------------------------------------------------------------------
// 5. Serialise (one street / row / pair per line for small diffs) and write
// ---------------------------------------------------------------------------

function streetsJson(builtAt) {
  const lines = streetTuples.map((tuple) => JSON.stringify(tuple));
  return `{\n"version": ${INDEX_VERSION},\n"builtAt": ${JSON.stringify(builtAt)},\n"source": ${JSON.stringify(SOURCE_TABLE)},\n"streets": [\n${lines.join(',\n')}\n]\n}\n`;
}

function shardJson(entries) {
  const blocks = entries.map(([key, rows]) => `${JSON.stringify(key)}: [\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]`);
  return `{\n${blocks.join(',\n')}\n}\n`;
}

function intersectionsJson() {
  const lines = Object.entries(intersections).map(([pair, points]) => `${JSON.stringify(pair)}: ${JSON.stringify(points)}`);
  return `{\n"version": ${INDEX_VERSION},\n"pairs": {\n${lines.join(',\n')}\n}\n}\n`;
}

const intersectionsContent = intersectionsJson();
const shardFiles = new Map([...buckets].sort(([a], [b]) => (a < b ? -1 : 1)).map(([bucket, entries]) => [`${bucket}.json`, shardJson(entries)]));

async function readIfExists(path) {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return null;
  }
}

/** Same data as what's on disk? Compares everything but builtAt. */
async function unchanged() {
  const old = await readIfExists(join(OUT_DIR, 'streets.json'));
  const oldBuiltAt = old?.match(/"builtAt": (".*?")/)?.[1];
  if (!oldBuiltAt || old !== streetsJson(JSON.parse(oldBuiltAt))) return false;
  if ((await readIfExists(join(OUT_DIR, 'intersections.json'))) !== intersectionsContent) return false;
  const oldShards = await readdir(join(OUT_DIR, 'shards')).catch(() => []);
  if (oldShards.length !== shardFiles.size) return false;
  for (const [file, content] of shardFiles) {
    if ((await readIfExists(join(OUT_DIR, 'shards', file))) !== content) return false;
  }
  return true;
}

let totalBytes = 0;
const isUnchanged = await unchanged();
if (!isUnchanged) {
  await rm(TMP_DIR, { recursive: true, force: true });
  await mkdir(join(TMP_DIR, 'shards'), { recursive: true });
  const streetsContent = streetsJson(new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'));
  await writeFile(join(TMP_DIR, 'streets.json'), streetsContent);
  totalBytes += Buffer.byteLength(streetsContent);
  await writeFile(join(TMP_DIR, 'intersections.json'), intersectionsContent);
  totalBytes += Buffer.byteLength(intersectionsContent);
  for (const [file, content] of shardFiles) {
    await writeFile(join(TMP_DIR, 'shards', file), content);
    totalBytes += Buffer.byteLength(content);
  }
  // Swap in whole so a crash never leaves a half-written index
  await rm(OUT_DIR, { recursive: true, force: true });
  await rename(TMP_DIR, OUT_DIR);
}

// ---------------------------------------------------------------------------
// 6. Summary
// ---------------------------------------------------------------------------

console.log('\nAddress index summary');
console.log(`  rows read:          ${rowsRead}`);
console.log(`  rows kept:          ${rowsKept} (skipped ${skipped.badHouse} bad house/street, ${skipped.outsideCity} outside city bbox)`);
console.log(`  unique addresses:   ${addresses.size}`);
console.log(`  streets:            ${streetTuples.length}`);
console.log(`  centerline segs:    ${segments.length}`);
console.log(`  street-front:       ${addresses.size - unsnapped} snapped, ${unsnapped} kept at parcel (${pct(unsnappedShare)})`);
console.log(`  unmatched streets:  ${unmatchedCodes.length} of ${codeToKey.size} street codes (${pct(unmatchedShare)})`);
console.log(`  intersections:      ${pairCount} street pairs (${Buffer.byteLength(intersectionsContent)} bytes)`);
console.log(`  buckets:            ${shardFiles.size}`);
console.log(isUnchanged ? '  output:             unchanged, files left as-is' : `  total bytes:        ${totalBytes}`);
console.log(`  street_designation: ${[...designations].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${t}=${n}`).join(' ')}`);
