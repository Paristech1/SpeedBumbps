/**
 * Address-index key helpers shared by the build script
 * (scripts/build-address-index.mjs) and the runtime matcher
 * (lib/address-index/*.ts). Plain JS so the script can import it without
 * a TypeScript toolchain — keep both sides on these functions so shard
 * names and street keys never drift.
 */

// 2: house points are street-front points on the centerline; intersections.json added
export const INDEX_VERSION = 2;

/** Philadelphia city limits, used to drop mis-geocoded parcels. */
export const PHILLY_BBOX = { minLat: 39.86, maxLat: 40.14, minLng: -75.29, maxLng: -74.95 };

/**
 * `N_FRANKLIN_ST`, `MARKET_ST`, `S_5TH_ST` — OPA fields joined with `_`,
 * empty parts omitted.
 * @param {string | null | undefined} predir
 * @param {string} name
 * @param {string | null | undefined} type
 * @returns {string}
 */
export function streetKey(predir, name, type) {
  return [predir, name, type].filter(Boolean).join('_').replace(/\s+/g, '_');
}

/**
 * Street key for a City centerline segment. Its fields are space-padded
 * (`pre_dir: ' '`) where OPA's are null.
 * @param {{ pre_dir?: string | null, st_name?: string | null, st_type?: string | null }} props
 * @returns {string}
 */
export function centerlineKey(props) {
  const clean = (/** @type {string | null | undefined} */ v) => (v ?? '').trim().toUpperCase().replace(/\s+/g, ' ');
  return streetKey(clean(props.pre_dir), clean(props.st_name), clean(props.st_type));
}

/**
 * Shard bucket for a street: first two alphanumerics of its name (not the
 * predir), padded with `_` — `FRANKLIN` → `FR`, `5TH` → `5T`, `M L KING` → `ML`.
 * @param {string} name
 * @returns {string}
 */
export function bucketKey(name) {
  return name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 2).padEnd(2, '_');
}

/**
 * House number as people write it. OPA stores half-addresses
 * ("256 1/2 S 3rd St") as suffix `2`; letter suffixes ("1234R") attach directly.
 * @param {number | string} house
 * @param {string} suffix
 * @returns {string}
 */
export function formatHouse(house, suffix) {
  if (!suffix) return String(house);
  return suffix === '2' ? `${house} 1/2` : `${house}${suffix}`;
}
