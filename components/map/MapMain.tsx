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
import { RouteResultCard, ROUTE_SHEET_SNAP_POINTS } from "./RouteResultCard";
import { NavigationBar } from "./NavigationBar";
import { BottomNavBar } from "./BottomNavBar";
import { SavedPanel } from "./SavedPanel";
import { ReportsPanel } from "./ReportsPanel";
import { ProfilePanel } from "./ProfilePanel";
import { useMapTileProvider } from "@/hooks/useMapTileProvider";
import { useMapContextMenu } from "@/hooks/useMapContextMenu";
import { useMapMarkers } from "@/hooks/useMapMarkers";
import { usePOIManager } from "@/hooks/usePOIManager";
import { useSpeedBumpMarkers } from "@/hooks/useSpeedBumpMarkers";
import { useRoutePolyline } from "@/hooks/useRoutePolyline";
import { useLocationTracking, type UserLocation } from "@/hooks/useLocationTracking";
import { useRouteDeviation } from "@/hooks/useRouteDeviation";
import { useSavedRoutes } from "@/hooks/useSavedRoutes";
import { useUserReports } from "@/hooks/useUserReports";
import { useUserProfile } from "@/hooks/useUserProfile";
import { RoutingProvider, useRouting, useSelectedRoute } from "@/contexts/RoutingContext";
import { useLeafletMap } from "@/hooks/useLeafletMap";
import type { POICategory } from "@/types/poi";
import type { RouteAvoidanceProfile, LatLng } from "@/types/speedbumps";
import type { SavedRoute, TabId } from "@/types/user-data";
import { Navigation, X, Loader2, Pencil } from "lucide-react";
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

  // User location blue dot — neon glow style per Velocity Dark
  useEffect(() => {
    if (!map || !location) return;
    let mounted = true;

    const addDot = async () => {
      const L = (await import("leaflet")).default;
      if (!mounted) return;

      const icon = L.divIcon({
        html: `<div style="width:14px;height:14px;background:#2196F3;border:3px solid white;border-radius:50%;box-shadow:0 0 12px rgba(33,150,243,0.6), 0 0 24px rgba(33,150,243,0.3)"></div>`,
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
 * Outer component with all UI overlays — Velocity Dark design.
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
  const [activeTab, setActiveTab] = useState<TabId>("explore");
  // Brand header is a startup splash only — it fades away once the app is in use
  const [showBrand, setShowBrand] = useState(true);
  const [routeSnap, setRouteSnap] = useState<number | string | null>(ROUTE_SHEET_SNAP_POINTS[1]);
  const [viewportH, setViewportH] = useState(0);
  const [isSelectingReportLocation, setIsSelectingReportLocation] = useState(false);
  const [reportPickedCoords, setReportPickedCoords] = useState<LatLng | null>(null);

  const routing = useRouting();
  const selectedRoute = useSelectedRoute();
  const { location, isTracking } = useLocationTracking();
  const { savedRoutes, saveRoute, deleteRoute, isRouteSaved } = useSavedRoutes();
  const { reports, addReport, deleteReport } = useUserReports();
  const { profile, updateProfile, isLoaded: isProfileLoaded } = useUserProfile();

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

  // Track viewport height for converting route-sheet snap points to px
  useEffect(() => {
    const update = () => setViewportH(window.innerHeight);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Retire the brand header shortly after launch
  useEffect(() => {
    const timer = setTimeout(() => setShowBrand(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // vaul 1.1.2 doesn't forward modal={false} to Radix Dialog, which sets
  // pointer-events:none on <body> while any drawer is open — locking the
  // bottom nav, map and controls. Undo it whenever it gets applied.
  useEffect(() => {
    const restore = () => {
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }
    };
    restore();
    const observer = new MutationObserver(restore);
    observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    return () => observer.disconnect();
  }, []);

  // Apply the profile's default avoidance profile once it's hydrated
  useEffect(() => {
    if (isProfileLoaded) {
      routing.setAvoidanceProfile(profile.defaultProfile);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProfileLoaded]);

  // New route result: reset sheet to default snap and return to the map
  useEffect(() => {
    if (routing.status === "success" && routing.result) {
      setRouteSnap(ROUTE_SHEET_SNAP_POINTS[1]);
      setActiveTab("explore");
    }
  }, [routing.status, routing.result]);

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    if (tab !== "reports") {
      setIsSelectingReportLocation(false);
      setReportPickedCoords(null);
    }
  }, []);

  const handleRunSavedRoute = useCallback(
    (route: SavedRoute) => {
      setActiveTab("explore");
      routing.calculateRoute(
        route.origin,
        route.destination,
        route.originLabel,
        route.destinationLabel,
        route.profile
      );
    },
    [routing]
  );

  const handleSaveRoute = useCallback(() => {
    if (!routing.origin || !routing.destination || !selectedRoute) return;
    if (isRouteSaved(routing.origin, routing.destination, routing.avoidanceProfile)) {
      toast.info("Route already saved");
      return;
    }
    saveRoute({
      origin: routing.origin,
      destination: routing.destination,
      originLabel: routing.originLabel ?? "Origin",
      destinationLabel: routing.destinationLabel ?? "Destination",
      profile: routing.avoidanceProfile,
      summary: {
        durationSeconds: selectedRoute.durationSeconds,
        distanceMeters: selectedRoute.distanceMeters,
        speedBumpCount: selectedRoute.speedBumpCount,
        isSpeedBumpFree: selectedRoute.isSpeedBumpFree,
      },
    });
    toast.success("Route saved");
  }, [routing, selectedRoute, isRouteSaved, saveRoute]);

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
    if (isSelectingReportLocation) {
      setReportPickedCoords({ lat, lng });
      setIsSelectingReportLocation(false);
      return;
    }
    if (isSelectingPOILocation) {
      setPOIInitialCoords({ lat, lng });
      setIsSelectingPOILocation(false);
      setCursorCoords(null);
    }
  }, [isSelectingPOILocation, isSelectingReportLocation]);

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

  // Keep map controls above whichever sheet is open
  const routeSheetVisible = hasRoute && !routing.isNavigating;
  const snapToPx = (s: number | string | null): number => {
    if (typeof s === "string") return parseInt(s, 10) || 0;
    if (typeof s === "number") return Math.round(s * viewportH);
    return 0;
  };
  const controlsBottom = routeSheetVisible ? snapToPx(routeSnap) + 16 : 128;
  const controlsHidden =
    (routeSheetVisible && typeof routeSnap === "number" && routeSnap >= 0.8) ||
    activeTab !== "explore";

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#111319]">
      {/* Map */}
      <LeafletMap
        className="w-full h-full"
        onClick={handleMapClick}
        onMouseMove={handleMapMouseMove}
        cursorStyle={isSelectingPOILocation || isSelectingReportLocation ? "crosshair" : "grab"}
      >
        <LeafletTileLayer
          url={tileLayerProps.url}
          attribution={tileLayerProps.attribution}
          maxZoom={tileLayerProps.maxZoom}
        />
        {/* SpeedBumps logic (map-context-dependent) */}
        <SpeedBumpsMap location={location} />
      </LeafletMap>

      {/* === TOP NAV BAR — startup splash only, fades once the app is in use === */}
      {!routing.isNavigating && (
        <nav
          className={`fixed top-0 w-full z-[1002] flex justify-between items-center px-6 py-4 bg-transparent transition-all duration-700 ${
            showBrand ? "opacity-100" : "opacity-0 -translate-y-4 pointer-events-none"
          }`}
          aria-hidden={!showBrand}
        >
          <div className="flex items-center gap-3">
            <svg className="w-7 h-7 text-[#2196F3]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <h1 className="font-[var(--font-headline)] font-bold tracking-tight text-2xl text-slate-100">
              SpeedBumps
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <button className="w-10 h-10 flex items-center justify-center rounded-full glass-panel text-[#e2e2eb] hover:bg-[#373940]/40 transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </button>
            <button
              onClick={() => handleTabChange(activeTab === "profile" ? "explore" : "profile")}
              className="w-10 h-10 rounded-full border-2 border-[#2196F3]/20 overflow-hidden shadow-2xl shadow-blue-500/10 active:scale-95 transition-transform"
              aria-label="Open profile"
            >
              <div className="w-full h-full bg-gradient-to-br from-[#2196F3] to-[#00BCD4] flex items-center justify-center text-white font-bold text-sm">
                {profile.displayName.charAt(0).toUpperCase() || "P"}
              </div>
            </button>
          </div>
        </nav>
      )}

      {/* Active navigation bar — replaces top bar when navigating */}
      {routing.isNavigating && selectedRoute && (
        <NavigationBar
          steps={selectedRoute.steps}
          currentLocation={location?.position ?? null}
          onEndNavigation={routing.stopNavigation}
        />
      )}

      {/* Search / Route bar — Velocity Dark glass style; rises to the top once the brand splash fades */}
      {!routing.isNavigating && (
        <div
          className={`absolute left-0 right-0 sm:left-6 sm:right-auto z-[1001] px-4 sm:px-0 transition-all duration-700 ${
            showBrand ? "top-20" : "top-5"
          }`}
        >
          <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 glass-panel ghost-border px-5 py-4 shadow-2xl rounded-full w-full sm:w-[380px]">
            {hasRoute ? (
              <>
                <button
                  onClick={() => setIsRoutePlanningOpen(true)}
                  className="flex items-center gap-2 flex-1 text-left min-w-0"
                  aria-label="Edit route"
                >
                  <Navigation className="w-5 h-5 text-[#44d8f1] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-[#e2e2eb] truncate">
                      {routing.originLabel} → {routing.destinationLabel}
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setIsRoutePlanningOpen(true)}
                  className="p-1.5 hover:bg-[#373940] rounded-full shrink-0 transition-colors"
                  aria-label="Edit route"
                >
                  <Pencil className="w-3.5 h-3.5 text-[#89919d]" />
                </button>
                <button
                  onClick={() => { routing.clearRoute(); setIsRoutePlanningOpen(false); }}
                  className="p-1.5 hover:bg-[#373940] rounded-full shrink-0 transition-colors"
                  aria-label="Clear route"
                >
                  <X className="w-4 h-4 text-[#89919d]" />
                </button>
              </>
            ) : routing.status === "loading" ? (
              <>
                <Loader2 className="w-5 h-5 text-[#2196F3] animate-spin shrink-0" />
                <span className="text-sm font-medium text-[#bfc7d4] flex-1">Calculating route...</span>
              </>
            ) : (
              <button
                onClick={() => setIsRoutePlanningOpen(true)}
                className="flex items-center gap-3 flex-1 text-left"
                aria-label="Plan route"
              >
                <svg className="w-5 h-5 text-[#9ecaff] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <span className="text-sm font-medium text-[#bfc7d4] flex-1">
                  Where to in Philly?
                </span>
                <svg className="w-5 h-5 text-[#bfc7d4] shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                </svg>
              </button>
            )}
          </div>
          {/* Inline avatar — takes over profile access after the brand splash retires */}
          {!showBrand && (
            <button
              onClick={() => handleTabChange(activeTab === "profile" ? "explore" : "profile")}
              className="w-11 h-11 shrink-0 rounded-full border-2 border-[#2196F3]/20 overflow-hidden shadow-2xl shadow-blue-500/10 active:scale-95 transition-transform animate-in fade-in duration-500"
              aria-label="Open profile"
            >
              <div className="w-full h-full bg-gradient-to-br from-[#2196F3] to-[#00BCD4] flex items-center justify-center text-white font-bold text-sm">
                {profile.displayName.charAt(0).toUpperCase() || "P"}
              </div>
            </button>
          )}
          </div>
          {routing.status === "error" && routing.error && (
            <div className="mt-2 px-4 py-2 bg-[#93000a]/30 text-[#ffb4ab] text-sm rounded-xl shadow ghost-border">
              {routing.error}
            </div>
          )}

          {/* Map Tools Grid (visible in default state) */}
          {!hasRoute && routing.status !== "loading" && (
            <div className="mt-3 glass-panel ghost-border rounded-2xl p-2 grid grid-cols-4 gap-2 shadow-xl w-full sm:w-[380px]">
              <button
                onClick={() => setIsMeasurementOpen((p) => !p)}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl hover:bg-[#373940] transition-all group"
              >
                <svg className="w-5 h-5 text-[#44d8f1] group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 12h20M2 12l4-4M2 12l4 4M22 12l-4-4M22 12l-4 4" />
                </svg>
                <span className="text-[10px] font-bold font-[var(--font-headline)] uppercase tracking-tighter text-[#bfc7d4]">Measure</span>
              </button>
              <button
                onClick={() => {
                  if (isPOIPanelOpen) {
                    handleClosePOIPanel();
                  } else {
                    setIsPOIPanelOpen(true);
                    setPOIPanelMode("list");
                  }
                }}
                className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl hover:bg-[#373940] transition-all group"
              >
                <svg className="w-5 h-5 text-[#44d8f1] group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span className="text-[10px] font-bold font-[var(--font-headline)] uppercase tracking-tighter text-[#bfc7d4]">My Places</span>
              </button>
              <button className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl hover:bg-[#373940] transition-all group opacity-50 cursor-not-allowed">
                <svg className="w-5 h-5 text-[#44d8f1] group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" />
                </svg>
                <span className="text-[10px] font-bold font-[var(--font-headline)] uppercase tracking-tighter text-[#bfc7d4]">Draw</span>
              </button>
              <button className="flex flex-col items-center justify-center gap-1 p-3 rounded-2xl hover:bg-[#373940] transition-all group opacity-50 cursor-not-allowed">
                <svg className="w-5 h-5 text-[#44d8f1] group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" />
                </svg>
                <span className="text-[10px] font-bold font-[var(--font-headline)] uppercase tracking-tighter text-[#bfc7d4]">Reset</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Category Pills (Desktop) */}
      {!routing.isNavigating && !hasRoute && (
        <div className={`absolute right-6 left-[28rem] hidden lg:flex overflow-x-auto hide-scrollbar gap-3 pb-4 z-[1001] transition-all duration-700 ${showBrand ? "top-20" : "top-5"}`}>
          {[
            { icon: "🍽️", label: "Restaurants" },
            { icon: "🏨", label: "Hotels" },
            { icon: "🎡", label: "Attractions" },
            { icon: "🚌", label: "Transit" },
          ].map((cat) => (
            <button
              key={cat.label}
              className="glass-panel ghost-border px-5 py-2.5 rounded-full flex items-center gap-2 whitespace-nowrap text-[#e2e2eb] font-semibold text-sm hover:bg-[#9ecaff]/20 transition-all active:scale-95"
            >
              <span>{cat.icon}</span>
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Location tracking badge — Velocity Dark style */}
      {!isTracking && (
        <div className={`absolute right-4 z-[1001] px-3 py-1.5 glass-panel ghost-border text-[#FF6B00] text-xs font-bold rounded-full shadow uppercase tracking-wider transition-all duration-700 ${showBrand ? "top-16" : "top-[5.25rem]"}`}>
          Location off
        </div>
      )}
      {isTracking && location && location.accuracy > 20 && (
        <div className={`absolute right-4 z-[1001] px-3 py-1.5 glass-panel ghost-border text-[#FF6B00] text-xs font-bold rounded-full shadow uppercase tracking-wider transition-all duration-700 ${showBrand ? "top-16" : "top-[5.25rem]"}`}>
          GPS: {Math.round(location.accuracy)}m
        </div>
      )}

      {/* Tile Switcher */}
      <MapTileSwitcher selectedProviderId={currentProviderId} onProviderChange={setProviderId} />

      {/* Map Controls */}
      <MapControls bottomOffset={controlsBottom} hidden={controlsHidden} />

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
        initialProfile={routing.avoidanceProfile}
      />

      {/* Route Result Card — hidden during active navigation */}
      {hasRoute && routing.result && !routing.isNavigating && (
        <RouteResultCard
          result={routing.result}
          selectedRouteIndex={routing.selectedRouteIndex}
          onToggleRoute={routing.toggleRoute}
          onClearRoute={() => { routing.clearRoute(); }}
          onStartNavigation={routing.startNavigation}
          onSaveRoute={handleSaveRoute}
          isRouteSaved={
            !!routing.origin &&
            !!routing.destination &&
            isRouteSaved(routing.origin, routing.destination, routing.avoidanceProfile)
          }
          snap={routeSnap}
          onSnapChange={setRouteSnap}
        />
      )}

      {/* Saved / Reports / Profile tab drawers */}
      <SavedPanel
        isOpen={activeTab === "saved"}
        onClose={() => handleTabChange("explore")}
        pois={pois}
        onFlyToPOI={flyToPOI}
        onDeletePOI={deletePOI}
        savedRoutes={savedRoutes}
        onRunSavedRoute={handleRunSavedRoute}
        onDeleteSavedRoute={deleteRoute}
      />
      <ReportsPanel
        isOpen={activeTab === "reports"}
        onClose={() => handleTabChange("explore")}
        reports={reports}
        onAddReport={addReport}
        onDeleteReport={deleteReport}
        userLocation={location?.position ?? null}
        isPickingLocation={isSelectingReportLocation}
        onTogglePickLocation={() => setIsSelectingReportLocation((p) => !p)}
        pickedLocation={reportPickedCoords}
        onClearPickedLocation={() => setReportPickedCoords(null)}
      />
      <ProfilePanel
        isOpen={activeTab === "profile"}
        onClose={() => handleTabChange("explore")}
        profile={profile}
        onUpdateProfile={updateProfile}
        stats={{ places: pois.length, routes: savedRoutes.length, reports: reports.length }}
        onAvoidanceProfileChange={routing.setAvoidanceProfile}
      />

      {/* === BOTTOM NAVIGATION BAR (Velocity Dark shared component) === */}
      {!routing.isNavigating && (
        <BottomNavBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          onFabClick={() => setIsRoutePlanningOpen((p) => !p)}
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
