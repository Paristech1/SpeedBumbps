/**
 * The guidance voice — Web Speech API, via EasySpeech.
 *
 * This used to be a hand-rolled wrapper around `speechSynthesis`, carrying its
 * own fixes for the quirks that make that API unreliable: the iOS gesture
 * unlock, Chrome garbage-collecting a live utterance, `getVoices()` coming
 * back empty on the first call. Each fix was right on its own, and the whole
 * still went silent on a real phone with nothing to say why.
 *
 * EasySpeech exists for exactly that problem and has been tested across
 * browsers far more widely than this app can manage. It owns the quirks now:
 * waiting for voices to hydrate, the resume-infinity loop that stops Chrome
 * cutting off after ~15 seconds, and the ordering around cancel().
 *
 * What this module adds is the part that was actually missing: **a voice that
 * fails loudly.** EasySpeech.speak() resolves on `end` and rejects on `error`,
 * so every line spoken has an outcome, and the last one is readable from the
 * Profile panel. A voice that doesn't play now says so.
 */

import EasySpeech from 'easy-speech';

const VOICE_NAME_STORAGE_KEY = 'speedbumps-voice-name';

/** How long to wait for the browser to hand over its voice list. */
const INIT_MAX_TIMEOUT_MS = 5000;
const INIT_INTERVAL_MS = 250;

/** Names (substring match) of higher-quality natural voices across platforms. */
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

/** What happened to the last line we tried to say. */
export type SpeechOutcome =
  | { state: 'idle' }
  | { state: 'speaking'; text: string }
  | { state: 'spoke'; text: string; at: number }
  | { state: 'failed'; text: string; reason: string; at: number };

let initPromise: Promise<boolean> | null = null;
let ready = false;
/**
 * The chosen voice by NAME, never as an object.
 *
 * A SpeechSynthesisVoice held across time goes stale — iOS swaps its voice
 * objects after the app is backgrounded, Chrome after `voiceschanged` — and
 * assigning a stale one to an utterance throws a TypeError. That throw took
 * the whole speak() down, which is silence with no reason given. Resolving the
 * name against the current list each time cannot go stale.
 */
let selectedVoiceName: string | null = null;
let outcome: SpeechOutcome = { state: 'idle' };

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOutcome(): SpeechOutcome {
  return outcome;
}

function setOutcome(next: SpeechOutcome): void {
  outcome = next;
  emit();
}

export function isSupported(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return !!EasySpeech.detect().speechSynthesis;
  } catch {
    return false;
  }
}

/** Everything the Profile panel needs to explain a silent voice. */
export function diagnostics(): {
  supported: boolean;
  initialised: boolean;
  voiceCount: number;
  selectedVoice: string | null;
  outcome: SpeechOutcome;
} {
  return {
    supported: isSupported(),
    initialised: ready,
    voiceCount: listVoices().length,
    selectedVoice: resolveVoice()?.name ?? null,
    outcome,
  };
}

// --- voices -----------------------------------------------------------------

