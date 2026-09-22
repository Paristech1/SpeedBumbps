'use client';

/**
 * Profile tab — Nocturne drawer with the local on-device profile:
 * display name, stats, and default routing preferences.
 */

import { useState, useEffect, useSyncExternalStore } from 'react';
import { Drawer } from 'vaul';
import { Pencil, Check, Volume2, Play, Download, Copy, ClipboardList, Github } from 'lucide-react';
import { toast } from 'sonner';
import type { RouteAvoidanceProfile } from '@/types/speedbumps';
import type { UserProfile } from '@/types/user-data';
import { VEHICLE_OPTIONS, MODE_OPTIONS } from './RoutePlanningPanel';
import {
  isSpeechSupported,
  getAvailableVoices,
  getSelectedVoiceName,
  setVoiceByName,
  speak,
  SAMPLE_LINE,
  isNeuralVoiceSupported,
  isNeuralVoiceEnabled,
  setNeuralVoiceEnabled,
  getNeuralVoiceStatus,
  getNeuralVoiceProgress,
  getNeuralVoices,
  getNeuralVoiceId,
  setNeuralVoiceId,
  subscribeNeuralVoice,
  speakSample,
} from '@/lib/voice-guidance';
import { Skeleton } from '@/components/ui/skeleton';
import {
  subscribe as subscribeLogger,
  isCapturing,
  getEntryCount,
  startCapture,
  stopCapture,
  downloadBundle,
  copyBundle,
  clearEntries,
  fileGitHubIssue,
} from '@/lib/app-logger';

interface ProfilePanelProps {
  isOpen: boolean;
  onClose: () => void;
  profile: UserProfile;
  onUpdateProfile: (partial: Partial<UserProfile>) => void;
  stats: { places: number; routes: number; reports: number };
  onAvoidanceProfileChange: (profile: RouteAvoidanceProfile) => void;
  isLoaded?: boolean;
}

const snapPoints = [0.6, 0.92];

/** Stable empty array — useSyncExternalStore re-renders forever on a fresh one. */
const EMPTY_NEURAL_VOICES: ReturnType<typeof getNeuralVoices> = [];

