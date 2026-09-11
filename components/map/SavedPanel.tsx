'use client';

/**
 * Saved tab — Velocity Dark drawer listing saved routes and saved places.
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
          className="fixed bottom-0 left-0 right-0 !z-[1055] h-full flex flex-col rounded-t-[24px] bg-sb-surface-container-low shadow-[0_-20px_60px_rgba(0,0,0,0.5)] border-t border-sb-outline-variant/30 outline-none pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <Drawer.Title className="sr-only">Saved</Drawer.Title>
          <div className="mx-auto mt-4 mb-4 h-1.5 w-12 shrink-0 rounded-full bg-[#89919d]/70" />

          {/* Header */}
          <div className="flex items-center gap-4 px-6 mb-4 shrink-0">
            <div className="w-1.5 h-8 bg-[#9ecaff] rounded-full" />
            <h2 className="text-2xl font-[var(--font-headline)] font-bold text-[#e2e2eb] tracking-tight">Saved</h2>
            <span className="text-xs text-[#bfc7d4] font-medium uppercase tracking-wider">
              {savedRoutes.length} route{savedRoutes.length !== 1 ? 's' : ''} · {pois.length} place{pois.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Segmented toggle */}
          <div className="flex gap-2 px-6 mb-4 shrink-0">
            {(['routes', 'places'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-5 py-2 rounded-full text-sm font-bold capitalize transition-all active:scale-95 ${
                  view === v
                    ? 'bg-[#2196F3]/20 text-[#9ecaff]'
                    : 'bg-[#282a30] text-[#bfc7d4] hover:bg-[#33343b]'
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
                  icon={<Bookmark className="w-8 h-8 text-[#404752]" />}
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
                icon={<MapPin className="w-8 h-8 text-[#404752]" />}
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
    <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#1e1f26] hover:bg-[#282a30] transition-colors">
      <button onClick={onRun} className="flex-1 text-left min-w-0 active:scale-[0.99] transition-transform">
        <div className="flex items-center gap-2 min-w-0">
          <Navigation className="w-4 h-4 text-[#44d8f1] shrink-0" />
          <span className="text-sm font-semibold text-[#e2e2eb] truncate">
            {route.originIsCurrentLocation ? 'Your location' : route.originLabel} → {route.destinationLabel}
          </span>
        </div>
        {route.originIsCurrentLocation && (
          <div className="text-[11px] text-[#89919d] mt-0.5">Starts from wherever you are now</div>
        )}
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs font-bold text-[#44d8f1]">{formatDuration(summary.durationSeconds)}</span>
          <span className="text-xs text-[#bfc7d4]">{formatDistance(summary.distanceMeters)}</span>
          {summary.isSpeedBumpFree ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#00a844]/20 text-[#3ce36a] uppercase tracking-wider">
              Bump-free
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#FF6B00]/20 text-[#FF6B00] uppercase tracking-wider">
              {summary.speedBumpCount} bump{summary.speedBumpCount !== 1 ? 's' : ''}
            </span>
          )}
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#282a30] text-[#bfc7d4]">
            {vehicle?.emoji} {vehicle?.label}
          </span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#282a30] text-[#bfc7d4]">
            {mode?.icon} {mode?.label}
          </span>
        </div>
      </button>
      <button
        onClick={onDelete}
        className="p-2.5 rounded-full bg-[#282a30] text-[#bfc7d4] hover:bg-[#93000a]/30 hover:text-[#ffb4ab] transition-colors active:scale-90 shrink-0"
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
    <div className="flex items-center gap-3 p-4 rounded-2xl bg-[#1e1f26] hover:bg-[#282a30] transition-colors">
      <button onClick={onFlyTo} className="flex-1 flex items-center gap-3 text-left min-w-0 active:scale-[0.99] transition-transform">
        <div
          className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg"
          style={{ backgroundColor: `${category?.color ?? '#6b7280'}33` }}
        >
          {category?.icon ?? '📍'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#e2e2eb] truncate">{poi.title}</div>
          <div className="text-xs text-[#bfc7d4] mt-0.5">
            {category?.name ?? poi.category} · {poi.lat.toFixed(4)}, {poi.lng.toFixed(4)}
          </div>
        </div>
      </button>
      <button
        onClick={onDelete}
        className="p-2.5 rounded-full bg-[#282a30] text-[#bfc7d4] hover:bg-[#93000a]/30 hover:text-[#ffb4ab] transition-colors active:scale-90 shrink-0"
        aria-label="Delete saved place"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
