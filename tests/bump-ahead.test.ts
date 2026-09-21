import { describe, it, expect } from 'vitest';
import { nextBumpAhead } from '@/lib/bump-ahead';
import type { SpeedBump } from '@/types/speedbumps';

// A straight run north up one longitude; ~111 m per 0.001 degree of latitude.
const route = [
  { lat: 39.940, lng: -75.160 },
  { lat: 39.942, lng: -75.160 },
  { lat: 39.944, lng: -75.160 },
  { lat: 39.946, lng: -75.160 },
];

function bump(id: string, lat: number): SpeedBump {
  return { id, location: { lat, lng: -75.160 }, severity: 3, isVerified: true, source: 'dataset' };
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
