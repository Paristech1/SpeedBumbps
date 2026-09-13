/**
 * SpeedBumps domain types — ported from Flutter domain entities
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface SpeedBump {
  id: string;
  location: LatLng;
  severity: number; // 1–5
  isVerified: boolean;
  source?: 'dataset' | 'user';
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  /** Where the maneuver happens. */
  location: LatLng;
  /** Index into the route polyline closest to `location` (monotonic across steps). */
  polylineIndex: number;
}

export interface AppRoute {
  id: string;
  polylinePoints: LatLng[];
  steps: RouteStep[];
  distanceMeters: number;
  durationSeconds: number;
  speedBumpCount: number;
  isSpeedBumpFree: boolean;
  /** Speed bumps that lie on this route, for proximity voice alerts. */
  bumpsOnRoute: SpeedBump[];
  calculatedAt: Date;
}

export interface RouteCalculationResult {
  primaryRoute: AppRoute;
  alternativeRoute?: AppRoute;
}

export type VehicleProfile = 'sedan' | 'suv' | 'lowered' | 'motorcycle' | 'bicycle';
export type RoutePreferenceMode = 'smoothRide' | 'balanced' | 'fastest';

export interface RouteAvoidanceProfile {
  mode: RoutePreferenceMode;
  vehicle: VehicleProfile;
}

export type GeocodingKind = 'place' | 'address' | 'street' | 'area';

export interface GeocodingResult {
  displayName: string;
  shortName: string;
  location: LatLng;
  /** What the result is — drives the icon in search suggestions. */
  kind?: GeocodingKind;
  /** Human label for businesses/amenities, e.g. "Grocery store". */
  category?: string;
  houseNumber?: string;
}

/**
 * Minimum severity for a bump to count against a route.
 *
 * Official dataset bumps are all severity 3, so this threshold mostly
 * distinguishes gentle user-reported bumps. Vehicles that feel bumps more
 * (lowered cars, bikes, motorcycles) count gentler bumps; SUVs ignore them.
 */
export function getMinSeverityToAvoid(profile: RouteAvoidanceProfile): number {
  const vehicleThreshold: Record<VehicleProfile, number> = {
    bicycle: 1,
    lowered: 1,
    motorcycle: 2,
    sedan: 2,
    suv: 3,
  };
  return vehicleThreshold[profile.vehicle];
}

/**
 * How much longer (as a fraction of the fastest route's duration) a
 * bump-avoiding detour may be before it's not worth offering.
 *
 * The strategy sets the budget; the vehicle nudges it. `fastest` returns 0,
 * meaning: show bumps on the fastest route but don't search for a detour.
 */
export function getDetourBudget(profile: RouteAvoidanceProfile): number {
  const baseByMode: Record<RoutePreferenceMode, number> = {
    smoothRide: 0.6,
    balanced: 0.25,
    fastest: 0,
  };
  const base = baseByMode[profile.mode];
  if (base === 0) return 0;
  const vehicleAdjust: Record<VehicleProfile, number> = {
    lowered: 0.15,
    motorcycle: 0.15,
    bicycle: 0.15,
    suv: -0.1,
    sedan: 0,
  };
  return Math.max(0.05, base + vehicleAdjust[profile.vehicle]);
}

/** Routing engine costing model for a vehicle profile. */
export function getRoutingCosting(vehicle: VehicleProfile): 'auto' | 'motorcycle' | 'bicycle' {
  if (vehicle === 'bicycle') return 'bicycle';
  if (vehicle === 'motorcycle') return 'motorcycle';
  return 'auto';
}

export const DEFAULT_AVOIDANCE_PROFILE: RouteAvoidanceProfile = {
  mode: 'balanced',
  vehicle: 'sedan',
};
