'use client';

/**
 * Saved tab — Nocturne drawer listing saved routes and saved places.
 * Routes re-run routing on tap; places fly the map to the POI.
 */

import { useState } from 'react';
import { Drawer } from 'vaul';
import { Trash2, MapPin, Navigation, Bookmark } from 'lucide-react';
import type { POI } from '@/types/poi';
import type { SavedRoute } from '@/types/user-data';
import { getCategoryById } from '@/constants/poi-categories';
import { formatDistance, formatDuration } from '@/lib/geo-utils';
import { VEHICLE_OPTIONS, MODE_OPTIONS } from './RoutePlanningPanel';
import { EmptyState } from '@/components/ui/empty-state';

interface SavedPanelProps {
  isOpen: boolean;
  onClose: () => void;
  pois: POI[];
  onFlyToPOI: (poi: POI) => void;
  onDeletePOI: (id: string) => void;
  savedRoutes: SavedRoute[];
  onRunSavedRoute: (route: SavedRoute) => void;
  onDeleteSavedRoute: (id: string) => void;
}

const snapPoints = [0.6, 0.92];

export function SavedPanel({
  isOpen,
  onClose,
  pois,
  onFlyToPOI,
  onDeletePOI,
  savedRoutes,
  onRunSavedRoute,
  onDeleteSavedRoute,
}: SavedPanelProps) {
  const [snap, setSnap] = useState<number | string | null>(snapPoints[0]);
  const [view, setView] = useState<'routes' | 'places'>('routes');

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => { if (!open) onClose(); }}
      modal={false}
      noBodyStyles
      snapPoints={snapPoints}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Content
          aria-describedby={undefined}
          className="nv-frame nv-sheet nv-lift fixed bottom-0 left-0 right-0 !z-[1055] h-full flex flex-col rounded-t-[24px] outline-none pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <Drawer.Title className="sr-only">Saved</Drawer.Title>
          <div className="mx-auto mt-3 mb-4 h-1 w-10 shrink-0 rounded-full bg-[#5B6E7F]/60" />

          {/* Header */}
          <div className="px-6 mb-5 shrink-0">
            <h2 className="mast mast-2 text-[#E6EAF0]">Saved</h2>
            <p className="caption mt-2">
              {savedRoutes.length} route{savedRoutes.length !== 1 ? 's' : ''} · {pois.length} place{pois.length !== 1 ? 's' : ''}.
            </p>
          </div>

          {/* Segmented toggle */}
          <div className="flex gap-2 px-6 mb-4 shrink-0">
            {(['routes', 'places'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`nv-chip mono-bar px-5 py-2.5 transition-all active:scale-95 ${
                  view === v ? 'nv-chip-on' : 'hover:text-[#E6EAF0]'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-32 space-y-2">
            {view === 'routes' ? (
              savedRoutes.length === 0 ? (
                <EmptyState
                  icon={<Bookmark className="w-8 h-8 text-[#5B6E7F]" />}
                  title="No saved routes yet"
                  hint="Plan a route, then tap the bookmark on the route card to save it here."
                />
              ) : (
                savedRoutes.map((route) => (
                  <SavedRouteRow
                    key={route.id}
                    route={route}
                    onRun={() => onRunSavedRoute(route)}
                    onDelete={() => onDeleteSavedRoute(route.id)}
                  />
                ))
              )
            ) : pois.length === 0 ? (
              <EmptyState
                icon={<MapPin className="w-8 h-8 text-[#5B6E7F]" />}
                title="No saved places yet"
                hint="Add places via the My Places tool or long-press on the map."
              />
            ) : (
              pois.map((poi) => (
                <SavedPlaceRow
                  key={poi.id}
                  poi={poi}
                  onFlyTo={() => { onFlyToPOI(poi); onClose(); }}
                  onDelete={() => onDeletePOI(poi.id)}
                />
              ))
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function SavedRouteRow({ route, onRun, onDelete }: { route: SavedRoute; onRun: () => void; onDelete: () => void }) {
  const vehicle = VEHICLE_OPTIONS.find((v) => v.id === route.profile.vehicle);
  const mode = MODE_OPTIONS.find((m) => m.id === route.profile.mode);
  const { summary } = route;

  return (
    <div className="nv-frame flex items-center gap-3 px-2 py-4 nv-hairline-b">
      <button onClick={onRun} className="flex-1 text-left min-w-0 active:scale-[0.99] transition-transform">
        <div className="flex items-center gap-2 min-w-0">
          <Navigation className="w-4 h-4 text-[#5B6E7F] shrink-0" />
          <span className="mast mast-3 text-[#E6EAF0] truncate">
            {route.originIsCurrentLocation ? 'Your location' : route.originLabel} → {route.destinationLabel}
          </span>
        </div>
        <div className="ui-sm text-[#5B6E7F] mt-1.5 truncate">
          {formatDuration(summary.durationSeconds)} · {formatDistance(summary.distanceMeters)} ·{' '}
          <span className={summary.isSpeedBumpFree ? '' : 'text-[#FF3D8E]'}>
            {summary.isSpeedBumpFree
              ? 'no bumps'
              : `${summary.speedBumpCount} bump${summary.speedBumpCount !== 1 ? 's' : ''}`}
          </span>
        </div>
        <div className="kicker mt-2 truncate">
          {vehicle?.label} · {mode?.label}
          {route.originIsCurrentLocation ? ' · from wherever you are' : ''}
        </div>
      </button>
      <button
        onClick={onDelete}
        className="p-2.5 rounded-full text-[#5B6E7F] hover:text-[#FF3D8E] transition-colors active:scale-90 shrink-0"
        aria-label="Delete saved route"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function SavedPlaceRow({ poi, onFlyTo, onDelete }: { poi: POI; onFlyTo: () => void; onDelete: () => void }) {
  const category = getCategoryById(poi.category);

  return (
    <div className="nv-frame flex items-center gap-3 px-2 py-4 nv-hairline-b">
      <button onClick={onFlyTo} className="flex-1 flex items-center gap-3 text-left min-w-0 active:scale-[0.99] transition-transform">
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: category?.color ?? '#5B6E7F' }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="mast mast-3 text-[#E6EAF0] truncate">{poi.title}</div>
          <div className="ui-sm text-[#5B6E7F] mt-1.5 truncate">
            {category?.name ?? poi.category} · {poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}
          </div>
        </div>
      </button>
      <button
        onClick={onDelete}
        className="p-2.5 rounded-full text-[#5B6E7F] hover:text-[#FF3D8E] transition-colors active:scale-90 shrink-0"
        aria-label="Delete saved place"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
