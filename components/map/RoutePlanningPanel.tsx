'use client';

/**
 * Route planning panel — Velocity Dark slide-up sheet.
 * Matches the route_planner stitch: dark bottom sheet with glassmorphism,
 * vehicle selector pills, routing strategy cards, and gradient CTA.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MapPin, Navigation, X, Loader2, ArrowUpDown, History, Trash2, Store, Home, Route as RouteIcon } from 'lucide-react';
import { sheetVariants, scrimVariants, fadeScaleVariants } from '@/lib/motion';
import { Skeleton } from '@/components/ui/skeleton';
import { searchAddress } from '@/lib/nominatim-service';
import { haversineDistance, formatDistance } from '@/lib/geo-utils';
import type { GeocodingResult, LatLng, RouteAvoidanceProfile, VehicleProfile, RoutePreferenceMode } from '@/types/speedbumps';
import type { RecentDestination } from '@/types/user-data';

export interface PlanRouteRequest {
  origin: LatLng;
  destination: LatLng;
  originLabel: string;
  destinationLabel: string;
  profile: RouteAvoidanceProfile;
  /** Origin is the live GPS position ("My Location"). */
  originIsCurrentLocation: boolean;
  /** The geocoded destination as chosen, for the recents list. */
  destinationResult: GeocodingResult;
}

interface RoutePlanningPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation?: LatLng | null;
  onPlanRoute: (request: PlanRouteRequest) => void;
  /** Pre-fill the destination label when re-opening after a route is active */
  initialDestLabel?: string;
  /** Pre-select vehicle/mode (e.g. the profile's defaults) on open */
  initialProfile?: RouteAvoidanceProfile;
  /** Pre-selected destination (e.g. "Route here" from the map). Takes precedence over the label. */
  initialDestination?: GeocodingResult | null;
  recentDestinations?: RecentDestination[];
  onRemoveRecent?: (result: GeocodingResult) => void;
  /** From useLocationTracking: false = denied. */
  locationPermission?: boolean | null;
  /** From useLocationTracking, e.g. "Location permission denied". */
  locationError?: string | null;
  /** Search bias when there's no GPS fix (the visible map center). */
  getMapCenter?: () => LatLng | null;
}

export const VEHICLE_OPTIONS: { id: VehicleProfile; label: string; emoji: string }[] = [
  { id: 'sedan', label: 'Sedan', emoji: '🚗' },
  { id: 'suv', label: 'SUV', emoji: '🚙' },
  { id: 'lowered', label: 'Lowered', emoji: '🏎️' },
  { id: 'motorcycle', label: 'Motorcycle', emoji: '🏍️' },
  { id: 'bicycle', label: 'Bicycle', emoji: '🚲' },
];

export const MODE_OPTIONS: { id: RoutePreferenceMode; label: string; description: string; icon: string }[] = [
  { id: 'smoothRide', label: 'Smooth Ride', description: 'Detour up to ~60% longer to dodge bumps', icon: '🛣️' },
  { id: 'balanced', label: 'Balanced', description: 'Detour up to ~25% longer for fewer bumps', icon: '⚖️' },
  { id: 'fastest', label: 'Fastest', description: 'Quickest route — bumps shown, not avoided', icon: '⚡' },
];

const MY_LOCATION_LABEL = 'My Location';
const SEARCH_DEBOUNCE_MS = 250;
// Give up on "Locating…" and let the user type a start address after this long
const LOCATE_TIMEOUT_MS = 8000;

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Arrow-key movement through a suggestion list; -1 means nothing highlighted. */
function nextActiveIndex(key: string, current: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'ArrowDown') return current + 1 >= count ? 0 : current + 1;
  if (key === 'ArrowUp') return current <= 0 ? count - 1 : current - 1;
  return null;
}

