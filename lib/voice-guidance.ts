/**
 * Voice guidance speech service — Web Speech API singleton.
 *
 * Uses the on-device OS speech engine (free, no API key). Quirks handled:
 * - iOS Safari ignores speak() until one speak happens inside a user
 *   gesture; primeVoice() must be called from the Start button handler.
 * - Chrome can garbage-collect utterances mid-speech, so a module-level
 *   reference is held until the utterance ends.
 * - cancel() before each speak() avoids stale-queue wedges.
 */

const VOICE_MUTED_STORAGE_KEY = 'speedbumps-voice-muted';

let muted: boolean | null = null; // lazily hydrated from localStorage
let currentUtterance: SpeechSynthesisUtterance | null = null;
let primed = false;

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function isVoiceMuted(): boolean {
  if (muted === null) {
    try {
      muted = localStorage.getItem(VOICE_MUTED_STORAGE_KEY) === 'true';
    } catch {
      muted = false;
    }
  }
  return muted;
}

export function setVoiceMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(VOICE_MUTED_STORAGE_KEY, String(value));
  } catch {
    // storage unavailable — keep in-memory value
  }
  if (value) cancelSpeech();
}

/**
 * Unlock speech on iOS by speaking an empty utterance synchronously
 * inside a user-gesture handler. No-op elsewhere; safe to call again.
 */
export function primeVoice(): void {
  if (!isSpeechSupported() || primed) return;
  primed = true;
  window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
}

export function speak(text: string): void {
  if (!isSpeechSupported() || isVoiceMuted() || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  const release = () => {
    if (currentUtterance === utterance) currentUtterance = null;
  };
  utterance.onend = release;
  utterance.onerror = release;
  currentUtterance = utterance;
  synth.speak(utterance);
}

export function cancelSpeech(): void {
  if (!isSpeechSupported()) return;
  currentUtterance = null;
  window.speechSynthesis.cancel();
}

/** Speech-friendly distance phrasing (same unit split as formatDistance). */
export function speechDistance(meters: number): string {
  if (meters < 1000) {
    const rounded = Math.max(50, Math.round(meters / 50) * 50);
    return `${rounded} meters`;
  }
  const miles = meters / 1609.34;
  if (miles < 0.35) return 'a quarter mile';
  if (miles < 0.7) return 'half a mile';
  if (miles < 1.4) return 'one mile';
  return `${Math.round(miles)} miles`;
}
