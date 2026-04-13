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

/** Format distance meters to human-readable string. */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1609.34).toFixed(1)} mi`;
}

/** Format duration seconds to human-readable string. */
export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Polyline color based on bump count (matching Flutter color logic). */
export function routeColor(bumpCount: number, isSpeedBumpFree: boolean): string {
  if (isSpeedBumpFree) return '#00C853'; // green
  if (bumpCount >= 5) return '#FF1744'; // red
  return '#2196F3'; // blue
}