export function RoutePlanningPanel({
  isOpen,
  onClose,
  userLocation,
  onPlanRoute,
  initialDestLabel,
  initialProfile,
  initialDestination,
  recentDestinations = [],
  onRemoveRecent,
  locationPermission = null,
  locationError = null,
  getMapCenter,
}: RoutePlanningPanelProps) {
  const [useMyLocation, setUseMyLocation] = useState(true);
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [originResults, setOriginResults] = useState<GeocodingResult[]>([]);
  const [destResults, setDestResults] = useState<GeocodingResult[]>([]);
  const [originLoading, setOriginLoading] = useState(false);
  const [destLoading, setDestLoading] = useState(false);
  const [selectedOrigin, setSelectedOrigin] = useState<GeocodingResult | null>(null);
  const [selectedDest, setSelectedDest] = useState<GeocodingResult | null>(null);
  const [vehicle, setVehicle] = useState<VehicleProfile>('sedan');
  const [mode, setMode] = useState<RoutePreferenceMode>('balanced');
  const [destFocused, setDestFocused] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [originActive, setOriginActive] = useState(-1);
  const [destActive, setDestActive] = useState(-1);
  // The query the current results belong to — results stay visible while the next search loads,
  // so Enter must not pick a suggestion for text the user has since changed
  const [originResultsFor, setOriginResultsFor] = useState('');
  const [destResultsFor, setDestResultsFor] = useState('');
  const [locateTimedOut, setLocateTimedOut] = useState(false);
  // GPS updates constantly — read it through a ref so it doesn't re-trigger searches
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const getMapCenterRef = useRef(getMapCenter);
  getMapCenterRef.current = getMapCenter;
  /** Bias searches toward the user, or toward what's on screen when GPS isn't available. */
  const searchBias = () => userLocationRef.current ?? getMapCenterRef.current?.() ?? null;
  const destInputRef = useRef<HTMLInputElement>(null);
  const originInputRef = useRef<HTMLInputElement>(null);
  // Tracks whether the current destQuery is the pre-filled hint (no autocomplete until user edits)
  const destIsPrefillRef = useRef(false);

  // Reset on open — snapshot initial values at open time only (not on every re-render)
  const initialDestLabelRef = useRef(initialDestLabel);
  const initialProfileRef = useRef(initialProfile);
  const initialDestinationRef = useRef(initialDestination);
  initialProfileRef.current = initialProfile;
  initialDestinationRef.current = initialDestination;
  useEffect(() => {
    if (isOpen) {
      initialDestLabelRef.current = initialDestLabel;
      setVehicle(initialProfileRef.current?.vehicle ?? 'sedan');
      setMode(initialProfileRef.current?.mode ?? 'balanced');
      setUseMyLocation(true);
      setLocateTimedOut(false);
      setOriginQuery('');
      setSelectedOrigin(null);
      setOriginResults([]);
      setDestResults([]);
      setSearchError(null);
      const preset = initialDestinationRef.current;
      if (preset) {
        setSelectedDest(preset);
        setDestQuery('');
        destIsPrefillRef.current = false;
      } else {
        setSelectedDest(null);
        const prefill = initialDestLabelRef.current ?? '';
        destIsPrefillRef.current = prefill !== '';
        setDestQuery(prefill);
        // Unless the origin field already took focus (location unavailable)
        setTimeout(() => {
          if (!(document.activeElement instanceof HTMLInputElement)) destInputRef.current?.focus();
        }, 200);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // intentionally omit initial* — snapshot on open only

  // No fix within LOCATE_TIMEOUT_MS of opening: stop waiting on GPS
  const hasFix = !!userLocation;
  useEffect(() => {
    if (!isOpen || hasFix) return;
    const timer = setTimeout(() => setLocateTimedOut(true), LOCATE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isOpen, hasFix]);

  const originStatus: 'ready' | 'locating' | 'unavailable' = hasFix
    ? 'ready'
    : locationPermission === false || locationError || locateTimedOut
      ? 'unavailable'
      : 'locating';

  // Location unavailable: switch the origin to a typed address instead of spinning forever
  useEffect(() => {
    if (!isOpen || originStatus !== 'unavailable' || !useMyLocation) return;
    setUseMyLocation(false);
    // Don't steal focus from the destination field if the user is typing there
    setTimeout(() => {
      if (!(document.activeElement instanceof HTMLInputElement)) originInputRef.current?.focus();
    }, 50);
  }, [isOpen, originStatus, useMyLocation]);

  // Debounced origin search
  useEffect(() => {
    if (useMyLocation || !originQuery.trim()) {
      setOriginResults([]);
      setOriginLoading(false);
      return;
    }
    setOriginLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = await searchAddress(originQuery, { near: searchBias(), signal: controller.signal });
        setOriginResults(results);
        setOriginResultsFor(originQuery.trim());
        setOriginActive(-1);
        setSearchError(null);
      } catch (err) {
        if (isAbortError(err)) return;
        setOriginResults([]);
        setOriginResultsFor('');
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      }
      setOriginLoading(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [originQuery, useMyLocation]);

  // Debounced destination search — suppressed while destQuery is the pre-filled hint
  useEffect(() => {
    if (!destQuery.trim() || destIsPrefillRef.current) {
      setDestResults([]);
      setDestLoading(false);
      return;
    }
    // Don't clear existing results immediately — keep them visible while the next search loads
    setDestLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const results = await searchAddress(destQuery, { near: searchBias(), signal: controller.signal });
        setDestResults(results);
        setDestResultsFor(destQuery.trim());
        setDestActive(-1);
        setSearchError(null);
      } catch (err) {
        if (isAbortError(err)) return;
        setDestResults([]);
        setDestResultsFor('');
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      }
      setDestLoading(false);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [destQuery]);

  const handlePlanRoute = useCallback(() => {
    const origin = useMyLocation ? userLocation : selectedOrigin?.location;
    if (!origin || !selectedDest) return;

    const originLabel = useMyLocation ? MY_LOCATION_LABEL : (selectedOrigin?.shortName ?? 'Origin');
    const destLabel = selectedDest.shortName || 'Destination';

    onPlanRoute({
      origin,
      destination: selectedDest.location,
      originLabel,
      destinationLabel: destLabel,
      profile: { mode, vehicle },
      originIsCurrentLocation: useMyLocation,
      destinationResult: selectedDest,
    });
    onClose();
  }, [useMyLocation, userLocation, selectedOrigin, selectedDest, mode, vehicle, onPlanRoute, onClose]);

  /**
   * Enter in the destination field: take the top suggestion, or geocode the
   * raw text right away if suggestions haven't loaded yet.
   */
  const commitDestFromKeyboard = useCallback(async () => {
    if (selectedDest) return;
    const q = destQuery.trim();
    if (!q) return;
    if (destResults.length > 0 && destResultsFor === q) {
      setSelectedDest(destResults[Math.max(destActive, 0)]);
      setDestQuery('');
      setDestResults([]);
      return;
    }
    setDestLoading(true);
    try {
      const results = await searchAddress(q, { near: searchBias() });
      if (results.length > 0) {
        setSelectedDest(results[0]);
        setDestQuery('');
        setDestResults([]);
      } else {
        setSearchError(`No matches for "${q}" — check the spelling or add a city or ZIP`);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setDestLoading(false);
    }
  }, [selectedDest, destResults, destResultsFor, destActive, destQuery]);

  const commitOriginFromKeyboard = useCallback(async () => {
    if (selectedOrigin) return;
    const q = originQuery.trim();
    if (!q) return;
    if (originResults.length > 0 && originResultsFor === q) {
      setSelectedOrigin(originResults[Math.max(originActive, 0)]);
      setOriginQuery('');
      setOriginResults([]);
      return;
    }
    setOriginLoading(true);
    try {
      const results = await searchAddress(q, { near: searchBias() });
      if (results.length > 0) {
        setSelectedOrigin(results[0]);
        setOriginQuery('');
        setOriginResults([]);
      } else {
        setSearchError(`No matches for "${q}" — check the spelling or add a city or ZIP`);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setOriginLoading(false);
    }
  }, [selectedOrigin, originResults, originResultsFor, originActive, originQuery]);

  /** Swap origin and destination. "My Location" becomes a concrete point when swapped. */
  const handleSwap = useCallback(() => {
    const originAsResult: GeocodingResult | null = useMyLocation
      ? userLocation
        ? { displayName: MY_LOCATION_LABEL, shortName: MY_LOCATION_LABEL, location: userLocation }
        : null
      : selectedOrigin;
    const destAsResult = selectedDest;

    setUseMyLocation(false);
    setSelectedOrigin(destAsResult);
    setSelectedDest(originAsResult);
    setOriginQuery('');
    setDestQuery('');
    setOriginResults([]);
    setDestResults([]);
    destIsPrefillRef.current = false;
  }, [useMyLocation, userLocation, selectedOrigin, selectedDest]);

  const NO_MATCHES_HINT = 'No matches yet — try adding a city or ZIP';
  const originNoMatches =
    !originLoading && originQuery.trim() !== '' && originResults.length === 0 && originResultsFor === originQuery.trim();
  const destNoMatches =
    !destLoading && destQuery.trim() !== '' && destResults.length === 0 && destResultsFor === destQuery.trim();

  const canSwap = !!selectedDest || (!useMyLocation && !!selectedOrigin);
  const canPlanRoute =
    (useMyLocation ? !!userLocation : !!selectedOrigin) && !!selectedDest;

  const showRecents =
    !selectedDest &&
    destFocused &&
    !destQuery.trim() &&
    destResults.length === 0 &&
    recentDestinations.length > 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="absolute inset-0 z-[1100] flex items-end pointer-events-none">
          {/* Backdrop scrim */}
          <motion.div
            key="planner-scrim"
            variants={scrimVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={onClose}
            className="absolute inset-0 bg-black/50 pointer-events-auto backdrop-blur-[2px]"
          />

          <motion.div
            key="planner-sheet"
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="relative pointer-events-auto w-full max-w-2xl mx-auto bg-sb-surface-container-low rounded-t-[24px] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto hide-scrollbar pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="w-12 h-1.5 bg-[#89919d]/70 rounded-full mx-auto mt-3 mb-6" />

            {/* Header */}
            <div className="flex justify-between items-center px-6 mb-8">
              <h2 className="font-[var(--font-headline)] text-2xl font-bold tracking-tight text-[#e2e2eb]">Plan Route</h2>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-[#33343b] transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-[#bfc7d4]" />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-8">
          {/* Search Fields */}
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 space-y-4">
              {/* FROM Field */}
              {useMyLocation ? (
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Navigation className="w-5 h-5 text-[#3ce36a]" />
                  </div>
                  <input
                    className="w-full h-14 bg-[#00a844]/10 border-none rounded-2xl pl-12 pr-20 font-semibold text-[#3ce36a] focus:ring-2 focus:ring-[#3ce36a]"
                    readOnly
                    type="text"
                    value={originStatus === 'ready' ? MY_LOCATION_LABEL : 'Locating…'}
                  />
                  {originStatus === 'locating' && (
                    <Loader2 className="absolute right-20 top-1/2 -translate-y-1/2 w-4 h-4 text-[#3ce36a]/70 animate-spin" />
                  )}
                  <button
                    onClick={() => {
                      setUseMyLocation(false);
                      setTimeout(() => originInputRef.current?.focus(), 50);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-[#89919d] hover:text-[#e2e2eb]"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <Navigation className="w-5 h-5 text-[#3ce36a]" />
                  </div>
                  <input
                    ref={originInputRef}
                    type="text"
                    value={selectedOrigin ? selectedOrigin.shortName : originQuery}
                    onChange={(e) => {
                      setSelectedOrigin(null);
                      setOriginQuery(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      const next = nextActiveIndex(e.key, originActive, originResults.length);
                      if (next !== null) {
                        e.preventDefault();
                        setOriginActive(next);
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                        commitOriginFromKeyboard();
                      }
                    }}
                    placeholder={originStatus === 'unavailable' ? 'Location unavailable — type a start address' : 'Address, store, or place'}
                    className="w-full h-14 bg-[#282a30] border-none rounded-2xl pl-12 pr-10 font-medium text-[#e2e2eb] placeholder:text-[#89919d] focus:ring-2 focus:ring-[#9ecaff]"
                  />
                  {originLoading && (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#89919d] animate-spin" />
                  )}
                  {selectedOrigin && !originLoading && (
                    <button
                      onClick={() => { setSelectedOrigin(null); setOriginQuery(''); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#89919d] hover:text-[#e2e2eb]"
                      aria-label="Clear origin"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {(originResults.length > 0 || originNoMatches) && !selectedOrigin && (
                    <AddressDropdown
                      results={originResults}
                      isLoading={originLoading}
                      emptyMessage={originNoMatches ? NO_MATCHES_HINT : undefined}
                      activeIndex={originActive}
                      userLocation={userLocation}
                      onSelect={(r) => { setSelectedOrigin(r); setOriginQuery(''); setOriginResults([]); }}
                    />
                  )}
                  {originStatus === 'unavailable' ? (
                    !selectedOrigin && (
                      <p className="mt-1 px-1 text-xs text-[#89919d]">
                        {locationError ?? 'GPS hasn’t found you yet'}
                      </p>
                    )
                  ) : (
                    // A late GPS fix is offered, never forced over a typed origin
                    <button
                      onClick={() => setUseMyLocation(true)}
                      className="mt-1 text-xs text-[#2196F3] hover:underline"
                    >
                      Use my location
                    </button>
                  )}
                </div>
              )}

              {/* TO Field */}
              <div className="relative mt-2">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <MapPin className="w-5 h-5 text-[#ffb4ab]" />
                </div>
                <input
                  ref={destInputRef}
                  type="text"
                  value={selectedDest ? selectedDest.shortName : destQuery}
                  onChange={(e) => {
                    setSelectedDest(null);
                    destIsPrefillRef.current = false;
                    setDestQuery(e.target.value);
                  }}
                  onFocus={() => setDestFocused(true)}
                  onBlur={() => setTimeout(() => setDestFocused(false), 150)}
                  onKeyDown={(e) => {
                    const next = selectedDest ? null : nextActiveIndex(e.key, destActive, destResults.length);
                    if (next !== null) {
                      e.preventDefault();
                      setDestActive(next);
                    } else if (e.key === 'Enter') {
                      e.preventDefault();
                      if (selectedDest && canPlanRoute) handlePlanRoute();
                      else commitDestFromKeyboard();
                    }
                  }}
                  enterKeyHint="search"
                  placeholder="Search an address, store, or place"
                  className="w-full h-14 bg-[#282a30] border-none rounded-2xl pl-12 pr-10 font-medium text-[#e2e2eb] placeholder:text-[#89919d]/50 focus:ring-2 focus:ring-[#9ecaff]"
                />
                {destLoading && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#89919d] animate-spin" />
                )}
                {selectedDest && !destLoading && (
                  <button
                    onClick={() => { setSelectedDest(null); setDestQuery(''); setTimeout(() => destInputRef.current?.focus(), 50); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#89919d] hover:text-[#e2e2eb]"
                    aria-label="Clear destination"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {(destResults.length > 0 || destLoading || destNoMatches) && !selectedDest && (
                  <AddressDropdown
                    results={destResults}
                    isLoading={destLoading}
                    emptyMessage={destNoMatches ? NO_MATCHES_HINT : undefined}
                    activeIndex={destActive}
                    userLocation={userLocation}
                    onSelect={(r) => { setSelectedDest(r); setDestQuery(''); setDestResults([]); }}
                  />
                )}
                {showRecents && (
                  <RecentsDropdown
                    recents={recentDestinations}
                    onSelect={(r) => { setSelectedDest(r); setDestQuery(''); setDestResults([]); }}
                    onRemove={onRemoveRecent}
                  />
                )}
              </div>
            </div>

            {/* Swap */}
            <button
              onClick={handleSwap}
              disabled={!canSwap}
              className="self-center w-11 h-11 shrink-0 rounded-full bg-[#282a30] text-[#bfc7d4] flex items-center justify-center hover:bg-[#33343b] hover:text-[#e2e2eb] active:scale-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Swap origin and destination"
              title="Swap"
            >
              <ArrowUpDown className="w-5 h-5" />
            </button>
          </div>

          <AnimatePresence>
            {searchError && (
              <motion.div
                key="search-error"
                variants={fadeScaleVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
                className="-mt-4 px-4 py-2.5 bg-[#93000a]/30 text-[#ffb4ab] text-xs rounded-xl flex items-start justify-between gap-2"
              >
                <span className="flex-1">{searchError}</span>
                <button
                  type="button"
                  onClick={() => setSearchError(null)}
                  className="p-0.5 rounded-full hover:bg-[#ffb4ab]/10 shrink-0"
                  aria-label="Dismiss search error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Vehicle Profile */}
          <div>
            <label className="block font-[var(--font-headline)] text-xs font-bold uppercase tracking-widest text-[#bfc7d4] mb-4 px-1">
              Vehicle Profile
            </label>
            <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
              {VEHICLE_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVehicle(v.id)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full whitespace-nowrap transition-all active:scale-95 duration-150 ${
                    vehicle === v.id
                      ? 'bg-[#9ecaff] text-[#003258] shadow-lg shadow-[#9ecaff]/20'
                      : 'bg-[#33343b] text-[#e2e2eb] hover:bg-[#373940]'
                  }`}
                >
                  <span>{v.emoji}</span>
                  <span className="font-bold text-sm">{v.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Route Preferences */}
          <div className="space-y-3">
            <label className="block font-[var(--font-headline)] text-xs font-bold uppercase tracking-widest text-[#bfc7d4] mb-4 px-1">
              Routing Strategy
            </label>
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all ${
                  mode === m.id
                    ? 'bg-[#2196F3]/10 border-2 border-[#2196F3] shadow-xl shadow-[#2196F3]/5'
                    : 'bg-[#282a30] border border-transparent hover:border-[#404752]/30'
                }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                    mode === m.id ? 'bg-[#2196F3]' : 'bg-[#33343b]'
                  }`}>
                    {m.icon}
                  </div>
                  <div className="text-left">
                    <h4 className={`font-bold ${mode === m.id ? 'text-[#9ecaff]' : 'text-[#e2e2eb]'}`}>
                      {m.label}
                    </h4>
                    <p className={`text-sm ${mode === m.id ? 'text-[#9ecaff]/70' : 'text-[#bfc7d4]'}`}>
                      {m.description}
                    </p>
                  </div>
                </div>
                {mode === m.id ? (
                  <svg className="w-6 h-6 text-[#9ecaff]" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>
                ) : (
                  <svg className="w-6 h-6 text-[#404752]/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                )}
              </button>
            ))}
          </div>

          {/* Main CTA — Gradient button */}
          <button
            onClick={handlePlanRoute}
            disabled={!canPlanRoute}
            className="w-full h-14 bg-gradient-to-r from-[#2196F3] to-[#00BCD4] rounded-full font-[var(--font-headline)] text-lg font-extrabold text-white shadow-xl shadow-[#00BCD4]/20 flex items-center justify-center gap-3 active:scale-95 transition-transform duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Find Route
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>
          </button>
        </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

const KIND_ICONS = {
  place: Store,
  address: Home,
  street: RouteIcon,
  area: MapPin,
} as const;

function AddressDropdown({
  results,
  isLoading,
  activeIndex,
  userLocation,
  emptyMessage,
  onSelect,
}: {
  results: GeocodingResult[];
  isLoading: boolean;
  activeIndex: number;
  userLocation?: LatLng | null;
  /** Shown when a finished search came back empty. */
  emptyMessage?: string;
  onSelect: (r: GeocodingResult) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (activeIndex < 0) return;
    listRef.current?.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (results.length === 0 && !isLoading && !emptyMessage) return null;
  if (results.length === 0 && !isLoading) {
    return (
      <div className="absolute left-0 right-0 top-full mt-1 bg-[#1e1f26] border border-[#404752]/20 rounded-2xl shadow-lg z-50 px-4 py-3 text-sm text-[#89919d]">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div
      ref={listRef}
      role="listbox"
      className="absolute left-0 right-0 top-full mt-1 bg-[#1e1f26] border border-[#404752]/20 rounded-2xl shadow-lg z-50 max-h-72 overflow-y-auto hide-scrollbar"
    >
      {results.map((r, i) => {
        const Icon = KIND_ICONS[r.kind ?? 'area'];
        const distance = userLocation ? formatDistance(haversineDistance(userLocation, r.location)) : null;
        return (
          <button
            key={`${r.shortName}-${r.location.lat}-${r.location.lng}`}
            role="option"
            aria-selected={i === activeIndex}
            // onMouseDown + preventDefault keeps input focused and prevents blur
            // firing before onClick on mobile, which would dismiss the dropdown
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(r)}
            className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#373940] transition-colors ${
              i === activeIndex ? 'bg-[#373940]' : ''
            }`}
          >
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${r.kind === 'place' ? 'text-[#9ecaff]' : 'text-[#89919d]'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-[#e2e2eb] truncate">{r.shortName}</span>
                {r.category && (
                  <span className="text-[11px] text-[#9ecaff]/80 whitespace-nowrap">{r.category}</span>
                )}
                {r.approximate && (
                  <span
                    className="text-[10px] leading-4 px-1.5 rounded-full border border-[#404752]/60 text-[#89919d] whitespace-nowrap"
                    title="Pinned at the nearest known address"
                  >
                    approx.
                  </span>
                )}
              </div>
              {r.displayName && <div className="text-xs text-[#89919d] truncate">{r.displayName}</div>}
            </div>
            {distance && (
              <span className="text-[11px] text-[#89919d] whitespace-nowrap mt-0.5 tabular-nums">{distance}</span>
            )}
          </button>
        );
      })}
      {isLoading && results.length === 0 && (
        <div className="px-4 py-2 space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-3 py-2">
              <Skeleton className="w-4 h-4 rounded mt-0.5 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecentsDropdown({
  recents,
  onSelect,
  onRemove,
}: {
  recents: RecentDestination[];
  onSelect: (r: GeocodingResult) => void;
  onRemove?: (r: GeocodingResult) => void;
}) {
  return (
    <div className="absolute left-0 right-0 top-full mt-1 bg-[#1e1f26] border border-[#404752]/20 rounded-2xl shadow-lg z-50 max-h-56 overflow-y-auto hide-scrollbar">
      <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#89919d]">Recent</div>
      {recents.map((r, i) => (
        <div key={i} className="flex items-center hover:bg-[#373940] transition-colors">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(r)}
            className="flex-1 flex items-start gap-3 px-4 py-3 text-left min-w-0"
          >
            <History className="w-4 h-4 text-[#89919d] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-[#e2e2eb] truncate">{r.shortName}</div>
              <div className="text-xs text-[#89919d] truncate">{r.displayName}</div>
            </div>
          </button>
          {onRemove && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onRemove(r)}
              className="p-3 mr-1 text-[#89919d] hover:text-[#ffb4ab] shrink-0"
              aria-label={`Remove ${r.shortName} from recents`}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
