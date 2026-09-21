/**
 * Geographic utility functions.
 * Ported from Flutter: lib/features/routing/domain/utils/geo_utils.dart
 * and lib/features/routing/domain/usecases/calculate_route_with_bump_avoidance.dart
 */

import type { LatLng } from '@/types/speedbumps';

const EARTH_RADIUS_METERS = 6371000;

/** Haversine distance between two points in meters. */
export function haversineDistance(p1: LatLng, p2: LatLng): number {
  const lat1 = (p1.lat * Math.PI) / 180;
  const lat2 = (p2.lat * Math.PI) / 180;
  const dLat = ((p2.lat - p1.lat) * Math.PI) / 180;
  const dLon = ((p2.lng - p1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.asin(Math.sqrt(a));
  return EARTH_RADIUS_METERS * c;
}

/**
 * Perpendicular distance from point to line segment (meters).
 * Uses linear interpolation on lat/lng then Haversine (valid for short segments).
 */
export function distanceToLineSegment(
  point: LatLng,
  lineStart: LatLng,
  lineEnd: LatLng
): number {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return haversineDistance(point, lineStart);
  }
  let t =
    ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closest: LatLng = {
    lat: lineStart.lat + t * dy,
    lng: lineStart.lng + t * dx,
  };
  return haversineDistance(point, closest);
}

/** Closest point on a segment to `point`, plus the clamped parameter t∈[0,1]. */
function closestPointOnSegment(
  point: LatLng,
  lineStart: LatLng,
  lineEnd: LatLng
): { point: LatLng; t: number } {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { point: lineStart, t: 0 };
  let t =
    ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { point: { lat: lineStart.lat + t * dy, lng: lineStart.lng + t * dx }, t };
}

export interface RouteProgress {
  /** Nearest point on the route to the driver (the "snapped" position). */
  snappedPoint: LatLng;
  /** Perpendicular distance from the driver to the route, meters. */
  offRouteMeters: number;
  /** Index of the segment start vertex the driver is currently on. */
  segmentIndex: number;
  /** Distance remaining from the snapped point to the route end, meters. */
  remainingMeters: number;
}

/**
 * Project a live position onto a route polyline.
 * Single source of truth for follow-cam ETA, progress trace, and snap line.
 */
export function routeProgress(points: LatLng[], loc: LatLng): RouteProgress {
  if (points.length === 0) {
    return { snappedPoint: loc, offRouteMeters: 0, segmentIndex: 0, remainingMeters: 0 };
  }
  if (points.length === 1) {
    return {
      snappedPoint: points[0],
      offRouteMeters: haversineDistance(loc, points[0]),
      segmentIndex: 0,
      remainingMeters: 0,
    };
  }

  let bestDist = Infinity;
  let bestIndex = 0;
  let bestPoint = points[0];
  for (let i = 0; i < points.length - 1; i++) {
    const { point } = closestPointOnSegment(loc, points[i], points[i + 1]);
    const d = haversineDistance(loc, point);
    if (d < bestDist) {
      bestDist = d;
      bestIndex = i;
      bestPoint = point;
    }
  }

  // Remaining = snapped→end-of-segment + every segment after it.
  let remaining = haversineDistance(bestPoint, points[bestIndex + 1]);
  for (let i = bestIndex + 1; i < points.length - 1; i++) {
    remaining += haversineDistance(points[i], points[i + 1]);
  }

  return {
    snappedPoint: bestPoint,
    offRouteMeters: bestDist,
    segmentIndex: bestIndex,
    remainingMeters: remaining,
  };
}

/** Index of the point in polyline closest to target. */
export function findClosestPointIndex(target: LatLng, points: LatLng[]): number {
  let minDist = Infinity;
  let idx = 0;
  for (let i = 0; i < points.length; i++) {
    const d = haversineDistance(target, points[i]);
    if (d < minDist) {
      minDist = d;
      idx = i;
    }
  }
  return idx;
}

/** Expand a bounding box by paddingMeters on all sides. */
export function expandBounds(
  sw: LatLng,
  ne: LatLng,
  paddingMeters: number
): { sw: LatLng; ne: LatLng } {
  const midLat = (sw.lat + ne.lat) / 2;
  const dLat = paddingMeters / 111320;
  const cosLat = Math.max(0.1, Math.abs(Math.cos((midLat * Math.PI) / 180)));
  const dLng = paddingMeters / (111320 * cosLat);
  return {
    sw: { lat: sw.lat - dLat, lng: sw.lng - dLng },
    ne: { lat: ne.lat + dLat, lng: ne.lng + dLng },
  };
}

/** Minimum bounding box of two points. */
export function routeBounds(a: LatLng, b: LatLng): { sw: LatLng; ne: LatLng } {
  return {
    sw: { lat: Math.min(a.lat, b.lat), lng: Math.min(a.lng, b.lng) },
    ne: { lat: Math.max(a.lat, b.lat), lng: Math.max(a.lng, b.lng) },
  };
}

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;
/** Below this we talk in feet; above it, miles. */
const FEET_THRESHOLD_MILES = 0.1;

/**
 * Split a distance into imperial display units — the single source of truth
 * for both on-screen text and spoken guidance (US audience).
 * Feet are rounded to a friendly step (10 ft under 200, else 50 ft).
 */
export function toImperial(meters: number): { value: number; unit: 'ft' | 'mi' } {
  const miles = meters / METERS_PER_MILE;
  if (miles < FEET_THRESHOLD_MILES) {
    const feet = meters * FEET_PER_METER;
    const step = feet < 200 ? 10 : 50;
    return { value: Math.max(step, Math.round(feet / step) * step), unit: 'ft' };
  }
  const rounded = miles < 10 ? Math.round(miles * 10) / 10 : Math.round(miles);
  return { value: rounded, unit: 'mi' };
}

/** Format distance meters to a human-readable imperial string ("450 ft", "2.3 mi"). */
export function formatDistance(meters: number): string {
  const { value, unit } = toImperial(meters);
  if (unit === 'ft') return `${value} ft`;
  return `${value % 1 === 0 ? value : value.toFixed(1)} mi`;
}

/** Format duration seconds to human-readable string. */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/**
 * Route line colour. The route you chose is teal — the accent for a chosen
 * thing — and every other line stays steel. The hazard accent belongs to the
 * bumps, so the two never compete on the map.
 */
export function routeColor(isSelected: boolean): string {
  return isSelected ? '#2BD9CE' : '#5B6E7F';
}