function getStoredVoiceName(): string | null {
  try {
    return localStorage.getItem(VOICE_NAME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function listVoices(): SpeechSynthesisVoice[] {
  try {
    return EasySpeech.voices() ?? [];
  } catch {
    return [];
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

/** English voices available for the in-app picker. */
export function getAvailableVoices(): SpeechSynthesisVoice[] {
  const voices = listVoices();
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  return english.length > 0 ? english : voices;
}

/** The live voice for the chosen name, looked up fresh. Null means "browser default". */
function resolveVoice(): SpeechSynthesisVoice | null {
  const voices = listVoices();
  if (voices.length === 0) return null;
  if (selectedVoiceName) {
    const match = voices.find((v) => v.name === selectedVoiceName);
    if (match) return match;
  }
  return pickBestVoice(voices);
}

export function getSelectedVoiceName(): string | null {
  return resolveVoice()?.name ?? selectedVoiceName ?? getStoredVoiceName();
}

/** Override the guidance voice by name (persisted). Empty string clears the override. */
export function setVoiceByName(name: string): void {
  try {
    if (name) localStorage.setItem(VOICE_NAME_STORAGE_KEY, name);
    else localStorage.removeItem(VOICE_NAME_STORAGE_KEY);
  } catch {
    // storage unavailable — keep in-memory only
  }
  selectedVoiceName = name || null;
  emit();
}

// --- setup ------------------------------------------------------------------

/**
 * Hand the browser time to produce its voice list. Idempotent, and safe to
 * call from anywhere — the first caller owns the work.
 */
export function init(): Promise<boolean> {
  if (initPromise) return initPromise;
  if (!isSupported()) return Promise.resolve(false);

  initPromise = EasySpeech.init({
    maxTimeout: INIT_MAX_TIMEOUT_MS,
    interval: INIT_INTERVAL_MS,
    quiet: true, // a browser with no voices is a fallback, not an exception
  })
    .then((ok) => {
      ready = ok;
      if (ok && !selectedVoiceName) selectedVoiceName = getStoredVoiceName();
      emit();
      return ok;
    })
    .catch(() => {
      ready = false;
      emit();
      return false;
    });

  return initPromise;
}

/**
 * Unlock speech inside a user gesture — iOS ignores speak() until one call
 * happens inside one. Must be called from a tap handler (the Start button).
 *
 * The empty utterance goes through EasySpeech with `force`, because at this
 * point nothing is initialised yet and the point is purely to satisfy the
 * gesture requirement.
 */
export function prime(): void {
  void init();
  if (!isSupported()) return;
  try {
    void EasySpeech.speak({ text: ' ', force: true, volume: 0 }).catch(() => {});
  } catch {
    // nothing to unlock
  }
}

// --- speaking ---------------------------------------------------------------

/**
 * Say a line.
 *
 * Fire-and-forget by design — guidance can't await anything — but the outcome
 * is recorded either way, so a voice that never plays is visible in the
 * Profile panel instead of being a mystery.
 */
export function speak(text: string): void {
  if (!text || !isSupported()) return;
  setOutcome({ state: 'speaking', text });

  void (async () => {
    await init();
    const voice = resolveVoice();
    try {
      await utter(text, voice);
      setOutcome({ state: 'spoke', text, at: Date.now() });
      return;
    } catch (err) {
      const code = errorCode(err);
      // Guidance cancels the current line to say the next one. That is the
      // design working, not a fault, and reporting it would bury the real ones.
      if (code === 'interrupted' || code === 'canceled') return;

      // Something about our setup stopped the line being spoken. The usual
      // culprit is a stale voice object — and EasySpeech caches one of its own
      // as a default, so dropping ours isn't enough to get past it. Throw the
      // whole arrangement away and say the line on the bare API, with nothing
      // configured at all. A driver needs the instruction far more than they
      // need it in the voice they picked.
      invalidate();
      try {
        await utterBare(text);
        setOutcome({ state: 'spoke', text, at: Date.now() });
        return;
      } catch {
        // nothing left to try
      }
      setOutcome({ state: 'failed', text, reason: describeFailure(code), at: Date.now() });
    }
  })();
}

/**
 * Say a line on the raw Web Speech API, configuring nothing.
 *
 * The floor under everything else. No voice, no rate, no library — so none of
 * the things that can be stale or wrong are in the way. If this is silent, the
 * device genuinely cannot speak.
 */
function utterBare(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(event);
      synth.speak(utterance);
    } catch (err) {
      reject(err);
    }
  });
}

/** Drop everything cached, so the next line re-reads the browser's voices. */
function invalidate(): void {
  initPromise = null;
  ready = false;
  try {
    EasySpeech.reset();
  } catch {
    // nothing to reset
  }
}

function utter(text: string, voice: SpeechSynthesisVoice | null): Promise<unknown> {
  return EasySpeech.speak({
    text,
    ...(voice ? { voice } : {}),
    rate: 1.02, // a touch above default reads as confident, not rushed
    pitch: 1,
    volume: 1,
    force: true, // guidance outranks whatever is mid-sentence
    infiniteResume: true, // Chrome otherwise stops after ~15s
  });
}

function errorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'error' in err) {
    return String((err as { error: unknown }).error);
  }
  return err instanceof Error ? err.message : '';
}

/** Turn a SpeechSynthesisErrorEvent into something a driver can act on. */
export function describeFailure(code: string): string {
  switch (code) {
    case 'not-allowed':
      return 'the browser blocked it — start navigation once to allow audio';
    case 'audio-busy':
      return 'audio is busy — another app may be using it';
    case 'synthesis-unavailable':
    case 'synthesis-failed':
      return 'this device has no working speech voice';
    case 'language-unavailable':
    case 'voice-unavailable':
      return 'that voice is unavailable — pick another below';
    case 'network':
      return 'that voice needs a connection and there is none';
    default:
      // A TypeError from assigning a voice the browser no longer recognises —
      // the raw message is developer-facing, and the driver's move is the same
      // either way.
      if (/voice/i.test(code)) return 'the chosen voice was rejected — pick another below';
      return code || 'no reason given by the browser';
  }
}

export function cancel(): void {
  if (!isSupported()) return;
  try {
    EasySpeech.cancel();
  } catch {
    // nothing speaking
  }
  if (outcome.state === 'speaking') setOutcome({ state: 'idle' });
}

/** Test seam. */
export function reset(): void {
  initPromise = null;
  ready = false;
  selectedVoiceName = null;
  outcome = { state: 'idle' };
}
