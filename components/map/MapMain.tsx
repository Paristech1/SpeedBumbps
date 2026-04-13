"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { LeafletMap } from "./LeafletMap";
import { LeafletTileLayer } from "./LeafletTileLayer";
import { MapTileSwitcher } from "./MapTileSwitcher";
import { MapControls } from "./MapControls";
import { MapMeasurementPanel } from "./MapMeasurementPanel";
import { MapContextMenu } from "./MapContextMenu";
import { MapPOIPanel } from "./MapPOIPanel";
import { RoutePlanningPanel } from "./RoutePlanningPanel";
import { RouteResultCard } from "./RouteResultCard";
import { NavigationBar } from "./NavigationBar";
import { useMapTileProvider } from "@/hooks/useMapTileProvider";
import { useMapContextMenu } from "@/hooks/useMapContextMenu";
import { useMapMarkers } from "@/hooks/useMapMarkers";
import { usePOIManager } from "@/hooks/usePOIManager";
import { useSpeedBumpMarkers } from "@/hooks/useSpeedBumpMarkers";
import { useRoutePolyline } from "@/hooks/useRoutePolyline";
import { useLocationTracking, type UserLocation } from "@/hooks/useLocationTracking";
import { useRouteDeviation } from "@/hooks/useRouteDeviation";
import { RoutingProvider, useRouting, useSelectedRoute } from "@/contexts/RoutingContext";
import { useLeafletMap } from "@/hooks/useLeafletMap";
import type { POICategory } from "@/types/poi";
import type { RouteAvoidanceProfile, LatLng } from "@/types/speedbumps";
import { Navigation, X, MapPin, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";

/**
 * Inner component that has access to MapContext (LeafletMap must be a sibling, not parent).
 * Location comes from a single parent `useLocationTracking()` — do not call the hook here.
 */
function SpeedBumpsMap({ location }: { location: UserLocation | null }) {
  const map = useLeafletMap();
  const routing = useRouting();
  const selectedRoute = useSelectedRoute();

  // Speed bump markers (viewport-based, canvas renderer)
  useSpeedBumpMarkers(map);

  // Route polyline rendering
  useRoutePolyline({
    map,
    primaryRoute: routing.result?.primaryRoute,
    alternativeRoute: routing.result?.alternativeRoute,
    selectedRouteIndex: routing.selectedRouteIndex,
  });

  // User location blue dot
  useEffect(() => {
    if (!map || !location) return;
    let mounted = true;

    const addDot = async () => {
      const L = (await import("leaflet")).default;
      if (!mounted) return;

      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;background:#2196F3;border:3px solid white;border-radius:50%;box-shadow:0 2px 6px rgba(33,150,243,0.5)"></div>`,
        className: "",
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      // Remove previous user marker if any
      map.eachLayer((layer) => {
        if ((layer as unknown as { _isUserMarker?: boolean })._isUserMarker) {
          layer.remove();
        }
      });

      const marker = L.marker([location.position.lat, location.position.lng], {
        icon,
        zIndexOffset: 1000,
      }).addTo(map);
      (marker as unknown as { _isUserMarker: boolean })._isUserMarker = true;
    };

    addDot();
    return () => { mounted = false; };
  }, [map, location]);

  // Route deviation detection
  useRouteDeviation({
    routePoints: selectedRoute?.polylinePoints ?? null,
    currentLocation: location?.position ?? null,
    onDeviated: () => {
      if (routing.origin && routing.destination) {
        routing.calculateRoute(
          routing.origin,
          routing.destination,
          routing.originLabel ?? "Origin",
          routing.destinationLabel ?? "Destination",
          routing.avoidanceProfile
        );
      }
    },
  });

  return null;
}

/**
 * Outer component with all UI overlays.
 */
function MapMainInner() {
  const [isMeasurementOpen, setIsMeasurementOpen] = useState(false);
  const [isPOIPanelOpen, setIsPOIPanelOpen] = useState(false);
  const [poiFilterCategory, setPOIFilterCategory] = useState<POICategory | null>(null);
  const [poiInitialCoords, setPOIInitialCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [poiPanelMode, setPOIPanelMode] = useState<"list" | "add">("list");
  const [isSelectingPOILocation, setIsSelectingPOILocation] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isRoutePlanningOpen, setIsRoutePlanningOpen] = useState(false);

  const routing = useRouting();
  const selectedRoute = useSelectedRoute();
  const { location, isTracking } = useLocationTracking();

  const { tileProvider, currentProviderId, setProviderId } = useMapTileProvider();
  const { isOpen: isContextMenuOpen, position: contextMenuPosition, close: closeContextMenu } = useMapContextMenu();
  const { addMarker } = useMapMarkers();
  const { pois, addPOI, updatePOI, deletePOI, clearAllPOIs, exportGeoJSON, importGeoJSON, flyToPOI } = usePOIManager();

  const tileLayerProps = useMemo(
    () => ({ url: tileProvider.url, attribution: tileProvider.attribution, maxZoom: tileProvider.maxZoom }),
    [tileProvider.url, tileProvider.attribution, tileProvider.maxZoom]
  );

  const handlePlanRoute = useCallback(
    async (
      origin: LatLng,
      destination: LatLng,
      originLabel: string,
      destinationLabel: string,
      profile: RouteAvoidanceProfile
    ) => {
      await routing.calculateRoute(origin, destination, originLabel, destinationLabel, profile);
    },
    [routing]
  );

  const handleAddMarker = useCallback((lat: number, lng: number) => { addMarker(lat, lng); }, [addMarker]);
  const handleContextMenuMeasurement = useCallback(() => { setIsMeasurementOpen(true); }, []);
  const handleContextMenuAddPOI = useCallback((lat: number, lng: number) => {
    setPOIInitialCoords({ lat, lng });
    setPOIFilterCategory(null);
    setPOIPanelMode("add");
    setIsPOIPanelOpen(true);
  }, []);

  const handleClosePOIPanel = useCallback(() => {
    setIsPOIPanelOpen(false);
    setIsSelectingPOILocation(false);
    setPOIPanelMode("list");
    setTimeout(() => { setPOIFilterCategory(null); setPOIInitialCoords(null); }, 100);
  }, []);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isSelectingPOILocation) {
      setPOIInitialCoords({ lat, lng });
      setIsSelectingPOILocation(false);
      setCursorCoords(null);
    }
  }, [isSelectingPOILocation]);

  const handleMapMouseMove = useCallback((lat: number, lng: number) => {
    if (isSelectingPOILocation) setCursorCoords({ lat, lng });
  }, [isSelectingPOILocation]);

  const handlePOIExport = useCallback(() => {
    const geojson = exportGeoJSON();
    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `my-places-${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportGeoJSON]);

  const handlePOIImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const geojson = JSON.parse(text);
      const count = importGeoJSON(geojson);
      toast.success(`Successfully imported ${count} place${count !== 1 ? "s" : ""}!`);
    } catch {
      toast.error("Failed to import file. Please check the format.");
    }
  }, [importGeoJSON]);

  const hasRoute = routing.status === "success" && !!routing.result;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Map */}
      <LeafletMap
        className="w-full h-full"
        onClick={handleMapClick}
        onMouseMove={handleMapMouseMove}
        cursorStyle={isSelectingPOILocation ? "crosshair" : "grab"}
      >
        <LeafletTileLayer
          url={tileLayerProps.url}
          attribution={tileLayerProps.attribution}
          maxZoom={tileLayerProps.maxZoom}
        />
        {/* SpeedBumps logic (map-context-dependent) */}
        <SpeedBumpsMap location={location} />
      </LeafletMap>

      {/* Active navigation bar — replaces top bar when navigating */}
      {routing.isNavigating && selectedRoute && (
        <NavigationBar
          steps={selectedRoute.steps}
          currentLocation={location?.position ?? null}
          onEndNavigation={routing.stopNavigation}
        />
      )}

      {/* Search / Route bar — hidden during active navigation */}
      {!routing.isNavigating && (
        <div className="absolute left-0 right-0 sm:left-4 sm:right-auto top-3 z-[1001] px-4 sm:px-0">
          <div className="flex items-center gap-2 bg-white dark:bg-gray-700/90 backdrop-blur px-4 py-3 shadow-lg rounded-full w-full sm:w-[360px]">
            {hasRoute ? (
              <>
                <button
                  onClick={() => setIsRoutePlanningOpen(true)}
                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                  aria-label="Edit route"
                >
                  <Navigation className="w-5 h-5 text-blue-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                      {routing.originLabel} → {routing.destinationLabel}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setIsRoutePlanningOpen(true)}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full shrink-0"
                  aria-label="Edit route"
                >
                  <Pencil className="w-3.5 h-3.5 text-gray-400" />
                </button>
                <button
                  onClick={() => { routing.clearRoute(); setIsRoutePlanningOpen(false); }}
                  className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full shrink-0"
                  aria-label="Clear route"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </>
            ) : routing.status === "loading" ? (
              <>
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />
                <span className="text-sm font-medium text-gray-600 dark:text-gray-300 flex-1">Calculating route...</span>
              </>
            ) : (
              <button
                onClick={() => setIsRoutePlanningOpen(true)}
                className="flex items-center gap-3 flex-1 text-left"
                aria-label="Plan route"
              >
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <span className="text-sm font-medium text-gray-500 dark:text-gray-400 flex-1">
                  Where to in Philly?
                </span>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                  Go
                </span>
              </button>
            )}
          </div>
          {routing.status === "error" && routing.error && (
            <div className="mt-2 px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded-xl shadow">
              {routing.error}
            </div>
          )}
        </div>
      )}

      {/* Location tracking badge */}
      {!isTracking && (
        <div className="absolute top-16 right-4 z-[1001] px-3 py-1.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-medium rounded-full shadow">
          Location off
        </div>
      )}
      {isTracking && location && location.accuracy > 20 && (
        <div className="absolute top-16 right-4 z-[1001] px-3 py-1.5 bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 text-xs font-medium rounded-full shadow">
          GPS: {Math.round(location.accuracy)}m
        </div>
      )}

      {/* Tile Switcher */}
      <MapTileSwitcher selectedProviderId={currentProviderId} onProviderChange={setProviderId} />

      {/* Map Controls */}
      <MapControls />

      {/* Measurement Panel */}
      <MapMeasurementPanel isOpen={isMeasurementOpen} onClose={() => setIsMeasurementOpen(false)} />

      {/* Context Menu */}
      <MapContextMenu
        isOpen={isContextMenuOpen}
        position={contextMenuPosition}
        onClose={closeContextMenu}
        onAddMarker={handleAddMarker}
        onStartMeasurement={handleContextMenuMeasurement}
        onAddPOI={handleContextMenuAddPOI}
      />

      {/* POI Panel */}
      <MapPOIPanel
        isOpen={isPOIPanelOpen}
        onClose={handleClosePOIPanel}
        pois={pois}
        filterCategory={poiFilterCategory}
        onAddPOI={addPOI}
        onUpdatePOI={updatePOI}
        onDeletePOI={deletePOI}
        onClearAll={clearAllPOIs}
        onExport={handlePOIExport}
        onImport={handlePOIImport}
        onFlyTo={flyToPOI}
        onRequestLocation={() => setIsSelectingPOILocation((p) => !p)}
        onClearCoordinates={() => { setPOIInitialCoords(null); setCursorCoords(null); setIsSelectingPOILocation(false); }}
        onModeChange={(m) => setPOIPanelMode(m as "list" | "add")}
        isSelectingLocation={isSelectingPOILocation}
        initialLat={poiInitialCoords?.lat}
        initialLng={poiInitialCoords?.lng}
        cursorLat={cursorCoords?.lat}
        cursorLng={cursorCoords?.lng}
        mode={poiPanelMode}
      />

      {/* Route Planning Panel */}
      <RoutePlanningPanel
        isOpen={isRoutePlanningOpen}
        onClose={() => setIsRoutePlanningOpen(false)}
        userLocation={location?.position}
        onPlanRoute={handlePlanRoute}
        initialDestLabel={routing.destinationLabel}
      />

      {/* Route Result Card — hidden during active navigation */}
      {hasRoute && routing.result && !routing.isNavigating && (
        <RouteResultCard
          result={routing.result}
          selectedRouteIndex={routing.selectedRouteIndex}
          onToggleRoute={routing.toggleRoute}
          onClearRoute={() => { routing.clearRoute(); }}
          onStartNavigation={routing.startNavigation}
        />
      )}
    </div>
  );
}

export function MapMain() {
  return (
    <RoutingProvider>
      <MapMainInner />
    </RoutingProvider>
  );
}
