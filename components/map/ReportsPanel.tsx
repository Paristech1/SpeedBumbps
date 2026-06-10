'use client';

/**
 * Reports tab — Velocity Dark drawer for user-submitted speed bump reports.
 * Reports persist locally, render as blue map markers, and count in
 * bump-avoidance routing.
 */

import { useState } from 'react';
import { Drawer } from 'vaul';
import { Trash2, TriangleAlert, Crosshair, MapPin, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
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
const snapPoints = ['150px', 0.6, 0.92];

const SEVERITY_LABELS = ['Gentle', 'Mild', 'Moderate', 'Harsh', 'Brutal'];

function severityChipClasses(severity: number): string {
  if (severity >= 4) return 'bg-[#FF6B00]/20 text-[#FF6B00]';
  if (severity === 3) return 'bg-[#9ecaff]/15 text-[#9ecaff]';
  return 'bg-[#282a30] text-[#bfc7d4]';
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
          className="fixed bottom-0 left-0 right-0 !z-[1055] h-full flex flex-col rounded-t-[24px] bg-[#191b22] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] outline-none"
        >
          <Drawer.Title className="sr-only">Reports</Drawer.Title>
          <div className="mx-auto mt-4 mb-4 h-1.5 w-12 shrink-0 rounded-full bg-[#89919d]/70" />

          {/* Header */}
          <div className="flex items-center gap-4 px-6 mb-4 shrink-0">
            {view === 'add' && (
              <button
                onClick={() => { resetForm(); setView('list'); }}
                className="p-2 -ml-2 rounded-full bg-[#282a30] text-[#bfc7d4] hover:bg-[#33343b] transition-colors active:scale-90"
                aria-label="Back to reports list"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-1.5 h-8 bg-[#FF6B00] rounded-full" />
            <h2 className="text-2xl font-[var(--font-headline)] font-bold text-[#e2e2eb] tracking-tight">
              {view === 'list' ? 'My Reports' : 'Report a bump'}
            </h2>
            {view === 'list' && (
              <span className="text-xs text-[#bfc7d4] font-medium uppercase tracking-wider">
                {reports.length} report{reports.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {view === 'list' ? (
            <>
              <div className="px-6 mb-4 shrink-0">
                <button
                  onClick={() => setView('add')}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full text-sm font-bold bg-gradient-to-br from-[#9ecaff] to-[#2196F3] text-[#003258] shadow-xl shadow-[#2196F3]/20 transition-all active:scale-[0.98]"
                >
                  <TriangleAlert className="w-4 h-4" />
                  Report a bump
                </button>
              </div>
              <div className="flex-1 overflow-y-auto hide-scrollbar px-4 pb-32 space-y-2">
                {reports.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center px-8 py-16 gap-3">
                    <div className="w-16 h-16 rounded-full bg-[#1e1f26] flex items-center justify-center">
                      <TriangleAlert className="w-8 h-8 text-[#404752]" />
                    </div>
                    <div className="text-base font-[var(--font-headline)] font-bold text-[#e2e2eb]">No reports yet</div>
                    <p className="text-sm text-[#bfc7d4] max-w-xs">
                      Spot a bump the map doesn&apos;t know about? Report it and it will show on the map and count in route planning.
                    </p>
                  </div>
                ) : (
                  reports.map((report) => (
                    <div key={report.id} className="flex items-center gap-3 p-4 rounded-2xl bg-[#1e1f26] hover:bg-[#282a30] transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${severityChipClasses(report.severity)}`}>
                            {report.severity} · {SEVERITY_LABELS[report.severity - 1] ?? 'Moderate'}
                          </span>
                          <span className="text-xs text-[#bfc7d4]">
                            {new Date(report.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="text-xs text-[#bfc7d4] mt-1.5 font-mono">
                          {report.location.lat.toFixed(5)}, {report.location.lng.toFixed(5)}
                        </div>
                        {report.note && (
                          <p className="text-sm text-[#e2e2eb] mt-1.5">{report.note}</p>
                        )}
                      </div>
                      <button
                        onClick={() => onDeleteReport(report.id)}
                        className="p-2.5 rounded-full bg-[#282a30] text-[#bfc7d4] hover:bg-[#93000a]/30 hover:text-[#ffb4ab] transition-colors active:scale-90 shrink-0"
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
                <div className="text-xs font-bold text-[#bfc7d4] uppercase tracking-wider mb-2">Location</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { if (userLocation) { setLocation(userLocation); onClearPickedLocation(); } }}
                    disabled={!userLocation}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                      location && !isPickingLocation && userLocation && location.lat === userLocation.lat && location.lng === userLocation.lng
                        ? 'bg-[#2196F3]/20 text-[#9ecaff]'
                        : 'bg-[#282a30] text-[#e2e2eb] hover:bg-[#33343b]'
                    }`}
                    title={userLocation ? 'Use my GPS position' : 'Location unavailable'}
                  >
                    <Crosshair className="w-4 h-4" />
                    Use GPS
                  </button>
                  <button
                    onClick={onTogglePickLocation}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-sm font-bold transition-all active:scale-95 ${
                      isPickingLocation
                        ? 'bg-[#FF6B00]/20 text-[#FF6B00]'
                        : 'bg-[#282a30] text-[#e2e2eb] hover:bg-[#33343b]'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                    {isPickingLocation ? 'Tap the map…' : 'Pick on map'}
                  </button>
                </div>
                {location && (
                  <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#1e1f26] text-xs font-mono text-[#9ecaff]">
                    <MapPin className="w-3 h-3" />
                    {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                  </div>
                )}
              </div>

              {/* Severity */}
              <div>
                <div className="text-xs font-bold text-[#bfc7d4] uppercase tracking-wider mb-2">Severity</div>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSeverity(s)}
                      className={`flex-1 flex flex-col items-center py-2.5 rounded-2xl transition-all active:scale-95 ${
                        severity === s
                          ? 'bg-[#FF6B00]/20 text-[#FF6B00]'
                          : 'bg-[#282a30] text-[#bfc7d4] hover:bg-[#33343b]'
                      }`}
                    >
                      <span className="text-base font-[var(--font-headline)] font-extrabold">{s}</span>
                      <span className="text-[9px] font-semibold uppercase tracking-wider">{SEVERITY_LABELS[s - 1]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div>
                <div className="text-xs font-bold text-[#bfc7d4] uppercase tracking-wider mb-2">Note (optional)</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={200}
                  placeholder="e.g. Unmarked bump right after the corner"
                  className="w-full bg-[#282a30] border-none rounded-2xl px-4 py-3 text-sm text-[#e2e2eb] placeholder:text-[#89919d] focus:outline-none focus:ring-2 focus:ring-[#2196F3]/40 resize-none"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!location}
                className="w-full py-4 rounded-full text-sm font-bold bg-gradient-to-br from-[#9ecaff] to-[#2196F3] text-[#003258] shadow-xl shadow-[#2196F3]/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Submit report
              </button>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
