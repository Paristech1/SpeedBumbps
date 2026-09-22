'use client';

/**
 * Route planning panel — Nocturne slide-up sheet.
 * Matches the route_planner stitch: dark bottom sheet with glassmorphism,
 * vehicle selector pills, routing strategy cards, and gradient CTA.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Loader2, ArrowUpDown, History, Trash2 } from 'lucide-react';
import { sheetVariants, scrimVariants, fadeScaleVariants } from '@/lib/motion';
import { Skeleton } from '@/components/ui/skeleton';
import { searchAddress } from '@/lib/nominatim-service';
import { haversineDistance, formatDistance } from '@/lib/geo-utils';
import type { GeocodingResult, LatLng, RouteAvoidanceProfile, VehicleProfile, RoutePreferenceMode } from '@/types/speedbumps';
import { resolveSearchCommit, resolveSearchOutcome } from '@/lib/search-commit';
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
  /** "Drop a pin" — hand the map over so the block can be tapped instead. */
  onDropPin?: () => void;
}

export const VEHICLE_OPTIONS: { id: VehicleProfile; label: string }[] = [
  { id: 'sedan', label: 'Sedan' },
  { id: 'suv', label: 'SUV' },
  { id: 'lowered', label: 'Lowered' },
  { id: 'motorcycle', label: 'Motorcycle' },
  { id: 'bicycle', label: 'Bicycle' },
];

