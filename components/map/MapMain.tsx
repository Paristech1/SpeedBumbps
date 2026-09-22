"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import { hudTopVariants, fadeScaleVariants } from "@/lib/motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useMapTileProvider } from "@/hooks/useMapTileProvider";
import { useMapContextMenu } from "@/hooks/useMapContextMenu";
import { useMapMarkers } from "@/hooks/useMapMarkers";
import { usePOIManager } from "@/hooks/usePOIManager";
import { useSpeedBumpMarkers } from "@/hooks/useSpeedBumpMarkers";
import { useRoutePolyline } from "@/hooks/useRoutePolyline";
import { useLocationTracking, type UserLocation } from "@/hooks/useLocationTracking";
import { useRouteDeviation } from "@/hooks/useRouteDeviation";
import { useNavigationCamera } from "@/hooks/useNavigationCamera";
import { useWakeLock } from "@/hooks/useWakeLock";
import { primeVoice, speak, isSpeechSupported, prewarmVoice, prerenderVoice } from "@/lib/voice-guidance";
import { nextBumpAhead } from "@/lib/bump-ahead";
import { log } from "@/lib/app-logger";
import { useSavedRoutes } from "@/hooks/useSavedRoutes";
import { useUserReports } from "@/hooks/useUserReports";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { useNearbyBumpCount } from "@/hooks/useNearbyBumpCount";
import { RoutingProvider, useRouting, useSelectedRoute } from "@/contexts/RoutingContext";
import { useLeafletMap } from "@/hooks/useLeafletMap";
import { reverseGeocode, coordinateLabel } from "@/lib/nominatim-service";
import type { PlanRouteRequest } from "./RoutePlanningPanel";
import type { POICategory } from "@/types/poi";
import type { LatLng, GeocodingResult } from "@/types/speedbumps";
import type { SavedRoute, TabId } from "@/types/user-data";
import { Navigation, X, Pencil, LocateFixed } from "lucide-react";
import { toast } from "sonner";

/**
 * Inner component that has access to MapContext (LeafletMap must be a sibling, not parent).
 * Location comes from a single parent `useLocationTracking()` — do not call the hook here.
 */