export function ProfilePanel({
  isOpen,
  onClose,
  profile,
  onUpdateProfile,
  stats,
  onAvoidanceProfileChange,
  isLoaded = true,
}: ProfilePanelProps) {
  // Open expanded so all settings (voice, Log mode) are reachable/scrollable;
  // the lower peek snap can't scroll its inner content in vaul.
  const [snap, setSnap] = useState<number | string | null>(snapPoints[1]);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(profile.displayName);

  // Voice guidance picker — hydrate from the speech engine (voices load async)
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  useEffect(() => {
    if (!isSpeechSupported()) return;
    const refresh = () => {
      setVoices(getAvailableVoices());
      setVoiceName(getSelectedVoiceName());
    };
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, []);

  // Neural voice — live state from the engine (it loads a model in the background)
  const neuralStatus = useSyncExternalStore(subscribeNeuralVoice, getNeuralVoiceStatus, () => 'off' as const);
  const neuralProgress = useSyncExternalStore(subscribeNeuralVoice, getNeuralVoiceProgress, () => 0);
  const neuralVoiceList = useSyncExternalStore(subscribeNeuralVoice, getNeuralVoices, () => EMPTY_NEURAL_VOICES);
  const neuralVoiceId = useSyncExternalStore(subscribeNeuralVoice, getNeuralVoiceId, () => '');
  const [neuralOn, setNeuralOn] = useState(false);
  useEffect(() => {
    // localStorage can't be read during render or on the server
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNeuralOn(isNeuralVoiceEnabled());
  }, []);

  // Log mode — live capture state from the diagnostics logger
  const capturing = useSyncExternalStore(subscribeLogger, isCapturing, () => false);
  const entryCount = useSyncExternalStore(subscribeLogger, getEntryCount, () => 0);
  const [includePrecise, setIncludePrecise] = useState(false);

  const handleToggleCapture = () => {
    if (capturing) {
      stopCapture();
      toast.success('Log capture stopped — export the bundle below.');
    } else {
      startCapture({ includePreciseLocation: includePrecise });
      toast('Log mode on — reproduce the issue, then Stop and export.', { duration: 5000 });
    }
  };

  const handleCopyBundle = async () => {
    const ok = await copyBundle();
    toast[ok ? 'success' : 'error'](ok ? 'Diagnostics copied to clipboard' : 'Clipboard unavailable — use Download');
  };

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
      repositionInputs={false}
      snapPoints={snapPoints}
      activeSnapPoint={snap}
      setActiveSnapPoint={setSnap}
    >
      <Drawer.Portal>
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed bottom-0 left-0 right-0 !z-[1055] h-full flex flex-col rounded-t-[24px] bg-sb-surface-container-low shadow-[0_-20px_60px_rgba(0,0,0,0.5)] border-t border-sb-outline-variant/30 outline-none pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <Drawer.Title className="sr-only">Profile</Drawer.Title>
          <div className="mx-auto mt-4 mb-4 h-1.5 w-12 shrink-0 rounded-full bg-[#5B6E7F]/70" />

          <div className="flex-1 overflow-y-auto hide-scrollbar px-6 pb-32 space-y-6">
            {/* Identity */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 shrink-0 rounded-full nv-hairline overflow-hidden">
                <div className="w-full h-full flex items-center justify-center mast mast-2 text-[#B6BECB]">
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
                      className="flex-1 min-w-0 bg-transparent nv-hairline rounded-2xl px-4 py-2 mast mast-2 text-[#E6EAF0] focus:outline-none focus:border-[#E6EAF0]/50"
                    />
                    <button
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={commitName}
                      className="p-2.5 rounded-full bg-[#E6EAF0]/20 text-[#E6EAF0] active:scale-90 transition-all"
                      aria-label="Save name"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      // expand first so the on-screen keyboard can't push the field out of view
                      setSnap(snapPoints[1]);
                      setIsEditingName(true);
                    }}
                    className="flex items-center gap-2 text-left group"
                  >
                    <span className="mast mast-2 text-[#E6EAF0] truncate">
                      {profile.displayName}
                    </span>
                    <Pencil className="w-4 h-4 text-[#5B6E7F] group-hover:text-[#E6EAF0] transition-colors shrink-0" />
                  </button>
                )}
                <p className="caption mt-2">local profile · stored on this device.</p>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {isLoaded ? (
                <>
                  <StatTile value={stats.places} label="Places" />
                  <StatTile value={stats.routes} label="Routes" />
                  <StatTile value={stats.reports} label="Reports" />
                </>
              ) : (
                <>
                  <Skeleton className="h-16 rounded-2xl" />
                  <Skeleton className="h-16 rounded-2xl" />
                  <Skeleton className="h-16 rounded-2xl" />
                </>
              )}
            </div>

            {/* Default vehicle */}
            <div>
              <div className="kicker mb-3">Default vehicle</div>
              <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                {VEHICLE_OPTIONS.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setDefaultProfile({ ...profile.defaultProfile, vehicle: v.id })}
                    className={`nv-chip mono-bar px-5 py-2.5 whitespace-nowrap transition-all active:scale-95 ${
                      profile.defaultProfile.vehicle === v.id ? 'nv-chip-on' : 'hover:text-[#E6EAF0]'
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Default routing strategy */}
            <div>
              <div className="kicker mb-3">Default routing strategy</div>
              <div className="space-y-2">
                {MODE_OPTIONS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setDefaultProfile({ ...profile.defaultProfile, mode: m.id })}
                    className={`nv-frame w-full nv-hairline px-4 py-3.5 rounded-2xl text-left transition-all active:scale-[0.99] ${
                      profile.defaultProfile.mode === m.id ? 'nv-chosen-edge' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <div className={`mast mast-3 ${profile.defaultProfile.mode === m.id ? 'text-[#2BD9CE]' : 'text-[#E6EAF0]'}`}>
                      {m.label}
                    </div>
                    <div className="ui-sm text-[#5B6E7F] mt-1.5">{m.description}</div>
                  </button>
                ))}
              </div>
              <p className="ui-sm text-[#5B6E7F] mt-3">
                Used as the starting selection whenever you plan a route.
              </p>
            </div>

            {/* Voice guidance */}
            {isSpeechSupported() && (
              <div>
                <div className="flex items-center gap-2 kicker mb-3">
                  <Volume2 className="w-3.5 h-3.5" /> Navigation voice
                </div>

                {/* The engine. Neural is a one-time download, so it's the
                    driver's call, and the system voice keeps working either way. */}
                {isNeuralVoiceSupported() && (
                  <div className="mb-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setNeuralVoiceEnabled(false); setNeuralOn(false); }}
                        className={`flex-1 nv-chip mono-bar px-4 py-3 rounded-2xl transition-all ${
                          neuralOn ? 'hover:text-[#E6EAF0]' : 'nv-chosen-edge text-[#E6EAF0]'
                        }`}
                        aria-pressed={!neuralOn}
                      >
                        System
                      </button>
                      <button
                        onClick={() => { setNeuralVoiceEnabled(true); setNeuralOn(true); }}
                        className={`flex-1 nv-chip mono-bar px-4 py-3 rounded-2xl transition-all ${
                          neuralOn ? 'nv-chosen-edge text-[#E6EAF0]' : 'hover:text-[#E6EAF0]'
                        }`}
                        aria-pressed={neuralOn}
                      >
                        Natural
                      </button>
                    </div>

                    {neuralOn && (
                      <div className="mt-3">
                        {neuralStatus === 'loading' && (
                          <>
                            <div className="h-1 rounded-full bg-[#E6EAF0]/10 overflow-hidden">
                              <div
                                className="h-full bg-[#2BD9CE] transition-[width] duration-300"
                                style={{ width: `${Math.round(neuralProgress * 100)}%` }}
                              />
                            </div>
                            <p className="ui-sm text-[#5B6E7F] mt-2">
                              Downloading the voice — {Math.round(neuralProgress * 100)}%. It only
                              happens once, and guidance uses the system voice until it lands.
                            </p>
                          </>
                        )}
                        {neuralStatus === 'failed' && (
                          <p className="ui-sm text-[#FF3D8E]">
                            That voice couldn&apos;t load here. Guidance is using the system voice.
                          </p>
                        )}
                        {neuralStatus === 'ready' && neuralVoiceList.length > 0 && (
                          <div className="flex items-center gap-2">
                            <select
                              value={neuralVoiceId}
                              onChange={(e) => setNeuralVoiceId(e.target.value)}
                              className="flex-1 min-w-0 bg-transparent nv-hairline rounded-2xl px-4 py-3 ui-sm text-[#E6EAF0] focus:outline-none focus:border-[#E6EAF0]/50"
                              aria-label="Natural voice"
                            >
                              {neuralVoiceList.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.label}{v.gender ? ` — ${v.gender}` : ''}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => { void speakSample(SAMPLE_LINE); }}
                              className="nv-chip mono-bar flex items-center gap-1.5 px-4 py-3 rounded-2xl active:scale-95 transition-all whitespace-nowrap hover:text-[#E6EAF0]"
                              aria-label="Test natural voice"
                            >
                              <Play className="w-4 h-4" /> Test
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <p className="ui-sm text-[#5B6E7F] mt-3">
                      {neuralOn
                        ? 'The same voice on every phone, and it keeps working with no signal. Nothing about your route leaves the device.'
                        : 'Natural is a one-time 86 MB download that runs on your phone. It sounds like a person instead of a screen reader.'}
                    </p>
                  </div>
                )}

                {isNeuralVoiceSupported() && <div className="nv-rule mb-4" />}

                <div className="flex items-center gap-2">
                  {voices.length === 0 ? (
                    <>
                      <Skeleton className="flex-1 h-12 rounded-2xl" />
                      <Skeleton className="w-24 h-12 rounded-2xl shrink-0" />
                    </>
                  ) : (
                    <>
                      <select
                        value={voiceName ?? ''}
                        onChange={(e) => { setVoiceByName(e.target.value); setVoiceName(e.target.value || getSelectedVoiceName()); }}
                        className="flex-1 min-w-0 bg-transparent nv-hairline rounded-2xl px-4 py-3 ui-sm text-[#E6EAF0] focus:outline-none focus:border-[#E6EAF0]/50"
                        aria-label="Navigation voice"
                      >
                        <option value="">Auto (best available)</option>
                        {voices.map((v) => (
                          <option key={v.name} value={v.name}>{v.name} — {v.lang}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => speak('Heads up, speed bump ahead. Take it easy.')}
                        className="nv-chip mono-bar flex items-center gap-1.5 px-4 py-3 rounded-2xl active:scale-95 transition-all whitespace-nowrap hover:text-[#E6EAF0]"
                        aria-label="Test voice"
                      >
                        <Play className="w-4 h-4" /> Test
                      </button>
                    </>
                  )}
                </div>
                <p className="ui-sm text-[#5B6E7F] mt-3">
                  The fallback voice, used before the natural one has loaded and wherever it can&apos;t run. Some devices add more voices in their system settings.
                </p>
              </div>
            )}

            {/* Log mode — admin diagnostics */}
            <div className="rounded-2xl nv-hairline p-4">
              <div className="flex items-center gap-2 kicker mb-3">
                <ClipboardList className="w-3.5 h-3.5" /> Log mode
              </div>
              <p className="ui-sm text-[#5B6E7F] mb-3">
                Capture diagnostic logs to share back for debugging. Coordinates are coarsened and
                addresses hidden unless you opt in below.
              </p>

              <label className="flex items-center gap-2 mb-3 text-sm text-[#B6BECB] select-none">
                <input
                  type="checkbox"
                  checked={includePrecise}
                  disabled={capturing}
                  onChange={(e) => setIncludePrecise(e.target.checked)}
                  className="w-4 h-4 accent-[#E6EAF0] disabled:opacity-40"
                />
                Include precise location
              </label>

              <button
                onClick={handleToggleCapture}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-sm font-bold active:scale-[0.99] transition-all ${
                  capturing
                    ? 'bg-[#0C1416] text-[#2BD9CE]'
                    : 'bg-[#E6EAF0]/20 text-[#E6EAF0]'
                }`}
              >
                {capturing ? 'Stop capture' : 'Start capture'}
                {capturing && (
                  <span className="ml-1 inline-flex items-center gap-1 text-xs font-semibold text-[#2BD9CE]/80">
                    <span className="w-2 h-2 rounded-full bg-[#2BD9CE] animate-pulse" /> {entryCount}
                  </span>
                )}
              </button>

              <div className="flex gap-2 mt-2">
                <button
                  onClick={downloadBundle}
                  disabled={entryCount === 0}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-[#0C1416] text-[#E6EAF0] text-sm font-semibold active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" /> Download
                </button>
                <button
                  onClick={handleCopyBundle}
                  disabled={entryCount === 0}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-[#0C1416] text-[#E6EAF0] text-sm font-semibold active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Copy className="w-4 h-4" /> Copy
                </button>
              </div>

              <button
                onClick={fileGitHubIssue}
                disabled={entryCount === 0}
                className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-2xl bg-[#0C1416] text-[#E6EAF0] text-sm font-semibold active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Github className="w-4 h-4" /> File GitHub issue
              </button>
              <p className="ui-sm text-[#5B6E7F] mt-3">
                Opens a prefilled issue on paristech1/speedbumbps. Attach the downloaded bundle for the full capture.
              </p>

              {entryCount > 0 && !capturing && (
                <button
                  onClick={clearEntries}
                  className="w-full mt-2 text-xs text-[#5B6E7F] hover:text-[#E6EAF0] transition-colors"
                >
                  Clear {entryCount} captured {entryCount === 1 ? 'entry' : 'entries'}
                </button>
              )}
            </div>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="nv-frame nv-hairline flex flex-col items-center justify-center py-4 rounded-2xl">
      <span className="mast mast-2 mast-num text-[#E6EAF0]">{value}</span>
      <span className="kicker mt-2">{label}</span>
    </div>
  );
}
