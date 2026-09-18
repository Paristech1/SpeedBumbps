import { describe, it, expect } from 'vitest';
import {
  CORNER_CLEARANCE_M,
  clampAlong,
  fromXY,
  prepareSegment,
  snapHouse,
  toXY,
} from '@/lib/address-index/centerline.mjs';

/** A centerline segment drawn in metres around the projection origin. */
function segment(points: [number, number][], props: Record<string, unknown> = {}) {
  const coords = points.map((p) => {
    const { lat, lng } = fromXY(p);
    return [lng, lat];
  });
  const seg = prepareSegment({ st_name: 'SLOAN', st_type: 'ST', st_code: 73040, ...props }, coords);
  if (!seg) throw new Error('bad fixture segment');
  return seg;
}

function snapXY(byCode: ReturnType<typeof segment>[], house: number, [x, y]: [number, number], byName: ReturnType<typeof segment>[] = []) {
  const { lat, lng } = fromXY([x, y]);
  const snapped = snapHouse(byCode, byName, house, lat, lng);
  return snapped && toXY(snapped.lat, snapped.lng);
}

/** Output is rounded to 5 decimals (~1.1 m), so compare metres with a 1 m tolerance. */
function expectNear(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThan(1);
}

describe('street-front snapping', () => {
  it('T1: snaps onto its own street even when the cross street is closer', () => {
    // Own street runs north from the corner at (0,0); the cross street runs east-west through it.
    const own = segment([[0, 0], [0, 100]], { l_f_add: 436, l_t_add: 498, r_f_add: 437, r_t_add: 499 });
    // Parcel 25 m west of its street, 10 m north of the cross street
    const point = snapXY([own], 440, [-25, 10]);
    expect(point).not.toBeNull();
    expect(Math.abs(point![0])).toBeLessThan(0.5); // on the own street's line
    expectNear(point![1], CORNER_CLEARANCE_M); // kept out of the corner
  });

  it('T2: picks the carriageway whose side has the house parity', () => {
    const evenSide = segment([[0, 0], [0, 200]], { l_f_add: 1400, l_t_add: 1498, r_f_add: 0, r_t_add: 0 });
    const oddSide = segment([[20, 0], [20, 200]], { l_f_add: 0, l_t_add: 0, r_f_add: 1401, r_t_add: 1499 });
    // Odd house whose parcel is nearer the even carriageway
    expectNear(snapXY([evenSide, oddSide], 1421, [5, 100])![0], 20);
    // Even house nearer the odd carriageway
    expectNear(snapXY([evenSide, oddSide], 1420, [15, 100])![0], 0);
  });

  it('prefers the segment whose address range holds the house', () => {
    const block400 = segment([[0, 0], [0, 100]], { l_f_add: 400, l_t_add: 498, r_f_add: 401, r_t_add: 499 });
    const block500 = segment([[0, 100], [0, 200]], { l_f_add: 500, l_t_add: 598, r_f_add: 501, r_t_add: 599 });
    // Parcel sits right at the block boundary but the house is on the 500 block
    expect(snapXY([block400, block500], 510, [-10, 98])![1]).toBeGreaterThan(100);
  });

  it('T3: clamps a point that lands near a segment end', () => {
    const long = segment([[0, 0], [0, 100]]);
    expectNear(snapXY([long], 440, [-10, 3])![1], 15);
    expectNear(snapXY([long], 440, [-10, 99])![1], 85);
    // Short block: 25% of 40 m = 10 m
    const short = segment([[0, 0], [0, 40]]);
    expectNear(snapXY([short], 440, [-10, 3])![1], 10);
    expect(clampAlong(3, 40)).toBe(10);
    expect(clampAlong(50, 100)).toBe(50);
  });

  it('T4: falls back to the nearest segment when ranges are missing', () => {
    const a = segment([[0, 0], [0, 100]], { l_f_add: null, l_t_add: null, r_f_add: 0, r_t_add: 0 });
    const b = segment([[30, 0], [30, 100]], { l_f_add: null, l_t_add: null, r_f_add: 0, r_t_add: 0 });
    expectNear(snapXY([a, b], 440, [22, 50])![0], 30);
    expectNear(snapXY([a, b], 440, [8, 50])![0], 0);
  });

  it('tries same-name segments when the street code has none nearby', () => {
    const byName = segment([[0, 0], [0, 100]], { st_code: null });
    expectNear(snapXY([], 440, [-20, 50], [byName])![0], 0);
  });

  it('leaves parcels more than 60 m from their street unsnapped', () => {
    expect(snapXY([segment([[0, 0], [0, 100]])], 440, [-80, 50])).toBeNull();
  });
});
