'use client';

/**
 * Route planning panel — Velocity Dark slide-up sheet.
 * Matches the route_planner stitch: dark bottom sheet with glassmorphism,
 * vehicle selector pills, routing strategy cards, and gradient CTA.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Navigation, X, Loader2 } from 'lucide-react';
import { searchAddress } from '@/lib/nominatim-service';
import type { GeocodingResult, LatLng, RouteAvoidanceProfile, VehicleProfile, RoutePreferenceMode } from '@/types/speedbumps';

interface RoutePlanningPanelProps {
  isOpen: boolean;
  onClose: () => void;
  userLocation?: LatLng | null;
  onPlanRoute: (
    origin: LatLng,
    destination: LatLng,
    originLabel: string,
    destinationLabel: string,
    profile: RouteAvoidanceProfile
  ) => void;
  /** Pre-fill the destination label when re-opening after a route is active */
  initialDestLabel?: string;
  /** Pre-select vehicle/mode (e.g. the profile's defaults) on open */
  initialProfile?: RouteAvoidanceProfile;
}

export const VEHICLE_OPTIONS: { id: VehicleProfile; label: string; emoji: string }[] = [
  { id: 'sedan', label: 'Sedan', emoji: '🚗' },
  { id: 'suv', label: 'SUV', emoji: '🚙' },
  { id: 'lowered', label: 'Lowered', emoji: '🏎️' },
  { id: 'motorcycle', label: 'Motorcycle', emoji: '🏍️' },
  { id: 'bicycle', label: 'Bicycle', emoji: '🚲' },
];

export const MODE_OPTIONS: { id: RoutePreferenceMode; label: string; description: string; icon: string }[] = [
  { id: 'smoothRide', label: 'Smooth Ride', description: 'Avoids all bumps & dips', icon: '🛣️' },
  { id: 'balanced', label: 'Balanced', description: 'Optimal time vs. road quality', icon: '⚖️' },
  { id: 'fastest', label: 'Fastest', description: 'Shortest arrival time possible', icon: '⚡' },
];

export function RoutePlanningPanel({
  isOpen,
  onClose,
  userLocation,
  onPlanRoute,
  initialDestLabel,
  initialProfile,
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
  const destInputRef = useRef<HTMLInputElement>(null);
  // Tracks whether the current destQuery is the pre-filled hint (no autocomplete until user edits)
  const destIsPrefillRef = useRef(false);

  // Reset on open — snapshot initialDestLabel at open time only (not on every re-render)
  const initialDestLabelRef = useRef(initialDestLabel);
  const initialProfileRef = useRef(initialProfile);
  initialProfileRef.current = initialProfile;
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
      setSelectedDest(null);
      const prefill = initialDestLabelRef.current ?? '';
      destIsPrefillRef.current = prefill !== '';
      setDestQuery(prefill);
      setTimeout(() => destInputRef.current?.focus(), 200);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // intentionally omit initialDestLabel — snapshot on open only

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
      } catch {
        setOriginResults([]);
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
      } catch {
        setDestResults([]);
      } finally {
        setDestLoading(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [destQuery]);

  const handlePlanRoute = useCallback(() => {
    const origin = useMyLocation ? userLocation : selectedOrigin?.location;
    const dest = selectedDest?.location;
    if (!origin || !dest) return;

    const originLabel = useMyLocation ? 'My Location' : (selectedOrigin?.shortName ?? 'Origin');
    const destLabel = selectedDest?.shortName ?? 'Destination';

    onPlanRoute(origin, dest, originLabel, destLabel, { mode, vehicle });
    onClose();
  }, [useMyLocation, userLocation, selectedOrigin, selectedDest, mode, vehicle, onPlanRoute, onClose]);

  const canPlanRoute =
    (useMyLocation ? !!userLocation : !!selectedOrigin) && !!selectedDest;

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-[1100] flex items-end pointer-events-none">
      <div
        className="pointer-events-auto w-full max-w-2xl mx-auto bg-[#1A1D27] rounded-t-[24px] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] max-h-[90vh] overflow-y-auto hide-scrollbar"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle */}
        <div className="w-12 h-1.5 bg-[#404752]/30 rounded-full mx-auto mt-3 mb-6" />

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
          <div className="space-y-4">
            {/* FROM Field */}
            {useMyLocation ? (
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2">
                  <Navigation className="w-5 h-5 text-[#3ce36a]" />
                </div>
                <input
                  className="w-full h-14 bg-[#00a844]/10 border-none rounded-2xl pl-12 pr-4 font-semibold text-[#3ce36a] focus:ring-2 focus:ring-[#3ce36a]"
                  readOnly
                  type="text"
                  value="My Location"
                />
                <button
                  onClick={() => setUseMyLocation(false)}
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
                  type="text"
                  value={selectedOrigin ? selectedOrigin.shortName : originQuery}
                  onChange={(e) => {
                    setSelectedOrigin(null);
                    setOriginQuery(e.target.value);
                  }}
                  placeholder="Enter starting address"
                  className="w-full h-14 bg-[#282a30] border-none rounded-2xl pl-12 pr-10 font-medium text-[#e2e2eb] placeholder:text-[#89919d] focus:ring-2 focus:ring-[#9ecaff]"
                />
                {originLoading && (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#89919d] animate-spin" />
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

            {/* Connection Line */}
            <div className="absolute left-10 h-6 w-0.5 border-l-2 border-dashed border-[#404752]/40 -mt-2" />

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
                placeholder="Where to in Philly?"
                className="w-full h-14 bg-[#282a30] border-none rounded-2xl pl-12 pr-10 font-medium text-[#e2e2eb] placeholder:text-[#89919d]/50 focus:ring-2 focus:ring-[#9ecaff]"
              />
              {destLoading && (
                <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#89919d] animate-spin" />
              )}
              {selectedDest && (
                <button
                  onClick={() => { setSelectedDest(null); setDestQuery(''); }}
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
            </div>
          </div>

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
