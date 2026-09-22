'use client';

/**
 * Reports tab — Nocturne drawer for user-submitted speed bump reports.
 * Reports persist locally, render as blue map markers, and count in
 * bump-avoidance routing.
 */

import { useState } from 'react';
import { Drawer } from 'vaul';
import { Trash2, TriangleAlert, Crosshair, MapPin, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import type { LatLng } from '@/types/speedbumps';
import type { UserReport } from '@/types/user-data';

interface ReportsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  reports: UserReport[];
  onAddReport: (input: { location: LatLng; severity: number; note?: string }) => void;
  onDeleteReport: (id: string) => void;
  userLocation: LatLng | null;
  isPickingLocation: boolean;
  onTogglePickLocation: () => void;
  pickedLocation: LatLng | null;
  onClearPickedLocation: () => void;
}

// Lowest snap leaves the map visible while picking a location
// The tall snap stops short of the search bar rather than cutting through it.
const snapPoints = ['150px', 0.6, 0.86];

// Kept short so each one fits its tile on a 360 px phone.
const SEVERITY_LABELS = ['Gentle', 'Mild', 'Medium', 'Harsh', 'Brutal'];

function severityChipClasses(severity: number): string {
  if (severity >= 4) return 'text-[#FF3D8E] border border-[#FF3D8E]/50';
  if (severity === 3) return 'text-[#E6EAF0] border border-[#E6EAF0]/30';
  return 'text-[#5B6E7F] border border-[#E6EAF0]/15';
}

