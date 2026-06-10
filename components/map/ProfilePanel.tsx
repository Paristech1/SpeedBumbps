'use client';

/**
 * Profile tab — Velocity Dark drawer with the local on-device profile:
 * display name, stats, and default routing preferences.
 */

import { useState } from 'react';
import { Drawer } from 'vaul';
import { Pencil, Check } from 'lucide-react';
import type { RouteAvoidanceProfile } from '@/types/speedbumps';
import type { UserProfile } from '@/types/user-data';
import { VEHICLE_OPTIONS, MODE_OPTIONS } from './RoutePlanningPanel';

interface ProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onUpdateProfile: (partial: Partial<UserProfile>) => void;
  stats: { places: number; routes: number; reports: number };
  onAvoidanceProfileChange: (profile: RouteAvoidanceProfile) => void;
}

const snapPoints = [0.6, 0.92];

export function ProfilePanel({
  isOpen,
  onClose,
  profile,
  onUpdateProfile,
  stats,
  onAvoidanceProfileChange,
}: ProfilePanelProps) {
  const [snap, setSnap] = useState<number | string | null>(snapPoints[0]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.displayName);

  // Keep the draft in sync when the stored name changes (adjust-state-during-render)
  const [prevName, setPrevName] = useState(profile.displayName);
  if (profile.displayName !== prevName) {
    setPrevName(profile.displayName);
    setNameDraft(profile.displayName);
  }

  const commitName = () => {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== profile.displayName) {
      onUpdateProfile({ displayName: trimmed });
    } else {
      setNameDraft(profile.displayName);
    }
    setIsEditingName(false);
  };

  const setDefaultProfile = (next: RouteAvoidanceProfile) => {
    onUpdateProfile({ defaultProfile: next });
    onAvoidanceProfileChange(next);
  };

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
          className="fixed bottom-0 left-0 right-0 !z-[1055] h-full flex flex-col rounded-t-[24px] bg-[#191b22] shadow-[0_-20px_60px_rgba(0,0,0,0.5)] outline-none"
        >
          <Drawer.Title className="sr-only">Profile</Drawer.Title>
          <div className="mx-auto mt-4 mb-4 h-1.5 w-12 shrink-0 rounded-full bg-[#404752]/30" />

          <div className="flex-1 overflow-y-auto hide-scrollbar px-6 pb-32 space-y-6">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 shrink-0 rounded-full border-2 border-[#2196F3]/20 overflow-hidden shadow-2xl shadow-blue-500/10">
                <div className="w-full h-full bg-gradient-to-br from-[#2196F3] to-[#00BCD4] flex items-center justify-center text-white font-bold text-2xl">
                  {profile.displayName.charAt(0).toUpperCase() || 'P'}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitName(); }}
                      onBlur={commitName}
                      maxLength={30}
                      autoFocus
                      className="flex-1 min-w-0 bg-[#282a30] border-none rounded-2xl px-4 py-2 text-lg font-[var(--font-headline)] font-bold text-[#e2e2eb] focus:outline-none focus:ring-2 focus:ring-[#2196F3]/40"
                    />
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={commitName}
                      className="p-2.5 rounded-full bg-[#2196F3]/20 text-[#9ecaff] active:scale-90 transition-all"
                      aria-label="Save name"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setIsEditingName(true)} className="flex items-center gap-2 text-left group">
                    <span className="text-2xl font-[var(--font-headline)] font-bold text-[#e2e2eb] tracking-tight truncate">
                      {profile.displayName}
                    </span>
                    <Pencil className="w-4 h-4 text-[#89919d] group-hover:text-[#9ecaff] transition-colors shrink-0" />
                  </button>
                )}
                <div className="text-xs text-[#bfc7d4] font-medium uppercase tracking-wider mt-1">
                  Local profile · stored on this device
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              <StatTile value={stats.places} label="Places" />
              <StatTile value={stats.routes} label="Routes" />
              <StatTile value={stats.reports} label="Reports" />
            </div>

            {/* Default vehicle */}
            <div>
              <div className="text-xs font-bold text-[#bfc7d4] uppercase tracking-wider mb-2">Default vehicle</div>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                {VEHICLE_OPTIONS.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setDefaultProfile({ ...profile.defaultProfile, vehicle: v.id })}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold whitespace-nowrap transition-all active:scale-95 ${
                      profile.defaultProfile.vehicle === v.id
                        ? 'bg-[#2196F3]/20 text-[#9ecaff]'
                        : 'bg-[#282a30] text-[#bfc7d4] hover:bg-[#33343b]'
                    }`}
                  >
                    <span>{v.emoji}</span>
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Default routing strategy */}
            <div>
              <div className="text-xs font-bold text-[#bfc7d4] uppercase tracking-wider mb-2">Default routing strategy</div>
              <div className="space-y-2">
                {MODE_OPTIONS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setDefaultProfile({ ...profile.defaultProfile, mode: m.id })}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl text-left transition-all active:scale-[0.99] ${
                      profile.defaultProfile.mode === m.id
                        ? 'bg-[#2196F3]/10 ring-2 ring-[#2196F3]/40'
                        : 'bg-[#1e1f26] hover:bg-[#282a30]'
                    }`}
                  >
                    <span className="text-xl">{m.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-[#e2e2eb]">{m.label}</div>
                      <div className="text-xs text-[#bfc7d4] mt-0.5">{m.description}</div>
                    </div>
                  </button>
                ))}
              </div>
              <p className="text-xs text-[#89919d] mt-2">
                Used as the starting selection whenever you plan a route.
              </p>
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-4 rounded-2xl bg-[#1e1f26]">
      <span className="text-3xl font-[var(--font-headline)] font-extrabold text-[#44d8f1]">{value}</span>
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#bfc7d4] mt-1">{label}</span>
    </div>
  );
}
