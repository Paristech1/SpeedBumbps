import { describe, it, expect } from 'vitest';
import {
  haversineDistance,
  distanceToLineSegment,
  routeProgress,
  expandBounds,
  toImperial,
  formatDistance,
  formatDuration,
} from '@/lib/geo-utils';
import { speechDistance } from '@/lib/voice-guidance';

// Center City Philadelphia: ~0.001° lat ≈ 111 m, ~0.001° lng ≈ 85 m
const A = { lat: 39.9526, lng: -75.1652 };

describe('haversineDistance', () => {
  it('is zero for identical points', () => {
    expect(haversineDistance(A, A)).toBe(0);
  });

  it('matches a known ~111 m per 0.001° of latitude', () => {
    const d = haversineDistance(A, { lat: A.lat + 0.001, lng: A.lng });
    expect(d).toBeGreaterThan(110);
    expect(d).toBeLessThan(112);
  });
});

describe('distanceToLineSegment', () => {
  const start = { lat: 39.95, lng: -75.17 };
  const end = { lat: 39.95, lng: -75.16 };

  it('measures perpendicular distance for a point beside the segment', () => {
    const d = distanceToLineSegment({ lat: 39.9502, lng: -75.165 }, start, end);
    expect(d).toBeGreaterThan(20);
    expect(d).toBeLessThan(24);
  });

  it('clamps to the nearest endpoint beyond the segment', () => {
    const beyond = { lat: 39.95, lng: -75.15 };
    expect(distanceToLineSegment(beyond, start, end)).toBeCloseTo(haversineDistance(beyond, end), 6);
  });

  it('degenerates to point distance for a zero-length segment', () => {
    expect(distanceToLineSegment(A, start, start)).toBeCloseTo(haversineDistance(A, start), 6);
  });
});

describe('routeProgress', () => {
  const route = [
    { lat: 39.95, lng: -75.17 },
    { lat: 39.95, lng: -75.16 },
    { lat: 39.96, lng: -75.16 },
  ];

  it('snaps onto the correct segment and computes remaining distance', () => {
    const p = routeProgress(route, { lat: 39.9501, lng: -75.165 });
    expect(p.segmentIndex).toBe(0);
    expect(p.offRouteMeters).toBeLessThan(15);
    const total = haversineDistance(route[0], route[1]) + haversineDistance(route[1], route[2]);
    expect(p.remainingMeters).toBeLessThan(total);
    expect(p.remainingMeters).toBeGreaterThan(haversineDistance(route[1], route[2]));
  });

  it('reports ~0 remaining at the destination', () => {
    const p = routeProgress(route, route[2]);
    expect(p.segmentIndex).toBe(1);
    expect(p.remainingMeters).toBeLessThan(1);
  });
});

describe('expandBounds', () => {
  it('grows the box by the requested padding on every side', () => {
    const { sw, ne } = expandBounds({ lat: 39.95, lng: -75.17 }, { lat: 39.96, lng: -75.16 }, 200);
    expect(haversineDistance({ lat: 39.95, lng: -75.17 }, { lat: sw.lat, lng: -75.17 })).toBeCloseTo(200, -1);
    expect(haversineDistance({ lat: 39.96, lng: -75.16 }, { lat: ne.lat, lng: -75.16 })).toBeCloseTo(200, -1);
    expect(sw.lng).toBeLessThan(-75.17);
    expect(ne.lng).toBeGreaterThan(-75.16);
  });
});

describe('imperial units', () => {
  it('uses feet under a tenth of a mile and miles above', () => {
    expect(toImperial(30)).toEqual({ value: 100, unit: 'ft' });
    expect(toImperial(100)).toEqual({ value: 350, unit: 'ft' });
    expect(toImperial(500)).toEqual({ value: 0.3, unit: 'mi' });
    expect(toImperial(16093)).toEqual({ value: 10, unit: 'mi' });
  });

  it('formats for display', () => {
    expect(formatDistance(100)).toBe('350 ft');
    expect(formatDistance(2000)).toBe('1.2 mi');
    expect(formatDistance(3218.7)).toBe('2 mi');
  });

  it('speaks the same units it displays', () => {
    expect(speechDistance(100)).toBe('350 feet');
    expect(speechDistance(320)).toBe('a quarter mile');
    expect(speechDistance(800)).toBe('half a mile');
    expect(speechDistance(1609)).toBe('one mile');
    expect(speechDistance(4000)).toBe('2.5 miles');
  });

  it('formats durations', () => {
    expect(formatDuration(90)).toBe('2 min');
    expect(formatDuration(3600)).toBe('1h');
    expect(formatDuration(3900)).toBe('1h 5m');
  });
});