function SpeedBumpsMap({
  location,
  isFollowing,
  onUserPan,
  bottomInset,
}: {
  location: UserLocation | null;
  isFollowing: boolean;
  onUserPan: () => void;
  /** Height of the route preview sheet; routes are framed above it. */
  bottomInset: number;
}) {
  const map = useLeafletMap();
  const routing = useRouting();
  const selectedRoute = useSelectedRoute();

  // Speed bump markers (viewport-based, canvas renderer); on-route bumps emphasised.
  // The next bump ahead is the single ember on the map.
  const nextBump = nextBumpAhead(
    selectedRoute?.bumpsOnRoute,
    location?.position ?? null,
    selectedRoute?.polylinePoints,
  );
  useSpeedBumpMarkers(map, {
    onRouteBumps: selectedRoute?.bumpsOnRoute ?? null,
    nextBumpId: nextBump?.bump.id ?? null,
  });

  // Route polyline rendering — follow-cam owns the camera during navigation
  useRoutePolyline({
    map,
    primaryRoute: routing.result?.primaryRoute,
    alternativeRoute: routing.result?.alternativeRoute,
    selectedRouteIndex: routing.selectedRouteIndex,
    autoFit: !routing.isNavigating,
    bottomInset,
    currentLocation: location?.position ?? null,
    isNavigating: routing.isNavigating,
  });

  // Follow camera during navigation
  useNavigationCamera({
    map,
    location,
    isNavigating: routing.isNavigating,
    isFollowing,
    onUserPan,
  });

  // User location marker — glowing dot, or a heading arrow while navigating
  const heading = location?.heading ?? null;
  const showArrow = routing.isNavigating && heading != null;
  useEffect(() => {
    if (!map || !location) return;
    let mounted = true;

    const addDot = async () => {
      const L = (await import("leaflet")).default;
      if (!mounted) return;

      const dotHtml = `<div style="width:14px;height:14px;background:#E6EAF0;border:3px solid #07090A;border-radius:50%;box-shadow:0 0 0 1px rgba(230,234,240,0.35), 0 0 18px rgba(230,234,240,0.25)"></div>`;
      // Upward chevron rotated to the travel heading (north-up map)
      const arrowHtml = `<div style="transform:rotate(${heading ?? 0}deg);width:30px;height:30px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 0 10px rgba(230,234,240,0.35))"><svg width="30" height="30" viewBox="0 0 24 24" fill="#E6EAF0" stroke="#07090A" stroke-width="1.5" stroke-linejoin="round"><path d="M12 2L20 21L12 16L4 21L12 2Z"/></svg></div>`;
      const icon = L.divIcon({
        html: showArrow ? arrowHtml : dotHtml,
        className: "user-location-marker",
        iconSize: showArrow ? [30, 30] : [14, 14],
        iconAnchor: showArrow ? [15, 15] : [7, 7],
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
  }, [map, location, showArrow, heading]);

  // Route deviation detection
  useRouteDeviation({
    routePoints: selectedRoute?.polylinePoints ?? null,
    currentLocation: location?.position ?? null,
    onDeviated: () => {
      if (!routing.destination) return;
      // Reroute from where the driver actually is, not the original origin
      const from = location?.position ?? routing.origin;
      if (!from) return;
      log("warn", "navigation", "route deviation — recalculating from current position");
      if (routing.isNavigating) speak("No worries — finding you a smoother way.");
      routing.rerouteFrom(from);
    },
  });

  return null;
}

/**
 * Outer component with all UI overlays — Nocturne Velocity design.
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
  // Opt-in immersive mode (expand button): hides the overlay chrome
  const [isImmersive, setIsImmersive] = useState(false);
  // Navigation follow-cam: true = camera tracks the driver; false = user panned away
  const [isFollowing, setIsFollowing] = useState(true);
  const [routeSnap, setRouteSnap] = useState<number | string | null>(ROUTE_SHEET_SNAP_POINTS[1]);
  const [viewportH, setViewportH] = useState(0);
  const [isSelectingReportLocation, setIsSelectingReportLocation] = useState(false);
  const [reportPickedCoords, setReportPickedCoords] = useState<LatLng | null>(null);
  // Whether the active route was planned from "My Location" (saved routes re-run from live GPS)
  const [originIsCurrentLocation, setOriginIsCurrentLocation] = useState(false);
  // Destination preset by "Route here" on the map
  const [routeHereDestination, setRouteHereDestination] = useState<GeocodingResult | null>(null);
  // "Drop a pin" from the search screen: the map takes the next tap.
  const [isPickingDestination, setIsPickingDestination] = useState(false);

  const routing = useRouting();
  const { recents, addRecent, removeRecent } = useRecentSearches();
  const selectedRoute = useSelectedRoute();
  // High-accuracy GPS only while navigating (heading, speed, fresh fixes)
  const { location, isTracking, hasPermission, error: locationError, startTracking } = useLocationTracking({ highAccuracy: routing.isNavigating });
  const map = useLeafletMap();
  // Search bias for the planner when there's no GPS fix
  const getMapCenter = useCallback((): LatLng | null => {
    if (!map) return null;
    const center = map.getCenter();
    return { lat: center.lat, lng: center.lng };
  }, [map]);
  const [routeErrorDismissed, setRouteErrorDismissed] = useState(false);
  useEffect(() => {
    setRouteErrorDismissed(false);
  }, [routing.error]);
  const { savedRoutes, saveRoute, deleteRoute, isRouteSaved } = useSavedRoutes();
  const { reports, addReport, deleteReport } = useUserReports();
  const { profile, updateProfile, isLoaded: isProfileLoaded } = useUserProfile();

  const { tileProvider, currentProviderId, setProviderId } = useMapTileProvider();
  const { isOpen: isContextMenuOpen, position: contextMenuPosition, close: closeContextMenu } = useMapContextMenu();
  const { addMarker } = useMapMarkers();
  const { pois, addPOI, updatePOI, deletePOI, clearAllPOIs, exportGeoJSON, importGeoJSON, flyToPOI } = usePOIManager();

  const tileLayerProps = useMemo(
    () => ({
      url: tileProvider.url,
      attribution: tileProvider.attribution,
      maxZoom: tileProvider.maxZoom,
      maxNativeZoom: tileProvider.maxNativeZoom,
    }),
    [tileProvider.url, tileProvider.attribution, tileProvider.maxZoom, tileProvider.maxNativeZoom]
  );

  const handlePlanRoute = useCallback(
    async (request: PlanRouteRequest) => {
      const { origin, destination, originLabel, destinationLabel, profile, originIsCurrentLocation, destinationResult } = request;
      setOriginIsCurrentLocation(originIsCurrentLocation);
      setRouteHereDestination(null);
      // "My Location" swapped into the destination slot isn't a place worth remembering
      if (destinationResult.shortName !== "My Location") addRecent(destinationResult);
      await routing.calculateRoute(origin, destination, originLabel, destinationLabel, profile);
    },
    [routing, addRecent]
  );

  // "Route here" from the map: reverse-geocode the point, then open the planner with it preset
  const handleRouteHere = useCallback(async (lat: number, lng: number) => {
    const point = { lat, lng };
    let destination: GeocodingResult = {
      displayName: coordinateLabel(point),
      shortName: "Dropped pin",
      location: point,
    };
    try {
      const result = await reverseGeocode(point);
      // Keep the exact tapped point; only borrow the address text
      if (result) destination = { ...result, location: point };
    } catch {
      // keep the coordinate label
    }
    setRouteHereDestination(destination);
    setIsRoutePlanningOpen(true);
  }, []);

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

  // Plotting a route is the moment to get the neural voice ready: it needs a
  // model download the first time, and starting that at the first turn is a
  // missed turn. Rendering this route's own steps now means their street names
  // are already audio when they're spoken. Both no-op unless the driver turned
  // the neural voice on.
  const plottedRoute = routing.status === "success" ? routing.result : null;
  useEffect(() => {
    if (!plottedRoute) return;
    prewarmVoice();
    const steps = [
      ...(plottedRoute.primaryRoute?.steps ?? []),
      ...(plottedRoute.alternativeRoute?.steps ?? []),
    ].map((step) => step.instruction);
    if (steps.length > 0) prerenderVoice(steps);
  }, [plottedRoute]);

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
      // Routes saved from "My Location" start from wherever the driver is now
      const fromLive = !!route.originIsCurrentLocation;
      const origin = fromLive && location ? location.position : route.origin;
      if (fromLive && !location) {
        toast("No GPS fix yet — using the location this route was saved from.");
      }
      setOriginIsCurrentLocation(fromLive);
      routing.calculateRoute(
        origin,
        route.destination,
        fromLive ? "My Location" : route.originLabel,
        route.destinationLabel,
        route.profile
      );
    },
    [routing, location]
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
      originIsCurrentLocation,
      profile: routing.avoidanceProfile,
      summary: {
        durationSeconds: selectedRoute.durationSeconds,
        distanceMeters: selectedRoute.distanceMeters,
        speedBumpCount: selectedRoute.speedBumpCount,
        isSpeedBumpFree: selectedRoute.isSpeedBumpFree,
      },
    });
    toast.success("Route saved");
  }, [routing, selectedRoute, isRouteSaved, saveRoute, originIsCurrentLocation]);

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
    if (isPickingDestination) {
      setIsPickingDestination(false);
      handleRouteHere(lat, lng);
      return;
    }
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
  }, [isSelectingPOILocation, isSelectingReportLocation, isPickingDestination, handleRouteHere]);

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
      toast.error("Couldn't import that file. Expected a GeoJSON (.geojson/.json) export from My Places.");
    }
  }, [importGeoJSON]);

  const hasRoute = routing.status === "success" && !!routing.result;
  const nearbyBumps = useNearbyBumpCount(location?.position ?? null);

  // Keep the screen on while navigating (GPS and speech die when it locks)
  useWakeLock(routing.isNavigating);

  // Snap back into follow mode whenever navigation (re)starts
  useEffect(() => {
    if (routing.isNavigating) setIsFollowing(true);
  }, [routing.isNavigating]);

  // Start tap = the iOS user gesture that unlocks speechSynthesis
  const handleStartNavigation = useCallback(() => {
    if (!location) {
      toast.error("Waiting for a GPS fix — turn-by-turn needs your location.");
      return;
    }
    primeVoice();
    if (isSpeechSupported()) {
      try {
        if (!localStorage.getItem("speedbumps-voice-hint-shown")) {
          localStorage.setItem("speedbumps-voice-hint-shown", "true");
          toast("Voice guidance is on — keep your screen on. On iPhone, the silent switch mutes voice.", {
            duration: 6000,
          });
        }
      } catch {
        // storage unavailable — skip the hint
      }
    }
    routing.startNavigation();
  }, [routing, location]);

  // Keep map controls above whichever sheet is open
  // Full screen takes the route sheet down with the rest of the chrome; the
  // full-screen button is the way back, and it brings the sheet with it.
  const routeSheetVisible = hasRoute && !routing.isNavigating && !isImmersive;
  const snapToPx = (s: number | string | null): number => {
    if (typeof s === "string") return parseInt(s, 10) || 0;
    if (typeof s === "number") return Math.round(s * viewportH);
    return 0;
  };
  const controlsBottom = isImmersive ? 32 : routeSheetVisible ? snapToPx(routeSnap) + 16 : 128;
  const controlsHidden =
    (!isImmersive && routeSheetVisible && typeof routeSnap === "number" && routeSnap >= 0.8) ||
    activeTab !== "explore" ||
    routing.isNavigating;

  /**
   * Full screen is all or nothing: every overlay off, the route sheet tucked to
   * its handle, the controls on the floor. Half-hiding the chrome is what made
   * the button feel like it hadn't done anything.
   */
  const setImmersive = useCallback((next: boolean) => {
    setIsImmersive(next);
    if (next) setRouteSnap(ROUTE_SHEET_SNAP_POINTS[0]);
    else setRouteSnap(ROUTE_SHEET_SNAP_POINTS[1]);
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#07090A]">
      {/* Map */}
      <LeafletMap
        className={`w-full h-full${currentProviderId === "nocturne" ? " nv-map" : ""}`}
        onClick={handleMapClick}
        onMouseMove={handleMapMouseMove}
        cursorStyle={isSelectingPOILocation || isSelectingReportLocation || isPickingDestination ? "crosshair" : "grab"}
      >
        <LeafletTileLayer
          url={tileLayerProps.url}
          attribution={tileLayerProps.attribution}
          maxZoom={tileLayerProps.maxZoom}
          maxNativeZoom={tileLayerProps.maxNativeZoom}
        />
        {/* SpeedBumps logic (map-context-dependent) */}
        <SpeedBumpsMap
          location={location}
          isFollowing={isFollowing}
          onUserPan={() => setIsFollowing(false)}
          bottomInset={routeSheetVisible ? snapToPx(routeSnap) : 0}
        />
      </LeafletMap>

      {/* === TOP NAV BAR — startup splash only, fades once the app is in use === */}
      <AnimatePresence>
        {!routing.isNavigating && showBrand && !isImmersive && (
          <motion.nav
            key="brand-nav"
            variants={hudTopVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed top-0 w-full z-[1002] flex justify-between items-center px-6 py-4 bg-transparent pt-[env(safe-area-inset-top)]"
          >
            <div className="leading-none">
              <h1 className="mast mast-2 text-[#E6EAF0]">Speed</h1>
              <h1 className="mast mast-2 text-[#5B6E7F] -mt-1">Bumps</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => handleTabChange(activeTab === "profile" ? "explore" : "profile")}
                className="w-10 h-10 rounded-full nv-hairline overflow-hidden active:scale-95 transition-transform"
                aria-label="Open profile"
              >
                <div className="w-full h-full flex items-center justify-center mono-bar text-[#B6BECB]">
                  {profile.displayName.charAt(0).toUpperCase() || "P"}
                </div>
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Active navigation bar — replaces top bar when navigating */}
      {routing.isNavigating && selectedRoute && (
        <NavigationBar
          steps={selectedRoute.steps}
          currentLocation={location?.position ?? null}
          onEndNavigation={routing.stopNavigation}
          routePoints={selectedRoute.polylinePoints}
          totalDistanceMeters={selectedRoute.distanceMeters}
          totalDurationSeconds={selectedRoute.durationSeconds}
          speedBumps={selectedRoute.bumpsOnRoute}
          gpsAccuracy={location?.accuracy ?? null}
          speedMps={location?.speed ?? null}
          onReportBump={() => handleTabChange("reports")}
        />
      )}

      {/* Recenter — appears when the user pans away during navigation */}
      {routing.isNavigating && !isFollowing && (
        <button
          onClick={() => setIsFollowing(true)}
          className="fixed bottom-40 left-1/2 -translate-x-1/2 z-[1100] flex items-center gap-2 px-5 py-2.5 rounded-full nv-glass mono-bar text-[#E6EAF0] active:scale-95 transition-all"
          aria-label="Recenter on my location"
        >
          <LocateFixed className="w-4 h-4" />
          Recenter
        </button>
      )}

      {/* Search / Route bar — Nocturne glass style. Stays put (stable);
          hidden only in opt-in immersive mode */}
      <AnimatePresence>
        {!routing.isNavigating && !isImmersive && (
          <motion.div
            key="search-route-bar"
            variants={hudTopVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute left-0 right-0 sm:left-6 sm:right-auto top-[calc(5rem+env(safe-area-inset-top))] z-[1050] px-4 sm:px-0"
          >
            <div className="flex items-center gap-3">
            <div className="flex items-center gap-3 nv-glass px-5 py-4 rounded-full w-full sm:w-[380px]">
              {hasRoute ? (
                <>
                  <button
                    onClick={() => setIsRoutePlanningOpen(true)}
                    className="flex items-center gap-2 flex-1 text-left min-w-0"
                    aria-label="Edit route"
                  >
                    <Navigation className="w-5 h-5 text-[#B6BECB] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="ui-text text-[#E6EAF0] truncate">
                        {routing.originLabel} → {routing.destinationLabel}
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => setIsRoutePlanningOpen(true)}
                    className="p-1.5 hover:bg-[#0C1416] rounded-full shrink-0 transition-colors"
                    aria-label="Edit route"
                  >
                    <Pencil className="w-3.5 h-3.5 text-[#5B6E7F]" />
                  </button>
                  <button
                    onClick={() => { routing.clearRoute(); setIsRoutePlanningOpen(false); }}
                    className="p-1.5 hover:bg-[#0C1416] rounded-full shrink-0 transition-colors"
                    aria-label="Clear route"
                  >
                    <X className="w-4 h-4 text-[#5B6E7F]" />
                  </button>
                </>
              ) : routing.status === "loading" ? (
                <div className="flex items-center gap-3 flex-1 min-w-0 py-0.5">
                  <Skeleton className="w-5 h-5 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-52 max-w-full" />
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsRoutePlanningOpen(true)}
                  className="flex items-center gap-3 flex-1 text-left"
                  aria-label="Plan route"
                >
                  <svg className="w-5 h-5 text-[#5B6E7F] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <span className="mast mast-4 text-[#B6BECB] flex-1">
                    Where to
                  </span>
                  <svg className="w-5 h-5 text-[#5B6E7F] shrink-0" viewBox="0 0 24 24" fill="currentColor">
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
                className="w-11 h-11 shrink-0 rounded-full nv-glass overflow-hidden active:scale-95 transition-transform animate-in fade-in duration-500"
                aria-label="Open profile"
              >
                <div className="w-full h-full flex items-center justify-center mono-bar text-[#B6BECB]">
                  {profile.displayName.charAt(0).toUpperCase() || "P"}
                </div>
              </button>
            )}
            </div>
            {!hasRoute && nearbyBumps !== null && (
              <p className="caption mt-3 pl-5 sm:pl-2">
                {nearbyBumps} bump{nearbyBumps === 1 ? '' : 's'} within 1 mi.
              </p>
            )}
            <AnimatePresence>
              {routing.status === "error" && routing.error && !routeErrorDismissed && (
                <motion.div
                  key="route-error"
                  variants={fadeScaleVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="mt-2 px-4 py-3 rounded-xl nv-glass ui-sm text-[#FF3D8E] flex items-start justify-between gap-2"
                >
                  <span className="flex-1">{routing.error}</span>
                  <button
                    type="button"
                    onClick={() => setRouteErrorDismissed(true)}
                    className="p-0.5 rounded-full hover:bg-[#FF3D8E]/10 shrink-0"
                    aria-label="Dismiss route error"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Location tracking badge — Nocturne style */}
      <AnimatePresence>
        {!isImmersive && locationError && (
          <motion.button
            key="location-error"
            type="button"
            variants={fadeScaleVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={() => startTracking(routing.isNavigating)}
            className="absolute top-[calc(4.5rem+env(safe-area-inset-top))] right-4 z-[1050] px-3 py-2 nv-glass kicker text-[#FF3D8E] rounded-full flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <LocateFixed className="w-3 h-3" />
            GPS error — tap to retry
          </motion.button>
        )}
        {!isImmersive && !locationError && !isTracking && (
          <motion.div
            key="location-off"
            variants={fadeScaleVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute top-[calc(4.5rem+env(safe-area-inset-top))] right-4 z-[1050] px-3 py-2 nv-glass kicker rounded-full"
          >
            Location off
          </motion.div>
        )}
        {!isImmersive && !locationError && isTracking && location && location.accuracy > 20 && (
          <motion.div
            key="location-weak"
            variants={fadeScaleVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute top-[calc(4.5rem+env(safe-area-inset-top))] right-4 z-[1050] px-3 py-2 nv-glass kicker rounded-full"
          >
            GPS: {Math.round(location.accuracy)}m
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drop-a-pin prompt — type on the map, nothing boxed */}
      <AnimatePresence>
        {isPickingDestination && (
          <motion.div
            key="pick-destination"
            variants={fadeScaleVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="nv-frame fixed left-5 right-5 top-[calc(env(safe-area-inset-top)+1.5rem)] z-[1100] flex items-start justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="mast mast-2 text-[#E6EAF0]">Tap the block</p>
              <p className="caption mt-2">we&rsquo;ll name it for you.</p>
            </div>
            <button
              onClick={() => { setIsPickingDestination(false); setIsRoutePlanningOpen(true); }}
              className="mono-bar text-[#5B6E7F] hover:text-[#E6EAF0] shrink-0 pt-1 transition-colors"
            >
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tile Switcher */}
      {!routing.isNavigating && !isImmersive && (
        <MapTileSwitcher
          selectedProviderId={currentProviderId}
          onProviderChange={setProviderId}
          bottomOffset={controlsBottom}
        />
      )}

      {/* Map Controls */}
      <MapControls
        bottomOffset={controlsBottom}
        hidden={controlsHidden}
        isImmersive={isImmersive}
        onImmersiveChange={setImmersive}
      />

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
        onRouteHere={handleRouteHere}
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
        onClose={() => { setIsRoutePlanningOpen(false); setRouteHereDestination(null); }}
        userLocation={location?.position}
        onPlanRoute={handlePlanRoute}
        initialDestLabel={routing.destinationLabel}
        initialProfile={routing.avoidanceProfile}
        initialDestination={routeHereDestination}
        recentDestinations={recents}
        onRemoveRecent={removeRecent}
        locationPermission={hasPermission}
        locationError={locationError}
        getMapCenter={getMapCenter}
        onDropPin={() => { setIsRoutePlanningOpen(false); setIsPickingDestination(true); }}
      />

      {/* Route Result Card — hidden during active navigation and in full screen */}
      {routeSheetVisible && routing.result && (
        <RouteResultCard
          result={routing.result}
          selectedRouteIndex={routing.selectedRouteIndex}
          onToggleRoute={routing.toggleRoute}
          onClearRoute={() => { routing.clearRoute(); }}
          onStartNavigation={handleStartNavigation}
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
        isLoaded={isProfileLoaded}
      />

      {/* === BOTTOM NAVIGATION BAR (Nocturne shared component) === */}
      {!routing.isNavigating && !isImmersive && (
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
