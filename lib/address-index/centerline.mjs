/**
 * City street-centerline geometry for the address index build (pure JS,
 * shared by scripts/build-address-index.mjs and the unit tests):
 *
 * - Street-front points: OPA gives parcel centroids, which on a corner lot can
 *   sit closer to the cross street, so the router starts on the wrong street.
 *   Each house is moved onto its own street's centerline, in front of it,
 *   and kept clear of the corners.
 * - Intersections: streets that share a centerline node meet there.
 *
 * Distances use an equirectangular projection around Philadelphia (metres),
 * accurate to well under 1% across the city.
 */

import { centerlineKey } from './keys.mjs';

const LAT0 = 39.95;
const LNG0 = -75.16;
const M_PER_DEG_LAT = 111132;
const M_PER_DEG_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);

/** Farthest a parcel may be from its street's centerline to be snapped onto it. */
export const SNAP_MAX_M = 60;
/** Keep street-front points at least this far (or 25% of the segment) from a corner. */
export const CORNER_CLEARANCE_M = 15;
/** Nodes of the same street pair closer than this are one intersection (divided roads). */
export const INTERSECTION_CLUSTER_M = 75;

const round5 = (x) => Math.round(x * 1e5) / 1e5;

/** @returns {[number, number]} metres east/north of the projection origin */
export function toXY(lat, lng) {
  return [(lng - LNG0) * M_PER_DEG_LNG, (lat - LAT0) * M_PER_DEG_LAT];
}

/** @returns {{ lat: number, lng: number }} */
export function fromXY([x, y]) {
  return { lat: y / M_PER_DEG_LAT + LAT0, lng: x / M_PER_DEG_LNG + LNG0 };
}

export function metersBetween(a, b) {
  const [ax, ay] = toXY(a.lat, a.lng);
  const [bx, by] = toXY(b.lat, b.lng);
  return Math.hypot(ax - bx, ay - by);
}

/**
 * @typedef {{ from: number, to: number, parity: number }} AddressRange
 * @typedef {{
 *   stCode: number | null,
 *   key: string,
 *   fnode: number | null,
 *   tnode: number | null,
 *   start: { lat: number, lng: number },
 *   end: { lat: number, lng: number },
 *   xy: [number, number][],
 *   length: number,
 *   bbox: [number, number, number, number],
 *   ranges: AddressRange[],
 * }} Segment
 */

/** One side's address range, or null when the side has none (null / 0). */
function sideRange(from, to) {
  const f = Number(from) || 0;
  const t = Number(to) || 0;
  if (!f && !t) return null;
  return { from: Math.min(f || t, t || f), to: Math.max(f, t), parity: (f || t) % 2 };
}

/**
 * Centerline feature → segment. `coords` are GeoJSON [lng, lat] pairs.
 * @returns {Segment | null}
 */
export function prepareSegment(props, coords) {
  if (!Array.isArray(coords) || coords.length < 2) return null;
  const xy = coords.map(([lng, lat]) => toXY(lat, lng));
  let length = 0;
  for (let i = 1; i < xy.length; i++) length += Math.hypot(xy[i][0] - xy[i - 1][0], xy[i][1] - xy[i - 1][1]);
  const xs = xy.map((p) => p[0]);
  const ys = xy.map((p) => p[1]);
  const first = coords[0];
  const last = coords[coords.length - 1];
  return {
    stCode: props.st_code != null ? Number(props.st_code) : null,
    key: centerlineKey(props),
    fnode: props.fnode_ ?? null,
    tnode: props.tnode_ ?? null,
    start: { lat: first[1], lng: first[0] },
    end: { lat: last[1], lng: last[0] },
    xy,
    length,
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    ranges: [sideRange(props.l_f_add, props.l_t_add), sideRange(props.r_f_add, props.r_t_add)].filter(Boolean),
  };
}

