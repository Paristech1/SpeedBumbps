import { describe, it, expect } from 'vitest';
import { decodePolyline, assignStepPolylineIndices } from '@/lib/osrm-service';
import type { RouteStep } from '@/types/speedbumps';

describe('decodePolyline', () => {
  it('decodes the canonical Google example', () => {
    const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(points).toHaveLength(3);
    expect(points[0].lat).toBeCloseTo(38.5, 5);
    expect(points[0].lng).toBeCloseTo(-120.2, 5);
    expect(points[2].lat).toBeCloseTo(43.252, 5);
    expect(points[2].lng).toBeCloseTo(-126.453, 5);
  });
});

describe('assignStepPolylineIndices', () => {
  // A straight east-west line, then north
  const polyline = [
    { lat: 39.95, lng: -75.17 },
    { lat: 39.95, lng: -75.168 },
    { lat: 39.95, lng: -75.166 },
    { lat: 39.95, lng: -75.164 },
    { lat: 39.952, lng: -75.164 },
    { lat: 39.954, lng: -75.164 },
  ];

  const step = (lat: number, lng: number): RouteStep => ({
    instruction: '',
    distanceMeters: 0,
    durationSeconds: 0,
    location: { lat, lng },
    polylineIndex: 0,
  });

  it('maps each maneuver onto its nearest polyline vertex', () => {
    const steps = [step(39.95, -75.17), step(39.95, -75.164), step(39.954, -75.164)];
    assignStepPolylineIndices(steps, polyline);
    expect(steps.map((s) => s.polylineIndex)).toEqual([0, 3, 5]);
  });

  it('never assigns an index earlier than the previous step', () => {
    // Second maneuver is geographically closest to vertex 1, but must not
    // land before the first maneuver at vertex 3.
    const steps = [step(39.95, -75.164), step(39.95, -75.168), step(39.954, -75.164)];
    assignStepPolylineIndices(steps, polyline);
    expect(steps[1].polylineIndex).toBeGreaterThanOrEqual(steps[0].polylineIndex);
    expect(steps[2].polylineIndex).toBeGreaterThanOrEqual(steps[1].polylineIndex);
  });
});
