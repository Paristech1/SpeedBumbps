import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { LatLng, SpeedBump } from '@/types/speedbumps';
import { getDetourBudget, getMinSeverityToAvoid } from '@/types/speedbumps';
import type { OsrmRouteResult, RouteRequestOptions } from '@/lib/osrm-service';

// --- Router + dataset mocks -------------------------------------------------

const getRouteCandidates = vi.fn<
  (origin: LatLng, destination: LatLng, options?: RouteRequestOptions) => Promise<OsrmRouteResult[]>
>();
const loadAllBumps = vi.fn<() => Promise<SpeedBump[]>>();

vi.mock('@/lib/osrm-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/osrm-service')>('@/lib/osrm-service');
  return { ...actual, getRouteCandidates: (...args: Parameters<typeof getRouteCandidates>) => getRouteCandidates(...args) };
});

vi.mock('@/lib/speed-bump-service', async () => {
  const actual = await vi.importActual<typeof import('@/lib/speed-bump-service')>('@/lib/speed-bump-service');
  return { ...actual, loadAllBumps: () => loadAllBumps() };
});

const { calculateRouteWithBumpAvoidance, detectBumpsOnRoute, polylineBounds } = await import('@/lib/bump-avoidance');

// --- Fixtures ---------------------------------------------------------------

const ORIGIN = { lat: 39.95, lng: -75.17 };
const DEST = { lat: 39.95, lng: -75.15 };

/** Straight line along lat 39.95 (through the bump at -75.16). */
const DIRECT: LatLng[] = [ORIGIN, { lat: 39.95, lng: -75.165 }, { lat: 39.95, lng: -75.16 }, { lat: 39.95, lng: -75.155 }, DEST];
/** Detour one block north (lat 39.952) — clear of the bump. */
const DETOUR: LatLng[] = [ORIGIN, { lat: 39.952, lng: -75.17 }, { lat: 39.952, lng: -75.15 }, DEST];

const BUMP: SpeedBump = { id: 'b1', location: { lat: 39.95, lng: -75.16 }, severity: 3, isVerified: true, source: 'dataset' };
const FAR_BUMP: SpeedBump = { id: 'b2', location: { lat: 39.97, lng: -75.16 }, severity: 3, isVerified: true, source: 'dataset' };

function route(points: LatLng[], durationSeconds: number): OsrmRouteResult {
  return {
    polylinePoints: points,
    distanceMeters: durationSeconds * 10,
    durationSeconds,
    steps: [],
  };
}

beforeEach(() => {
  getRouteCandidates.mockReset();
  loadAllBumps.mockReset();
  loadAllBumps.mockResolvedValue([BUMP, FAR_BUMP]);
});

// --- Tests ------------------------------------------------------------------

describe('detectBumpsOnRoute', () => {
  it('finds bumps within 20 m of the geometry and ignores distant ones', () => {
    expect(detectBumpsOnRoute(DIRECT, [BUMP, FAR_BUMP]).map((b) => b.id)).toEqual(['b1']);
    expect(detectBumpsOnRoute(DETOUR, [BUMP, FAR_BUMP])).toEqual([]);
  });

  it('uses the route geometry bbox, not the origin/destination box', () => {
    // A bump on the detour's northern leg is outside the origin→destination bbox
    const northBump: SpeedBump = { ...BUMP, id: 'north', location: { lat: 39.952, lng: -75.16 } };
    expect(detectBumpsOnRoute(DETOUR, [northBump]).map((b) => b.id)).toEqual(['north']);
  });
});

describe('polylineBounds', () => {
  it('returns null for an empty polyline and the min/max box otherwise', () => {
    expect(polylineBounds([])).toBeNull();
    expect(polylineBounds(DETOUR)).toEqual({ sw: { lat: 39.95, lng: -75.17 }, ne: { lat: 39.952, lng: -75.15 } });
  });
});

describe('profile model', () => {
  it('sets the detour budget by strategy and nudges it by vehicle', () => {
    expect(getDetourBudget({ mode: 'fastest', vehicle: 'sedan' })).toBe(0);
    expect(getDetourBudget({ mode: 'fastest', vehicle: 'lowered' })).toBe(0);
    expect(getDetourBudget({ mode: 'balanced', vehicle: 'sedan' })).toBeCloseTo(0.25);
    expect(getDetourBudget({ mode: 'balanced', vehicle: 'suv' })).toBeCloseTo(0.15);
    expect(getDetourBudget({ mode: 'smoothRide', vehicle: 'lowered' })).toBeCloseTo(0.75);
  });

  it('counts gentler bumps for vehicles that feel them more', () => {
    expect(getMinSeverityToAvoid({ mode: 'balanced', vehicle: 'bicycle' })).toBe(1);
    expect(getMinSeverityToAvoid({ mode: 'balanced', vehicle: 'sedan' })).toBe(2);
    expect(getMinSeverityToAvoid({ mode: 'balanced', vehicle: 'suv' })).toBe(3);
  });
});

