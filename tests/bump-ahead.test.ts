import { describe, it, expect } from 'vitest';
import { nextBumpAhead } from '@/lib/bump-ahead';
import { haversineDistance } from '@/lib/geo-utils';
import type { SpeedBump } from '@/types/speedbumps';

// A straight run north up one longitude; ~111 m per 0.001 degree of latitude.
const route = [
  { lat: 39.940, lng: -75.160 },
  { lat: 39.942, lng: -75.160 },
  { lat: 39.944, lng: -75.160 },
  { lat: 39.946, lng: -75.160 },
];

function bump(id: string, lat: number, lng = -75.160): SpeedBump {
  return { id, location: { lat, lng }, severity: 3, isVerified: true, source: 'dataset' };
}

describe('nextBumpAhead', () => {
  it('picks the closest bump in front of the driver', () => {
    const result = nextBumpAhead([bump('far', 39.9455), bump('near', 39.9432)], { lat: 39.9425, lng: -75.160 }, route);
    expect(result?.bump.id).toBe('near');
    expect(result?.distanceMeters).toBeGreaterThan(0);
  });

  it('ignores bumps already behind the driver', () => {
    const result = nextBumpAhead([bump('behind', 39.9405)], { lat: 39.9440, lng: -75.160 }, route);
    expect(result).toBeNull();
  });

  it('ignores bumps beyond the warning range', () => {
    const result = nextBumpAhead([bump('ahead', 39.9459)], { lat: 39.9400, lng: -75.160 }, route, 200);
    expect(result).toBeNull();
  });

  it('drops a bump the driver has crossed inside a single long segment', () => {
    // One 1.1 km segment: driver and bump are nearest the same vertex, so a
    // vertex-index comparison would keep calling the passed bump "ahead".
    const longSegment = [
      { lat: 39.940, lng: -75.160 },
      { lat: 39.950, lng: -75.160 },
    ];
    expect(nextBumpAhead([bump('passed', 39.9420)], { lat: 39.9450, lng: -75.160 }, longSegment)).toBeNull();
    expect(nextBumpAhead([bump('ahead', 39.9480)], { lat: 39.9450, lng: -75.160 }, longSegment)?.bump.id).toBe('ahead');
  });

  it('measures the distance along the route, not across the bend', () => {
    // The bump sits one leg further round the corner, so the route distance
    // has to come out longer than the straight line to it.
    const bend = [
      { lat: 39.940, lng: -75.160 },
      { lat: 39.940, lng: -75.150 },
      { lat: 39.941, lng: -75.150 },
    ];
    const driver = { lat: 39.940, lng: -75.1595 };
    const target = bump('round-the-bend', 39.941, -75.150);
    const result = nextBumpAhead([target], driver, bend, 2000);
    expect(result?.distanceMeters).toBeGreaterThan(haversineDistance(driver, target.location));
  });

  it('falls back to the nearest bump when there is no geometry', () => {
    const result = nextBumpAhead([bump('a', 39.9405), bump('b', 39.9420)], { lat: 39.9400, lng: -75.160 }, null);
    expect(result?.bump.id).toBe('a');
  });

  it('returns null without bumps or a fix', () => {
    expect(nextBumpAhead([], { lat: 39.94, lng: -75.16 }, route)).toBeNull();
    expect(nextBumpAhead([bump('a', 39.942)], null, route)).toBeNull();
  });
});

describe('bumpsRemaining', () => {
  it('counts only the bumps still in front', async () => {
    const { bumpsRemaining } = await import('@/lib/bump-ahead');
    const bumps = [bump('behind', 39.9405), bump('ahead-1', 39.9445), bump('ahead-2', 39.9458)];
    expect(bumpsRemaining(bumps, { lat: 39.9430, lng: -75.160 }, route)).toBe(2);
  });

  it('counts them all without a fix or geometry', async () => {
    const { bumpsRemaining } = await import('@/lib/bump-ahead');
    const bumps = [bump('a', 39.9405), bump('b', 39.9445)];
    expect(bumpsRemaining(bumps, null, route)).toBe(2);
    expect(bumpsRemaining(bumps, { lat: 39.943, lng: -75.16 }, null)).toBe(2);
  });
});
