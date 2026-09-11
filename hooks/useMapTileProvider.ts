import { useState, useMemo } from "react";
import {
  getTileProviderById,
  getDefaultTileProvider,
} from "@/constants/tile-providers";
import type { TileProvider } from "@/types/map";

/**
 * Custom hook to manage map tile provider selection.
 *
 * @returns Object with current tile provider and setter function
 */
export function useMapTileProvider() {
  const [manualProviderId, setManualProviderId] = useState<string | null>(null);

  const tileProvider = useMemo<TileProvider>(() => {
    if (manualProviderId) {
      return getTileProviderById(manualProviderId) || getDefaultTileProvider();
    }
    return getDefaultTileProvider();
  }, [manualProviderId]);

  const currentProviderId = manualProviderId || getDefaultTileProvider().id;

  const setProviderId = (id: string | null) => {
    setManualProviderId(id);
  };

  return {
    tileProvider,
    currentProviderId,
    setProviderId,
  };
}
