'use client';

/**
 * Route planning panel — slide-up sheet for selecting origin/destination and preferences.
 * Ported from Flutter: lib/features/routing/presentation/widgets/route_planning_sheet.dart
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
}

const VEHICLE_OPTIONS: { id: VehicleProfile; label: string; emoji: string }[] = [
  { id: 'sedan', label: 'Sedan', emoji: '🚗' },
  { id: 'suv', label: 'SUV', emoji: '🚙' },
  { id: 'lowered', label: 'Lowered', emoji: '🏎️' },
  { id: 'motorcycle', label: 'Motorcycle', emoji: '🏍️' },
  { id: 'bicycle', label: 'Bicycle', emoji: '🚲' },
];

const MODE_OPTIONS: { id: RoutePreferenceMode; label: string; description: string }[] = [
  { id: 'smoothRide', label: 'Smooth Ride', description: 'Avoids all bumps — may take longer' },
  { id: 'balanced', label: 'Balanced', description: 'Avoids most bumps while staying efficient' },
  { id: 'fastest', label: 'Fastest', description: 'Shortest time, avoids worst bumps only' },
];

export function RoutePlanningPanel({
  isOpen,
  onClose,
  userLocation,
  onPlanRoute,
  initialDestLabel,
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
  useEffect(() => {
    if (isOpen) {
      initialDestLabelRef.current = initialDestLabel;
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
    }, 400);
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
        className="pointer-events-auto w-full bg-white dark:bg-gray-800 rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Plan Route</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          {/* FROM field */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              From
            </label>
            {useMyLocation ? (
              <div className="flex items-center gap-2 mt-1 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                <Navigation className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400 flex-1">
                  My Location
                </span>
                <button
                  onClick={() => setUseMyLocation(false)}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative mt-1">
                <input
                  type="text"
                  value={selectedOrigin ? selectedOrigin.shortName : originQuery}
                  onChange={(e) => {
                    setSelectedOrigin(null);
                    setOriginQuery(e.target.value);
                  }}
                  placeholder="Enter starting address"
                  className="w-full p-3 pr-10 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {originLoading && (
                  <Loader2 className="absolute right-3 top-3 w-4 h-4 text-gray-400 animate-spin" />
                )}
                {originResults.length > 0 && !selectedOrigin && (
                  <AddressDropdown
                    results={originResults}
                    onSelect={(r) => { setSelectedOrigin(r); setOriginQuery(''); setOriginResults([]); }}
                  />
                )}
                <button
                  onClick={() => setUseMyLocation(true)}
                  className="mt-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Use my location
                </button>
              </div>
            )}
          </div>

          {/* TO field */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              To
            </label>
            <div className="relative mt-1">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-red-500 pointer-events-none" />
              <input
                ref={destInputRef}
                type="text"
                value={selectedDest ? selectedDest.shortName : destQuery}
                onChange={(e) => {
                  setSelectedDest(null);
                  destIsPrefillRef.current = false; // user is typing — enable autocomplete
                  setDestQuery(e.target.value);
                }}
                placeholder="Where to in Philly?"
                className="w-full p-3 pl-10 pr-10 text-sm border border-gray-200 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {destLoading && (
                <Loader2 className="absolute right-3 top-3 w-4 h-4 text-gray-400 animate-spin" />
              )}
              {selectedDest && (
                <button
                  onClick={() => { setSelectedDest(null); setDestQuery(''); }}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                  aria-label="Clear destination"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              {destResults.length > 0 && !selectedDest && (
                <AddressDropdown
                  results={destResults}
                  onSelect={(r) => { setSelectedDest(r); setDestQuery(''); setDestResults([]); }}
                />
              )}
            </div>
          </div>

          {/* Vehicle Profile */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Vehicle
            </label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {VEHICLE_OPTIONS.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setVehicle(v.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    vehicle === v.id
                      ? 'bg-blue-600 text-white shadow'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  <span>{v.emoji}</span>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          {/* Route Preference */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Route Preference
            </label>
            <div className="space-y-2 mt-2">
              {MODE_OPTIONS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all border ${
                    mode === m.id
                      ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-500'
                      : 'bg-white dark:bg-gray-700/50 border-gray-200 dark:border-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div
                    className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      mode === m.id
                        ? 'border-blue-600 bg-blue-600'
                        : 'border-gray-300 dark:border-gray-500'
                    }`}
                  >
                    {mode === m.id && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{m.label}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{m.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Find Route Button */}
          <button
            onClick={handlePlanRoute}
            disabled={!canPlanRoute}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white font-semibold rounded-xl transition-colors disabled:cursor-not-allowed"
          >
            Find Route
          </button>
        </div>
      </div>
    </div>
  );
}

function AddressDropdown({
  results,
  onSelect,
}: {
  results: GeocodingResult[];
  onSelect: (r: GeocodingResult) => void;
}) {
  return (
    <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
      {results.map((r, i) => (
        <button
          key={i}
          onClick={() => onSelect(r)}
          className="w-full flex items-start gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
              {r.shortName}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.displayName}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