describe('calculateRouteWithBumpAvoidance', () => {
  it('returns only the primary when it is already bump-free', async () => {
    getRouteCandidates.mockResolvedValueOnce([route(DETOUR, 600)]);
    const result = await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'balanced', vehicle: 'sedan' });
    expect(result.primaryRoute.isSpeedBumpFree).toBe(true);
    expect(result.alternativeRoute).toBeUndefined();
    expect(getRouteCandidates).toHaveBeenCalledTimes(1);
  });

  it('asks for alternates and bicycle costing from the profile', async () => {
    getRouteCandidates.mockResolvedValueOnce([route(DETOUR, 600)]);
    await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'balanced', vehicle: 'bicycle' });
    expect(getRouteCandidates.mock.calls[0][2]).toMatchObject({ alternates: 2, costing: 'bicycle' });
  });

  it('offers an exclusion-based detour with fewer bumps within the budget', async () => {
    getRouteCandidates
      .mockResolvedValueOnce([route(DIRECT, 600)]) // primary crosses the bump
      .mockResolvedValueOnce([route(DETOUR, 700)]); // exclusion round: +17%
    const result = await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'balanced', vehicle: 'sedan' });

    expect(result.primaryRoute.speedBumpCount).toBe(1);
    expect(result.alternativeRoute?.isSpeedBumpFree).toBe(true);
    expect(result.alternativeRoute?.durationSeconds).toBe(700);

    // The exclusion request carried the primary's bump
    const exclusionCall = getRouteCandidates.mock.calls[1][2];
    expect(exclusionCall?.exclude).toEqual([BUMP.location]);
  });

  it('drops a detour that blows the time budget', async () => {
    getRouteCandidates
      .mockResolvedValueOnce([route(DIRECT, 600)])
      .mockResolvedValueOnce([route(DETOUR, 900)]); // +50% > balanced's 25%
    const result = await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'balanced', vehicle: 'sedan' });
    expect(result.alternativeRoute).toBeUndefined();
  });

  it('accepts the same detour under Smooth Ride', async () => {
    getRouteCandidates
      .mockResolvedValueOnce([route(DIRECT, 600)])
      .mockResolvedValueOnce([route(DETOUR, 900)]); // +50% ≤ smooth's 60%
    const result = await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'smoothRide', vehicle: 'sedan' });
    expect(result.alternativeRoute?.isSpeedBumpFree).toBe(true);
  });

  it('never searches for a detour in Fastest mode', async () => {
    getRouteCandidates.mockResolvedValueOnce([route(DIRECT, 600)]);
    const result = await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'fastest', vehicle: 'sedan' });
    expect(result.primaryRoute.speedBumpCount).toBe(1);
    expect(result.alternativeRoute).toBeUndefined();
    expect(getRouteCandidates).toHaveBeenCalledTimes(1);
  });

  it('prefers a router-provided alternate when it is already better', async () => {
    getRouteCandidates
      .mockResolvedValueOnce([route(DIRECT, 600), route(DETOUR, 650)])
      .mockResolvedValueOnce([route(DETOUR, 700)]);
    const result = await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'balanced', vehicle: 'sedan' });
    expect(result.alternativeRoute?.durationSeconds).toBe(650);
  });

  it('does not offer an alternative that crosses just as many bumps', async () => {
    getRouteCandidates
      .mockResolvedValueOnce([route(DIRECT, 600), route(DIRECT, 620)])
      .mockResolvedValueOnce([route(DIRECT, 610)]);
    const result = await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'smoothRide', vehicle: 'sedan' });
    expect(result.alternativeRoute).toBeUndefined();
  });

  it('does not try to exclude a bump on the destination street', async () => {
    const atDestination: SpeedBump = { ...BUMP, id: 'dest', location: { lat: 39.95, lng: -75.1505 } };
    loadAllBumps.mockResolvedValue([atDestination]);
    getRouteCandidates.mockResolvedValueOnce([route(DIRECT, 600)]);
    const result = await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'smoothRide', vehicle: 'sedan' });
    expect(result.primaryRoute.speedBumpCount).toBe(1);
    expect(result.alternativeRoute).toBeUndefined();
    expect(getRouteCandidates).toHaveBeenCalledTimes(1); // no exclusion round
  });

  it('survives the router rejecting the exclusion request', async () => {
    getRouteCandidates
      .mockResolvedValueOnce([route(DIRECT, 600)])
      .mockRejectedValueOnce(new Error('Valhalla 400'));
    const result = await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'balanced', vehicle: 'sedan' });
    expect(result.primaryRoute.speedBumpCount).toBe(1);
    expect(result.alternativeRoute).toBeUndefined();
  });

  it('ignores bumps below the vehicle severity threshold', async () => {
    loadAllBumps.mockResolvedValue([{ ...BUMP, severity: 2, source: 'user' }]);
    getRouteCandidates.mockResolvedValueOnce([route(DIRECT, 600)]);
    const result = await calculateRouteWithBumpAvoidance(ORIGIN, DEST, { mode: 'balanced', vehicle: 'suv' });
    expect(result.primaryRoute.isSpeedBumpFree).toBe(true);
  });
});
