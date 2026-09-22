/**
 * Voice guidance — the front door for everything that speaks.
 *
 * One engine: the browser's own speech synthesis, driven through EasySpeech
 * (see lib/voice/web-speech.ts). It needs no download, no GPU and no network,
 * which is what a driver in a dead zone actually has.
 *
 * There was briefly a second engine — Kokoro, a neural model run in the
 * browser. It sounded better in principle and never played on a real phone,
 * and there was no way to find that out from inside the app. It is gone. What
 * replaced it is the thing that was missing underneath: a voice that reports
 * whether it actually spoke.
 */

import { toImperial } from './geo-utils';
import * as systemVoice from './voice/web-speech';

export type { SpeechOutcome } from './voice/web-speech';

const VOICE_MUTED_STORAGE_KEY = 'speedbumps-voice-muted';

/** The line the Test button speaks — long enough to hear the voice, short enough to sit through. */
export const SAMPLE_LINE = 'In a quarter mile, turn right onto South Street. Speed bump ahead.';

let muted: boolean | null = null; // lazily hydrated from localStorage

// --- the engine -------------------------------------------------------------

export function isSpeechSupported(): boolean {
  return systemVoice.isSupported();
}

export const getAvailableVoices = systemVoice.getAvailableVoices;
export const getSelectedVoiceName = systemVoice.getSelectedVoiceName;
export const setVoiceByName = systemVoice.setVoiceByName;

/** Start hydrating the voice list. Safe and cheap to call more than once. */
export const initVoice = systemVoice.init;

/**
 * What happened to the last line, and why the voice might be silent. The
 * Profile panel reads this so a dead voice is something you can see rather
 * than something you have to guess at.
 */
export const getSpeechOutcome = systemVoice.getOutcome;
export const getVoiceDiagnostics = systemVoice.diagnostics;
export const subscribeVoice = systemVoice.subscribe;

// --- mute -------------------------------------------------------------------

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

// --- speaking ---------------------------------------------------------------

/**
 * Unlock speech inside a user gesture. iOS ignores speak() until one call has
 * happened inside one, so this must run from a tap handler — the Start button.
 */
export function primeVoice(): void {
  systemVoice.prime();
}

/** Say a line, now. */
export function speak(text: string): void {
  if (!text || isVoiceMuted()) return;
  systemVoice.speak(text);
}

/**
 * Say a line regardless of the mute setting — the Test button in the Profile
 * panel, which exists precisely to find out whether the voice works. Muting
 * guidance and then getting silence from a button labelled Test is how a
 * working voice gets reported as broken.
 */
export function speakSample(text: string = SAMPLE_LINE): void {
  systemVoice.speak(text);
}

export function cancelSpeech(): void {
  systemVoice.cancel();
}

// --- phrasing ---------------------------------------------------------------

/** Speech-friendly imperial distance phrasing (same unit split as formatDistance). */
export function speechDistance(meters: number): string {
  const { value, unit } = toImperial(meters);
  if (unit === 'ft') return `${value} feet`;
  if (value < 0.35) return 'a quarter mile';
  if (value < 0.6) return 'half a mile';
  if (value < 0.85) return 'three quarters of a mile';
  if (value < 1.25) return 'one mile';
  if (value < 10) return `${value.toFixed(1).replace(/\.0$/, '')} miles`;
  return `${Math.round(value)} miles`;
}
