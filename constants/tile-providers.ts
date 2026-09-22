/**
 * Tile provider configurations
 */

import type { TileProvider } from '@/types/map';

/**
 * Available tile providers
 */
export const TILE_PROVIDERS: TileProvider[] = [
  {
    // Nocturne's base. Esri's dark canvas needs no API key — CARTO's free
    // dark_all now does, and serves "API KEY REQUIRED" watermarks without one.
    // The .nv-map filter in nocturne.css carries it the rest of the way to
    // blue-hour steel. Esri stops at z16, so maxNativeZoom lets Leaflet
    // upscale for the zooms navigation uses instead of asking for tiles that
    // do not exist.
    id: 'nocturne',
    name: 'Nocturne',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    maxNativeZoom: 16,
    category: 'dark',
  },
  {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
    category: 'standard',
  },
  {
    id: 'satellite',
    name: 'Satellite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; <a href="https://www.esri.com/">Esri World Imagery </a>',
    maxZoom: 18,
    category: 'satellite',
  },
];

/**
 * Default tile provider ID
 */
export const DEFAULT_TILE_PROVIDER_ID = 'nocturne';

/**
 * Get tile provider by ID
 */
export function getTileProviderById(id: string): TileProvider | undefined {
  return TILE_PROVIDERS.find(provider => provider.id === id);
}

/**
 * Get default tile provider
 */
export function getDefaultTileProvider(): TileProvider {
  return TILE_PROVIDERS.find(provider => provider.id === DEFAULT_TILE_PROVIDER_ID) || TILE_PROVIDERS[0];
}
