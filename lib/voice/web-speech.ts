/**
 * The system voice — Web Speech API, the floor every browser gives us.
 *
 * This is the engine SpeedBumps has always used, and it stays the one that
 * can never fail: it needs no download, no GPU and no network, so it is what
 * speaks before the neural voice has loaded and wherever that voice can't run.
 *
 * Quirks handled:
 * - iOS Safari ignores speak() until one speak happens inside a user
 *   gesture; prime() must be called from the Start button handler.
 * - Chrome can garbage-collect utterances mid-speech, so a module-level
 *   reference is held until the utterance ends.
 * - cancel() before each speak() avoids stale-queue wedges.
 * - getVoices() is empty on first call in Chrome; we hydrate on the
 *   asynchronous `voiceschanged` event.
 *
 * The voice is chosen from the best available English system voice rather
 * than the raw OS default, which is what made guidance sound "generic".
 * The driver can override the pick (persisted) from the Profile panel.
 */

const VOICE_NAME_STORAGE_KEY = 'speedbumps-voice-name';

let currentUtterance: SpeechSynthesisUtterance | null = null;
let primed = false;

let selectedVoice: SpeechSynthesisVoice | null = null;
let voicesHydrated = false;
let voicesListenerAttached = false;

// Names (substring match) of higher-quality natural voices across platforms,
// in rough preference order. Falls through to a generic en-US pick.
const PREFERRED_VOICE_HINTS = [
  'Google US English',
  'Microsoft Aria',
  'Microsoft Jenny',
  'Microsoft Guy',
  'Samantha',
  'Karen',
  'Daniel',
  'Moira',
  'Google UK English Female',
  'Google UK English Male',
];

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function getStoredVoiceName(): string | null {
  try {
    return localStorage.getItem(VOICE_NAME_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Choose the best available voice: user override → natural English → en-US → default. */
function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  const stored = getStoredVoiceName();
  if (stored) {
    const override = voices.find((v) => v.name === stored);
    if (override) return override;
  }

  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  const pool = english.length > 0 ? english : voices;

  for (const hint of PREFERRED_VOICE_HINTS) {
    const match = pool.find((v) => v.name.includes(hint));
    if (match) return match;
  }

  const enUS = pool.filter((v) => v.lang?.toLowerCase() === 'en-us');
  const preferred = enUS.length > 0 ? enUS : pool;

  const natural = preferred.find((v) => /natural|neural|premium|enhanced|google/i.test(v.name));
  if (natural) return natural;

  return preferred.find((v) => v.default) ?? preferred[0];
}

/** Hydrate the available-voices list (idempotent); Chrome loads them async. */
function ensureVoices(): void {
  if (!isSupported()) return;
  const synth = window.speechSynthesis;

  const hydrate = () => {
    const voices = synth.getVoices();
    if (voices.length > 0) {
      selectedVoice = pickBestVoice(voices);
      voicesHydrated = true;
    }
  };

  if (!voicesHydrated) hydrate();

  if (!voicesListenerAttached && 'onvoiceschanged' in synth) {
    voicesListenerAttached = true;
    synth.addEventListener('voiceschanged', hydrate);
  }
}

/** English voices available for the in-app picker. */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  if (!isSupported()) return [];
  ensureVoices();
  const voices = window.speechSynthesis.getVoices();
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  return english.length > 0 ? english : voices;
}

export function getSelectedVoiceName(): string | null {
  ensureVoices();
  return selectedVoice?.name ?? getStoredVoiceName();
}

/** Override the guidance voice by name (persisted). Empty string clears the override. */
export function setVoiceByName(name: string): void {
  try {
    if (name) localStorage.setItem(VOICE_NAME_STORAGE_KEY, name);
    else localStorage.removeItem(VOICE_NAME_STORAGE_KEY);
  } catch {
    // storage unavailable — keep in-memory only
  }
  if (isSupported()) {
    const voices = window.speechSynthesis.getVoices();
    selectedVoice = name ? voices.find((v) => v.name === name) ?? pickBestVoice(voices) : pickBestVoice(voices);
  }
}

/**
 * Unlock speech on iOS by speaking an empty utterance synchronously
 * inside a user-gesture handler. No-op elsewhere; safe to call again.
 */
export function prime(): void {
  if (!isSupported() || primed) return;
  primed = true;
  ensureVoices();
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

export function speak(text: string): void {
  if (!isSupported() || !text) return;
  ensureVoices();
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  if (selectedVoice) utterance.voice = selectedVoice;
  utterance.lang = selectedVoice?.lang ?? 'en-US';
  utterance.rate = 1.02; // a touch above default reads as confident, not rushed
  utterance.pitch = 1.0;
  const release = () => {
    if (currentUtterance === utterance) currentUtterance = null;
  };
  utterance.onend = release;
  utterance.onerror = release;
  currentUtterance = utterance;
  synth.speak(utterance);
}

export function cancel(): void {
  if (!isSupported()) return;
  currentUtterance = null;
  window.speechSynthesis.cancel();
}