/** Nearest point on a polyline: distance to it and how far along the line it is. */
export function projectOnPolyline(xy, [px, py]) {
  let best = { distance: Infinity, along: 0 };
  let walked = 0;
  for (let i = 1; i < xy.length; i++) {
    const [ax, ay] = xy[i - 1];
    const [bx, by] = xy[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
    const distance = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    if (distance < best.distance) best = { distance, along: walked + t * Math.sqrt(len2) };
    walked += Math.sqrt(len2);
  }
  return best;
}

/** The point `along` metres from the start of a polyline. */
export function pointAlong(xy, along) {
  let walked = 0;
  for (let i = 1; i < xy.length; i++) {
    const [ax, ay] = xy[i - 1];
    const [bx, by] = xy[i];
    const len = Math.hypot(bx - ax, by - ay);
    if (walked + len >= along || i === xy.length - 1) {
      const t = len === 0 ? 0 : Math.max(0, Math.min(1, (along - walked) / len));
      return fromXY([ax + t * (bx - ax), ay + t * (by - ay)]);
    }
    walked += len;
  }
  return fromXY(xy[0]);
}

/** Keep a street-front point out of the intersection at either end of its segment. */
export function clampAlong(along, length) {
  const clearance = Math.min(CORNER_CLEARANCE_M, length * 0.25);
  return Math.min(Math.max(along, clearance), length - clearance);
}

/**
 * +2 when the house is inside a side's address range, +1 when it has that
 * side's parity (picks the right carriageway on divided roads).
 */
export function rangeScore(segment, house) {
  let score = 0;
  for (const range of segment.ranges) {
    const inRange = house >= range.from && house <= range.to ? 2 : 0;
    score = Math.max(score, inRange + (house % 2 === range.parity ? 1 : 0));
  }
  return score;
}

/** Best segment within SNAP_MAX_M of the parcel: highest range score, then nearest. */
export function chooseSegment(segments, house, lat, lng) {
  const p = toXY(lat, lng);
  let best = null;
  for (const segment of segments) {
    const [minX, minY, maxX, maxY] = segment.bbox;
    if (p[0] < minX - SNAP_MAX_M || p[0] > maxX + SNAP_MAX_M || p[1] < minY - SNAP_MAX_M || p[1] > maxY + SNAP_MAX_M) continue;
    const projection = projectOnPolyline(segment.xy, p);
    if (projection.distance > SNAP_MAX_M) continue;
    const score = rangeScore(segment, house);
    if (!best || score > best.score || (score === best.score && projection.distance < best.projection.distance)) {
      best = { segment, projection, score };
    }
  }
  return best;
}

/**
 * Street-front point for a house: tries segments with the parcel's street
 * code, then segments with its street name. Null when neither is within reach.
 * @param {Segment[]} byCode
 * @param {Segment[]} byName
 */
export function snapHouse(byCode, byName, house, lat, lng) {
  const choice = chooseSegment(byCode, house, lat, lng) ?? chooseSegment(byName, house, lat, lng);
  if (!choice) return null;
  const { segment, projection } = choice;
  const point = pointAlong(segment.xy, clampAlong(projection.along, segment.length));
  return { lat: round5(point.lat), lng: round5(point.lng) };
}

/** Greedy clustering: each point joins the first cluster whose centre is within `radius`. */
function cluster(points, radius) {
  const clusters = [];
  for (const point of points) {
    const hit = clusters.find((c) => metersBetween(c, point) <= radius);
    if (hit) {
      hit.lat = (hit.lat * hit.n + point.lat) / (hit.n + 1);
      hit.lng = (hit.lng * hit.n + point.lng) / (hit.n + 1);
      hit.n++;
    } else {
      clusters.push({ ...point, n: 1 });
    }
  }
  return clusters
    .map((c) => [round5(c.lat), round5(c.lng)])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/**
 * Intersections from centerline topology: every pair of streets sharing a
 * node meets there. Returns sorted `"KEYA|KEYB"` → sorted [lat, lng][].
 * @param {Segment[]} segments
 * @param {(segment: Segment) => string | null} keyOf street key for a segment (null = skip)
 */
export function buildIntersections(segments, keyOf) {
  const nodes = new Map();
  const touch = (node, point, key) => {
    if (node == null) return;
    let entry = nodes.get(node);
    if (!entry) {
      entry = { point, keys: new Set() };
      nodes.set(node, entry);
    }
    entry.keys.add(key);
  };
  for (const segment of segments) {
    const key = keyOf(segment);
    if (!key) continue;
    touch(segment.fnode, segment.start, key);
    touch(segment.tnode, segment.end, key);
  }

  const pairs = new Map();
  for (const { point, keys } of nodes.values()) {
    const sorted = [...keys].sort();
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const pair = `${sorted[i]}|${sorted[j]}`;
        if (!pairs.has(pair)) pairs.set(pair, []);
        pairs.get(pair).push(point);
      }
    }
  }

  return Object.fromEntries(
    [...pairs.keys()].sort().map((pair) => [pair, cluster(pairs.get(pair), INTERSECTION_CLUSTER_M)]),
  );
}