export const MODE_OPTIONS: { id: RoutePreferenceMode; label: string; description: string }[] = [
  { id: 'smoothRide', label: 'Smooth Ride', description: 'Detour up to ~60% longer to dodge bumps' },
  { id: 'balanced', label: 'Balanced', description: 'Detour up to ~25% longer for fewer bumps' },
  { id: 'fastest', label: 'Fastest', description: 'Quickest route — bumps shown, not avoided' },
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
  onDropPin,
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
  /**
   * The autocomplete search each field has in the air — its debounce timer and
   * its fetch. Enter runs its own search and needs to call this one off, or it
   * lands afterwards and overwrites the results Enter just put on screen.
   */
  const pendingSearchRef = useRef<Record<'origin' | 'dest', { timer: ReturnType<typeof setTimeout>; controller: AbortController } | null>>({
    origin: null,
    dest: null,
  });

  function cancelPendingSearch(field: 'origin' | 'dest'): void {
    const pending = pendingSearchRef.current[field];
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.controller.abort();
    pendingSearchRef.current[field] = null;
  }
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
        if (controller.signal.aborted) return;
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
    // The ref object itself is stable; only its fields change.
    const pending = pendingSearchRef.current;
    pending.origin = { timer, controller };
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (pending.origin?.timer === timer) pending.origin = null;
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
        if (controller.signal.aborted) return;
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
    // The ref object itself is stable; only its fields change.
    const pending = pendingSearchRef.current;
    pending.dest = { timer, controller };
    return () => {
      clearTimeout(timer);
      controller.abort();
      if (pending.dest?.timer === timer) pending.dest = null;
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
   * Enter in a search field means: search for what I typed.
   *
   * It used to mean "take suggestion zero". activeIndex is -1 until the driver
   * presses an arrow key, and `Math.max(active, 0)` turned that -1 into 0, so
   * Enter committed whichever suggestion happened to be sitting at the top of
   * a list the driver had never touched — often a match for an earlier,
   * shorter version of what they were still typing.
   *
   * Now a suggestion is only taken when it was genuinely highlighted. Anything
   * else runs a fresh search for the exact text in the box. One match is taken;
   * several are put on screen with the first highlighted, so a second Enter
   * takes it — the driver sees what they're choosing instead of having it
   * chosen for them.
   */
  const commitFromKeyboard = useCallback(
    async (field: 'origin' | 'dest') => {
      const isDest = field === 'dest';
      const query = isDest ? destQuery : originQuery;
      const results = isDest ? destResults : originResults;
      const resultsFor = isDest ? destResultsFor : originResultsFor;
      const active = isDest ? destActive : originActive;

      const setResults = isDest ? setDestResults : setOriginResults;
      const setResultsFor = isDest ? setDestResultsFor : setOriginResultsFor;
      const setActive = isDest ? setDestActive : setOriginActive;
      const setLoading = isDest ? setDestLoading : setOriginLoading;
      const setQuery = isDest ? setDestQuery : setOriginQuery;
      const setSelected = isDest ? setSelectedDest : setSelectedOrigin;

      const choose = (result: GeocodingResult) => {
        setSelected(result);
        setQuery('');
        setResults([]);
        setActive(-1);
      };

      const commit = resolveSearchCommit({ query, results, resultsFor, activeIndex: active });
      if (commit.kind === 'none') return;
      if (commit.kind === 'choose') {
        choose(commit.result);
        return;
      }

      // Enter owns the search from here — the autocomplete's pending one would
      // otherwise land after it and wipe what Enter put on screen.
      cancelPendingSearch(field);

      setLoading(true);
      try {
        const fresh = await searchAddress(commit.query, { near: searchBias() });
        setResultsFor(commit.query);
        const outcome = resolveSearchOutcome(fresh, commit.query);
        if (outcome.kind === 'empty') {
          setResults([]);
          setSearchError(`No matches for "${commit.query}" — check the spelling or add a city or ZIP`);
          return;
        }
        setSearchError(null);
        if (outcome.kind === 'choose') {
          choose(outcome.result);
          return;
        }
        setResults(outcome.results);
        setActive(outcome.activeIndex); // a second Enter takes it
      } catch (err) {
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setLoading(false);
      }
    },
    [
      destQuery,
      originQuery,
      destResults,
      originResults,
      destResultsFor,
      originResultsFor,
      destActive,
      originActive,
    ],
  );

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

  /**
   * While a destination search is running the sheet IS the search screen:
   * results fill it, and the planner's own controls step aside until a
   * destination is chosen.
   */
  const isSearchingDest = !selectedDest && (destResults.length > 0 || destLoading || destNoMatches);

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
            className="nv-frame nv-sheet nv-lift relative pointer-events-auto w-full max-w-2xl mx-auto rounded-t-[24px] max-h-[90vh] overflow-y-auto hide-scrollbar pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="w-10 h-1 bg-[#5B6E7F]/60 rounded-full mx-auto mt-3 mb-5" />

            {/* Header */}
            <div className="flex justify-between items-start px-6 mb-6">
              <div>
                <h2 className="mast mast-2 text-[#E6EAF0]">Where</h2>
                <p className="caption mt-2">exact first. places after.</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 -mr-2 rounded-full hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-[#5B6E7F]" />
              </button>
            </div>

            <div className="px-6 pb-6 space-y-8">
          {/* Search Fields — one hairline block. Origin is the chrome dot and
              destination the hollow ring, joined, exactly as the map draws them. */}
          <div className="relative flex nv-hairline rounded-2xl">
            <span
              aria-hidden
              className="absolute left-[21px] top-[34px] bottom-[34px] w-px bg-[repeating-linear-gradient(180deg,#5B6E7F_0_2px,transparent_2px_5px)]"
            />
            <div className="flex-1 min-w-0 divide-y divide-[#E6EAF0]/10">
              {/* FROM Field */}
              {useMyLocation ? (
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2">
                    <span className="block w-2.5 h-2.5 rounded-full bg-[#E6EAF0]" />
                  </div>
                  <input
                    className="w-full h-14 bg-transparent pl-11 pr-24 ui-text text-[#E6EAF0] focus:outline-none"
                    readOnly
                    type="text"
                    value={originStatus === 'ready' ? MY_LOCATION_LABEL : 'Locating…'}
                  />
                  {originStatus === 'locating' && (
                    <Loader2 className="absolute right-20 top-1/2 -translate-y-1/2 w-4 h-4 text-[#E6EAF0]/70 animate-spin" />
                  )}
                  <button
                    onClick={() => {
                      setUseMyLocation(false);
                      setTimeout(() => originInputRef.current?.focus(), 50);
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 kicker hover:text-[#E6EAF0]"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <div className="absolute left-4 top-7 -translate-y-1/2">
                    <span className="block w-2.5 h-2.5 rounded-full bg-[#E6EAF0]" />
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
                        void commitFromKeyboard('origin');
                      }
                    }}
                    placeholder={originStatus === 'unavailable' ? 'Type a start address' : 'Address or place'}
                    className="w-full h-14 bg-transparent pl-11 pr-10 ui-text text-[#E6EAF0] placeholder:text-[#5B6E7F] focus:outline-none"
                  />
                  {originLoading && (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5B6E7F] animate-spin" />
                  )}
                  {selectedOrigin && !originLoading && (
                    <button
                      onClick={() => { setSelectedOrigin(null); setOriginQuery(''); }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5B6E7F] hover:text-[#E6EAF0]"
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
                      <p className="-mt-2 pb-3 pl-11 ui-sm text-[#5B6E7F]">
                        {locationError ?? 'GPS hasn’t found you yet'}
                      </p>
                    )
                  ) : (
                    // A late GPS fix is offered, never forced over a typed origin
                    <button
                      onClick={() => setUseMyLocation(true)}
                      className="-mt-1 pb-3 pl-11 kicker hover:text-[#E6EAF0] transition-colors"
                    >
                      Use my location
                    </button>
                  )}
                </div>
              )}

              {/* TO Field */}
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <span className="block w-2.5 h-2.5 rounded-full border-[1.5px] border-[#E6EAF0]" />
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
                      if (!selectedDest) {
                        void commitFromKeyboard('dest');
                      } else if (canPlanRoute) {
                        handlePlanRoute();
                      } else {
                        // Destination is set but the route can't be planned, so
                        // the start is what's missing. Enter used to do nothing
                        // at all here; send them where the answer is.
                        originInputRef.current?.focus();
                      }
                    }
                  }}
                  enterKeyHint="search"
                  placeholder="Address, store, or place"
                  className="w-full h-14 bg-transparent pl-11 pr-10 ui-text text-[#E6EAF0] placeholder:text-[#5B6E7F] focus:outline-none"
                />
                {destLoading && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#5B6E7F] animate-spin" />
                )}
                {selectedDest && !destLoading && (
                  <button
                    onClick={() => { setSelectedDest(null); setDestQuery(''); setTimeout(() => destInputRef.current?.focus(), 50); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5B6E7F] hover:text-[#E6EAF0]"
                    aria-label="Clear destination"
                  >
                    <X className="w-4 h-4" />
                  </button>
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
              className="self-center w-11 h-11 mr-1.5 shrink-0 rounded-full text-[#5B6E7F] flex items-center justify-center hover:text-[#E6EAF0] active:scale-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Swap origin and destination"
              title="Swap"
            >
              <ArrowUpDown className="w-[18px] h-[18px]" strokeWidth={1.75} />
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
                className="-mt-4 px-4 py-3 nv-hairline rounded-xl ui-sm text-[#FF3D8E] flex items-start justify-between gap-2"
              >
                <span className="flex-1">{searchError}</span>
                <button
                  type="button"
                  onClick={() => setSearchError(null)}
                  className="p-0.5 rounded-full hover:bg-[#FF3D8E]/10 shrink-0"
                  aria-label="Dismiss search error"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {isSearchingDest ? (
            <ResultSections
              results={destResults}
              isLoading={destLoading}
              emptyMessage={destNoMatches ? NO_MATCHES_HINT : undefined}
              activeIndex={destActive}
              userLocation={userLocation}
              onSelect={(r) => { setSelectedDest(r); setDestQuery(''); setDestResults([]); }}
              onDropPin={onDropPin}
            />
          ) : (
          <>

          {/* Vehicle Profile */}
          <div>
            <label className="block kicker mb-3 px-1">
              Vehicle
            </label>
            <div className="flex flex-wrap gap-2">
              {VEHICLE_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVehicle(v.id)}
                  className={`nv-chip mono-bar text-[0.75rem] px-4 py-2 whitespace-nowrap transition-all active:scale-95 duration-150 ${
                    vehicle === v.id ? 'nv-chip-on' : 'hover:text-[#E6EAF0]'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Route Preferences */}
          <div>
            <label className="block kicker mb-1 px-1">
              Routing
            </label>
            {MODE_OPTIONS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                className="relative w-full flex items-center justify-between gap-4 pl-4 pr-1 py-3.5 text-left transition-colors nv-hairline-b last:border-b-0 hover:bg-[var(--nv-wash)]"
              >
                <span
                  aria-hidden
                  className={`absolute left-0 top-3 bottom-3 w-[2px] rounded-full transition-colors ${mode === m.id ? 'bg-[#2BD9CE]' : 'bg-transparent'}`}
                />
                <div className="min-w-0">
                  <h4 className={`mast mast-3 ${mode === m.id ? 'text-[#2BD9CE]' : 'text-[#E6EAF0]'}`}>{m.label}</h4>
                  <p className="ui-sm text-[#5B6E7F] mt-1">{m.description}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Main CTA — Gradient button */}
          <div>
            <div className="nv-rule mb-5" />
            <button
              onClick={handlePlanRoute}
              disabled={!canPlanRoute}
              className="mast mast-2 text-[#E6EAF0] w-full text-left py-1 transition-opacity active:opacity-60 disabled:text-[#5B6E7F] disabled:cursor-not-allowed"
            >
              Plot route
            </button>
          </div>
          </>
          )}
        </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * The search screen's body: exact addresses first, then places, each row a
 * hairline apart. The one ember is the dot beside the top hit.
 */
function ResultSections({
  results,
  isLoading,
  activeIndex,
  userLocation,
  emptyMessage,
  onSelect,
  onDropPin,
}: {
  results: GeocodingResult[];
  isLoading: boolean;
  activeIndex: number;
  userLocation?: LatLng | null;
  emptyMessage?: string;
  onSelect: (r: GeocodingResult) => void;
  onDropPin?: () => void;
}) {
  const addresses: { result: GeocodingResult; index: number }[] = [];
  const places: { result: GeocodingResult; index: number }[] = [];
  results.forEach((result, index) => {
    const kind = result.kind ?? 'area';
    (kind === 'address' || kind === 'street' ? addresses : places).push({ result, index });
  });

  const topRow = (addresses[0] ?? places[0])?.index ?? -1;

  return (
    <div className="-mt-3">
      {isLoading && results.length === 0 && (
        <div className="space-y-4 py-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-6 w-3/4 bg-white/5" />
              <Skeleton className="h-3 w-1/2 bg-white/5" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && results.length === 0 && emptyMessage && (
        <p className="ui-sm text-[#5B6E7F] py-2">{emptyMessage}</p>
      )}

      {addresses.length > 0 && (
        <ResultGroup
          label="Addresses"
          rows={addresses}
          activeIndex={activeIndex}
          topRow={topRow}
          userLocation={userLocation}
          onSelect={onSelect}
        />
      )}

      {places.length > 0 && (
        <ResultGroup
          label="Places"
          rows={places}
          activeIndex={activeIndex}
          topRow={topRow}
          userLocation={userLocation}
          onSelect={onSelect}
        />
      )}

      {onDropPin && (
        <div className="mt-8">
          <div className="nv-rule mb-5" />
          <button
            onClick={onDropPin}
            className="mast mast-2 text-[#E6EAF0] text-left transition-opacity active:opacity-60"
          >
            Drop a pin
          </button>
          <p className="caption mt-2">if the block is not listed.</p>
        </div>
      )}
    </div>
  );
}

function ResultGroup({
  label,
  rows,
  activeIndex,
  topRow,
  userLocation,
  onSelect,
}: {
  label: string;
  rows: { result: GeocodingResult; index: number }[];
  activeIndex: number;
  /** Flat index of the first row as displayed — the one that gets the ember. */
  topRow: number;
  userLocation?: LatLng | null;
  onSelect: (r: GeocodingResult) => void;
}) {
  return (
    <div className="mt-6 first:mt-2">
      <div className="kicker mb-1">{label}</div>
      {rows.map(({ result, index }) => {
        const distance = userLocation
          ? formatDistance(haversineDistance(userLocation, result.location))
          : null;
        const isExact = result.kind === 'address' && !!result.houseNumber && !result.approximate;
        return (
          <button
            key={`${result.shortName}-${result.location.lat}-${result.location.lng}`}
            role="option"
            aria-selected={index === activeIndex}
            // onMouseDown + preventDefault keeps the input focused, so the
            // sheet doesn't dismiss the list before the tap lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(result)}
            className={`w-full flex items-center gap-3 py-3.5 text-left nv-hairline-b transition-colors ${
              index === activeIndex ? 'bg-white/[0.04]' : ''
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${index === topRow ? 'bg-[#2BD9CE]' : 'bg-transparent'}`}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              <span className="mast mast-3 text-[#E6EAF0] truncate block">{result.shortName}</span>
              <span className="ui-sm text-[#5B6E7F] truncate block mt-1">
                {[result.category, distance, result.displayName].filter(Boolean).join(' · ')}
                {result.approximate && ' · approx.'}
              </span>
            </span>
            {isExact && (
              <span className="kicker nv-hairline rounded-full px-2.5 py-1.5 shrink-0 text-[#B6BECB]">
                Exact
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

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
      <div className="nv-sheet nv-hairline absolute left-0 right-0 top-full mt-2 rounded-2xl z-50 px-4 py-4 ui-sm text-[#5B6E7F]">
        {emptyMessage}
      </div>
    );
  }
  return (
    <div
      ref={listRef}
      role="listbox"
      className="nv-frame nv-sheet nv-hairline absolute left-0 right-0 top-full mt-2 rounded-2xl z-50 max-h-[22rem] overflow-y-auto hide-scrollbar"
    >
      {results.map((r, i) => {
        const distance = userLocation ? formatDistance(haversineDistance(userLocation, r.location)) : null;
        // One ember on the list: the dot beside the top hit.
        const isTop = i === 0;
        const isExact = r.kind === 'address' && !!r.houseNumber && !r.approximate;
        return (
          <button
            key={`${r.shortName}-${r.location.lat}-${r.location.lng}`}
            role="option"
            aria-selected={i === activeIndex}
            // onMouseDown + preventDefault keeps input focused and prevents blur
            // firing before onClick on mobile, which would dismiss the dropdown
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(r)}
            className={`w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors nv-hairline-b last:border-b-0 ${
              i === activeIndex ? 'bg-white/[0.04]' : 'hover:bg-white/[0.03]'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${isTop ? 'bg-[#2BD9CE]' : 'bg-transparent'}`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="mast mast-3 text-[#E6EAF0] truncate">{r.shortName}</div>
              <div className="ui-sm text-[#5B6E7F] truncate mt-1">
                {[r.category, distance, r.displayName].filter(Boolean).join(' · ')}
                {r.approximate && ' · approx.'}
              </div>
            </div>
            {isExact && (
              <span className="kicker nv-hairline rounded-full px-2.5 py-1.5 shrink-0 text-[#B6BECB]">
                Exact
              </span>
            )}
          </button>
        );
      })}
      {isLoading && results.length === 0 && (
        <div className="px-4 py-3 space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-3/4 bg-white/5" />
              <Skeleton className="h-3 w-1/2 bg-white/5" />
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
    <div className="nv-frame nv-sheet nv-hairline absolute left-0 right-0 top-full mt-2 rounded-2xl z-50 max-h-72 overflow-y-auto hide-scrollbar">
      <div className="px-4 pt-4 pb-2 kicker">Recent</div>
      {recents.map((r, i) => (
        <div key={i} className="flex items-center hover:bg-white/[0.03] transition-colors nv-hairline-b last:border-b-0">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(r)}
            className="flex-1 flex items-start gap-3 px-4 py-3.5 text-left min-w-0"
          >
            <History className="w-4 h-4 text-[#5B6E7F] mt-1.5 shrink-0" />
            <div className="min-w-0">
              <div className="mast mast-3 text-[#E6EAF0] truncate">{r.shortName}</div>
              <div className="ui-sm text-[#5B6E7F] truncate mt-1">{r.displayName}</div>
            </div>
          </button>
          {onRemove && (
            <button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onRemove(r)}
              className="p-3 mr-1 text-[#5B6E7F] hover:text-[#FF3D8E] shrink-0"
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
