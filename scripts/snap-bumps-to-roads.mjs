#!/usr/bin/env node
/**
 * One-time data fix: snap speed bump coordinates onto the nearest road.
 *
 * The dataset was derived from H3 grid cells, so some points sit slightly
 * off-street. This script batches coordinates through the free OSRM demo
 * server's route service (every waypoint in a route response comes back
 * road-snapped) and rewrites public/data/phl_speed_bumps.json in place.
 *
 * Rules:
 * - keep the original coordinate if the snap moved it > 100 m (bad match)
 * - drop bumps whose snapped coordinate duplicates an earlier one (6 dp)
 * - ~1 request/second out of politeness to the public server
 *
 * Usage: node scripts/snap-bumps-to-roads.mjs (also runs via GitHub Actions on push)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'phl_speed_bumps.json');
const OSRM_BASE = process.env.OSRM_BASE ?? 'https://router.project-osrm.org';
const BATCH_SIZE = 80; // waypoints per /route request
const MAX_SNAP_DISTANCE_M = 100;
const DELAY_MS = 1100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function haversine(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function snapBatch(bumps) {
  const coords = bumps.map((b) => `${b.lng},${b.lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=false&steps=false&annotations=false`;
  const res = await fetch(url, { headers: { 'User-Agent': 'speedbumps-data-fix/1.0' } });
  if (!res.ok) throw new Error(`OSRM ${res.status} for batch of ${bumps.length}`);
  const json = await res.json();
  if (json.code !== 'Ok' || !Array.isArray(json.waypoints) || json.waypoints.length !== bumps.length) {
    throw new Error(`OSRM unexpected response: code=${json.code} waypoints=${json.waypoints?.length}`);
  }
  return json.waypoints.map((wp) => ({ lng: wp.location[0], lat: wp.location[1] }));
}

const bumps = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
console.log(`Loaded ${bumps.length} bumps; snapping in batches of ${BATCH_SIZE}…`);

const snapped = [];
let moved = 0;
let kept = 0;

for (let i = 0; i < bumps.length; i += BATCH_SIZE) {
  const batch = bumps.slice(i, i + BATCH_SIZE);
  let locations;
  try {
    locations = await snapBatch(batch);
  } catch (err) {
    console.warn(`Batch ${i / BATCH_SIZE + 1} failed (${err.message}); retrying once in 10s…`);
    await sleep(10000);
    locations = await snapBatch(batch);
  }
  for (let j = 0; j < batch.length; j++) {
    const original = { lat: batch[j].lat, lng: batch[j].lng };
    const candidate = locations[j];
    const distance = haversine(original, candidate);
    if (distance <= MAX_SNAP_DISTANCE_M) {
      snapped.push({ id: batch[j].id, lat: candidate.lat, lng: candidate.lng });
      if (distance > 1) moved++;
    } else {
      snapped.push({ id: batch[j].id, ...original });
      kept++;
    }
  }
  console.log(`  ${Math.min(i + BATCH_SIZE, bumps.length)}/${bumps.length}`);
  await sleep(DELAY_MS);
}

// Drop exact-duplicate snapped coordinates (multiple H3 points collapsing
// onto the same road location), keeping the first id.
const seen = new Set();
const deduped = snapped.filter((b) => {
  const key = `${b.lat.toFixed(6)},${b.lng.toFixed(6)}`;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});

writeFileSync(DATA_PATH, JSON.stringify(deduped));
console.log(
  `Done: ${deduped.length} bumps written (${moved} snapped onto roads, ${kept} kept original >${MAX_SNAP_DISTANCE_M}m, ${snapped.length - deduped.length} duplicates removed).`
);
