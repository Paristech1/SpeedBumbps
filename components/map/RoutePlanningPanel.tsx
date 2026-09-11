'use client';

/**
 * Route planning panel — Velocity Dark slide-up sheet.
 * Matches the route_planner stitch: dark bottom sheet with glassmorphism,
 * vehicle selector pills, routing strategy cards, and gradient CTA.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, X, Loader2, ArrowUpDown, History, Trash2 } from 'lucide-react';
import { searchAddress } from '@/lib/nominatim-service';
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
        setTimeout(() => destInputRef.current?.focus(), 200);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // intentionally omit initial* — snapshot on open only

  // Debounced origin search
  useEffect(() => {
    if (useMyLocation || !originQuery.trim()) {
      setOriginResults([]);
      return;
    }
    setOriginLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchAddress(originQuery);
        setOriginResults(results);
        setSearchError(null);
      } catch (err) {
        setOriginResults([]);
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setOriginLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [originQuery, useMyLocation]);

  // Debounced destination search — suppressed while destQuery is the pre-filled hint
  useEffect(() => {
    if (!destQuery.trim() || destIsPrefillRef.current) {
      setDestResults([]);
      return;
    }
    // Don't clear existing results immediately — keep them visible while the next search loads
    setDestLoading(true);
    const timer = setTimeout(async () => {
      try {
        const results = await searchAddress(destQuery);
        setDestResults(results);
        setSearchError(null);
      } catch (err) {
        setDestResults([]);
        setSearchError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        setDestLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
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
    if (destResults.length > 0) {
      setSelectedDest(destResults[0]);
      setDestQuery('');
      setDestResults([]);
      return;
    }
    const q = destQuery.trim();
    if (!q) return;
    setDestLoading(true);
    try {
      const results = await searchAddress(q);
      if (results.length > 0) {
        setSelectedDest(results[0]);
        setDestQuery('');
        setDestResults([]);
      } else {
        setSearchError(`No matches for "${q}" in Philadelphia`);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setDestLoading(false);
    }
  }, [selectedDest, destResults, destQuery]);

  const commitOriginFromKeyboard = useCallback(async () => {
    if (selectedOrigin) return;
    if (originResults.length > 0) {
      setSelectedOrigin(originResults[0]);
      setOriginQuery('');
      setOriginResults([]);
      return;
    }
    const q = originQuery.trim();
    if (!q) return;
    setOriginLoading(true);
    try {
      const results = await searchAddress(q);
      if (results.length > 0) {
        setSelectedOrigin(results[0]);
        setOriginQuery('');
        setOriginResults([]);
      } else {
        setSearchError(`No matches for "${q}" in Philadelphia`);
      }
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setOriginLoading(false);
    }
  }, [selectedOrigin, originResults, originQuery]);

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

  const canSwap = !!selectedDest || (!useMyLocation && !!selectedOrigin);
  const canPlanRoute =
    (useMyLocation ? !!userLocation : !!selectedOrigin) && !!selectedDest;

  const showRecents =
    !selectedDest &&
    destFocused &&
    !destQuery.trim() &&
    destResults.length === 0 &&
    recentDestinations.length > 0;

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[1100] flex items-end pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-2xl mx-auto bg-[#1A1D27] rounded-t-[24px] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto hide-scrollbar"
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
                    value={userLocation ? MY_LOCATION_LABEL : 'Locating…'}
                  />
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
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitOriginFromKeyboard();
                      }
                    }}
                    placeholder="Enter starting address"
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
                  {originResults.length > 0 && !selectedOrigin && (
                    <AddressDropdown
                      results={originResults}
                      isLoading={originLoading}
                      onSelect={(r) => { setSelectedOrigin(r); setOriginQuery(''); setOriginResults([]); }}
                    />
                  )}
                  <button
                    onClick={() => setUseMyLocation(true)}
                    className="mt-1 text-xs text-[#2196F3] hover:underline"
                  >
                    Use my location
                  </button>
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
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (selectedDest && canPlanRoute) handlePlanRoute();
                      else commitDestFromKeyboard();
                    }
                  }}
                  enterKeyHint="search"
                  placeholder="Where to in Philly?"
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
                {(destResults.length > 0 || destLoading) && !selectedDest && (
                  <AddressDropdown
                    results={destResults}
                    isLoading={destLoading}
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

          {searchError && (
            <div className="-mt-4 px-4 py-2 bg-[#93000a]/30 text-[#ffb4ab] text-xs rounded-xl">
              {searchError}
            </div>
          )}

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
      </div>
    </div>
  );
}

function AddressDropdown({
  results,
  isLoading,
  onSelect,
}: {
  results: GeocodingResult[];
  isLoading: boolean;
  onSelect: (r: GeocodingResult) => void;
}) {
  if (results.length === 0 && !isLoading) return null;
  return (
    <div className="absolute left-0 right-0 top-full mt-1 bg-[#1e1f26] border border-[#404752]/20 rounded-2xl shadow-lg z-50 max-h-48 overflow-y-auto hide-scrollbar">
      {results.map((r, i) => (
        <button
          key={i}
          // onMouseDown + preventDefault keeps input focused and prevents blur
          // firing before onClick on mobile, which would dismiss the dropdown
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(r)}
          className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-[#373940] transition-colors"
        >
          <MapPin className="w-4 h-4 text-[#89919d] mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-[#e2e2eb] truncate">
              {r.shortName}
            </div>
            <div className="text-xs text-[#89919d] truncate">{r.displayName}</div>
          </div>
        </button>
      ))}
      {isLoading && results.length === 0 && (
        <div className="px-4 py-3 text-sm text-[#89919d]">Searching…</div>
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