export function ReportsPanel({
  isOpen,
  onClose,
  reports,
  onAddReport,
  onDeleteReport,
  userLocation,
  isPickingLocation,
  onTogglePickLocation,
  pickedLocation,
  onClearPickedLocation,
}: ReportsPanelProps) {
  const [snap, setSnap] = useState<number | string | null>(snapPoints[1]);
  const [view, setView] = useState<'list' | 'add'>('list');
  const [location, setLocation] = useState<LatLng | null>(null);
  const [severity, setSeverity] = useState(3);
  const [note, setNote] = useState('');

  // Map pick result flows in from MapMain (adjust-state-during-render pattern)
  const [prevPicked, setPrevPicked] = useState<LatLng | null>(null);
  if (pickedLocation !== prevPicked) {
    setPrevPicked(pickedLocation);
    if (pickedLocation) {
      setLocation(pickedLocation);
      setSnap(snapPoints[1]);
    }
  }

  // Drop to the lowest snap while picking so the map is visible
  const [prevPicking, setPrevPicking] = useState(false);
  if (isPickingLocation !== prevPicking) {
    setPrevPicking(isPickingLocation);
    if (isPickingLocation) setSnap(snapPoints[0]);
  }

  const resetForm = () => {
    setLocation(null);
    setSeverity(3);
    setNote('');
    onClearPickedLocation();
  };

  // The form needs the height: at the middle snap the bottom nav sits over it.
  const openForm = () => {
    setView('add');
    setSnap(snapPoints[2]);
  };

  const handleSubmit = () => {
    if (!location) return;
    onAddReport({ location, severity, note: note.trim() || undefined });
    toast.success('Speed bump reported — thanks for keeping rides smooth!');
    resetForm();
    setView('list');
  };

  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={(open) => { if (!open) { resetForm(); setView('list'); onClose(); } }}
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
          <Drawer.Title className="sr-only">Reports</Drawer.Title>
          <div className="mx-auto mt-3 mb-4 h-1 w-10 shrink-0 rounded-full bg-[#5B6E7F]/60" />

          {/* Header */}
          <div className="px-6 mb-5 shrink-0">
            {view === 'add' && (
              <button
                onClick={() => { resetForm(); setView('list'); }}
                className="flex items-center gap-2 mb-3 kicker hover:text-[#E6EAF0] transition-colors active:scale-95"
                aria-label="Back to reports list"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
            <div className="min-w-0">
              <h2 className="mast mast-2 text-[#E6EAF0]">
                {view === 'list' ? 'Reports' : 'Report a bump'}
              </h2>
              <p className="caption mt-2">
                {view === 'list'
                  ? `${reports.length} report${reports.length !== 1 ? 's' : ''} from you.`
                  : 'one tap. we verify later.'}
              </p>
            </div>
          </div>

          {view === 'list' ? (
            <>
              <div className="px-6 mb-4 shrink-0">
                <button
                  onClick={openForm}
                  className="w-full flex items-center justify-between gap-2 py-3 nv-hairline-t nv-hairline-b transition-opacity active:opacity-60"
                >
                  <span className="mast mast-3 text-[#E6EAF0]">Report a bump</span>
                  <span aria-hidden className="mono-bar text-[#B6BECB]">+</span>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-32 space-y-2">
                {reports.length === 0 ? (
                  <EmptyState
                    icon={<TriangleAlert className="w-8 h-8" />}
                    title="No reports yet"
                    hint="Spot a bump the map doesn't know about? Report it and it will show on the map and count in route planning."
                    action={{ label: 'Report a bump', onClick: openForm }}
                  />
                ) : (
                  reports.map((report) => (
                    <div key={report.id} className="nv-frame flex items-center gap-3 px-2 py-4 nv-hairline-b">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-1 rounded-full kicker ${severityChipClasses(report.severity)}`}>
                            {report.severity} · {SEVERITY_LABELS[report.severity - 1] ?? 'Medium'}
                          </span>
                          <span className="ui-sm text-[#5B6E7F]">
                            {new Date(report.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="kicker mt-2">
                          {report.location.lat.toFixed(5)}, {report.location.lng.toFixed(5)}
                        </div>
                        {report.note && (
                          <p className="ui-sm text-[#B6BECB] mt-2">{report.note}</p>
                        )}
                      </div>
                      <button
                        onClick={() => onDeleteReport(report.id)}
                        className="p-2.5 rounded-full bg-[#0C1416] text-[#B6BECB] hover:bg-[#0C1416]/30 hover:text-[#FF3D8E] transition-colors active:scale-90 shrink-0"
                        aria-label="Delete report"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto hide-scrollbar px-6 pb-32 space-y-6">
              {/* Location */}
              <div>
                <div className="kicker mb-3">Location</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (userLocation) { setLocation(userLocation); onClearPickedLocation(); } }}
                    disabled={!userLocation}
                    className={`nv-chip mono-bar flex-1 flex items-center justify-center gap-2 py-3 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                      location && !isPickingLocation && userLocation && location.lat === userLocation.lat && location.lng === userLocation.lng
                        ? 'nv-chip-on'
                        : 'hover:text-[#E6EAF0]'
                    }`}
                    title={userLocation ? 'Use my GPS position' : 'Location unavailable'}
                  >
                    <Crosshair className="w-4 h-4" />
                    Use GPS
                  </button>
                  <button
                    onClick={onTogglePickLocation}
                    className={`nv-chip mono-bar flex-1 flex items-center justify-center gap-2 py-3 transition-all active:scale-95 ${
                      isPickingLocation ? 'nv-chosen-edge text-[#2BD9CE]' : 'hover:text-[#E6EAF0]'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                    {isPickingLocation ? 'Tap the map…' : 'Pick on map'}
                  </button>
                </div>
                {location && (
                  <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full nv-hairline kicker text-[#B6BECB]">
                    <MapPin className="w-3 h-3" />
                    {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                  </div>
                )}
              </div>

              {/* Severity — five digits on one line; the chosen one in flare,
                  named underneath. No boxes. */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <span className="kicker">How harsh</span>
                  <span className="kicker text-[#E6EAF0]">{SEVERITY_LABELS[severity - 1]}</span>
                </div>
                <div role="radiogroup" aria-label="How harsh" className="flex items-end justify-between nv-hairline-b">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={severity === s}
                      aria-label={`${s} — ${SEVERITY_LABELS[s - 1]}`}
                      onClick={() => setSeverity(s)}
                      className="relative flex-1 flex justify-center pt-1 pb-3 transition-colors active:opacity-60"
                    >
                      <span
                        className={`mast mast-num text-[2.75rem] leading-none transition-colors ${
                          severity === s ? 'text-[#FF3D8E]' : 'text-[#5B6E7F] hover:text-[#B6BECB]'
                        }`}
                      >
                        {s}
                      </span>
                      {severity === s && (
                        <span aria-hidden className="absolute -bottom-px left-1/2 -translate-x-1/2 h-[2px] w-8 rounded-full bg-[#FF3D8E]" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <div className="kicker mb-3">Note</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={200}
                  placeholder="e.g. Unmarked bump right after the corner"
                  className="w-full bg-transparent nv-hairline rounded-2xl px-4 py-3 ui-text text-[#E6EAF0] placeholder:text-[#5B6E7F] focus:outline-none focus:border-[#E6EAF0]/50 resize-none"
                />
              </div>

              <div>
                <div className="nv-rule mb-4" />
                <button
                  onClick={handleSubmit}
                  disabled={!location}
                  className="mast mast-2 text-[#E6EAF0] w-full text-left py-1 transition-opacity active:opacity-60 disabled:text-[#5B6E7F] disabled:cursor-not-allowed"
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
