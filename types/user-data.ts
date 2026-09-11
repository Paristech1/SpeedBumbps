/**
 * User-local data types — saved routes, speed bump reports, and profile.
 * All persisted to localStorage (no backend).
 */

import type { LatLng, RouteAvoidanceProfile, GeocodingResult } from './speedbumps';

export interface SavedRoute {
  id: string;
  origin: LatLng;
  destination: LatLng;
  originLabel: string;
  destinationLabel: string;
  /**
   * The route was planned from "My Location". When re-run, the live GPS
   * position replaces the stored origin coordinate.
   */
  originIsCurrentLocation?: boolean;
  profile: RouteAvoidanceProfile;
  /** Snapshot of the selected route's stats at save time. */
  summary: {
    durationSeconds: number;
    distanceMeters: number;
    speedBumpCount: number;
    isSpeedBumpFree: boolean;
  };
  createdAt: number;
}

export interface UserReport {
  id: string;
  location: LatLng;
  severity: number; // 1–5
  note?: string;
  createdAt: number;
}

export interface UserProfile {
  displayName: string;
  defaultProfile: RouteAvoidanceProfile;
  updatedAt: number;
}

/** A destination the user picked in the planner, for quick re-selection. */
export interface RecentDestination extends GeocodingResult {
  usedAt: number;
}

export type TabId = 'explore' | 'saved' | 'reports' | 'profile';

export const SAVED_ROUTES_STORAGE_KEY = 'speedbumps-saved-routes';
export const RECENT_SEARCHES_STORAGE_KEY = 'speedbumps-recent-searches';
export const USER_REPORTS_STORAGE_KEY = 'speedbumps-user-reports';
export const USER_PROFILE_STORAGE_KEY = 'speedbumps-profile';
