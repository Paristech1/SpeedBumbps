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
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  location: LatLng;
}

export interface AppRoute {
  id: string;
  polylinePoints: LatLng[];
  steps: RouteStep[];
  distanceMeters: number;
  durationSeconds: number;
  speedBumpCount: number;
  isSpeedBumpFree: boolean;
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

export interface GeocodingResult {
  displayName: string;
  shortName: string;
  location: LatLng;
}

/**
 * Minimum severity to avoid based on vehicle and mode.
 * Ported from Flutter RouteAvoidanceProfile.minSeverityToAvoid
 */
export function getMinSeverityToAvoid(profile: RouteAvoidanceProfile): number {
  const baseByMode: Record<RoutePreferenceMode, number> = {
    smoothRide: 1,
    balanced: 3,
    fastest: 4,
  };
  const vehicleAdjust: Record<VehicleProfile, number> = {
    lowered: -1,
    motorcycle: -1,
    bicycle: -2,
    suv: 1,
    sedan: 0,
  };
  const base = baseByMode[profile.mode] + vehicleAdjust[profile.vehicle];
  return Math.max(1, Math.min(5, base));
}

export const DEFAULT_AVOIDANCE_PROFILE: RouteAvoidanceProfile = {
  mode: 'balanced',
  vehicle: 'sedan',
};
