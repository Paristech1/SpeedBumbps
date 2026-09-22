/**
 * Voice guidance — the front door for everything that speaks.
 *
 * Two engines sit behind this. The **system voice** (Web Speech API) is the
 * floor: no download, no GPU, no network, always there. The **neural voice**
 * (Kokoro, in-browser) is the ceiling: the same voice on every phone, offline,
 * and it doesn't sound like a screen reader — but it costs an ~86 MB model
 * download, so it is off until the driver asks for it.
 *
 * The rule between them is that a prompt is never delayed. speak() plays a
 * neural clip only when one is already rendered; otherwise the system voice
 * says the line immediately and the neural engine renders it in the
 * background, so the same line is neural the next time it comes up. Guidance
 * repeats itself constantly, so the voice improves over a drive on its own.
 *
 * Call sites don't choose an engine — they call speak() and get the best one
 * that can answer right now.
 */

import { toImperial } from './geo-utils';
import * as systemVoice from './voice/web-speech';
import * as neuralVoice from './voice/kokoro';

export type { KokoroStatus, KokoroVoice } from './voice/kokoro';
export { SAMPLE_LINE } from './voice/phrases';

const VOICE_MUTED_STORAGE_KEY = 'speedbumps-voice-muted';

let muted: boolean | null = null; // lazily hydrated from localStorage

// --- the system voice, re-exported unchanged --------------------------------

export function isSpeechSupported(): boolean {
  return systemVoice.isSupported();
}

export const getAvailableVoices = systemVoice.getAvailableVoices;
export const getSelectedVoiceName = systemVoice.getSelectedVoiceName;
export const setVoiceByName = systemVoice.setVoiceByName;

// --- the neural voice -------------------------------------------------------

export const isNeuralVoiceSupported = neuralVoice.isSupported;
export const isNeuralVoiceEnabled = neuralVoice.isEnabled;
export const setNeuralVoiceEnabled = neuralVoice.setEnabled;
export const getNeuralVoiceStatus = neuralVoice.getStatus;
export const getNeuralVoiceProgress = neuralVoice.getProgress;
export const getNeuralVoices = neuralVoice.getVoices;
export const getNeuralVoiceId = neuralVoice.getVoiceId;
export const setNeuralVoiceId = neuralVoice.setVoiceId;
export const subscribeNeuralVoice = neuralVoice.subscribe;
export const hasWebGPU = neuralVoice.hasWebGPU;

/**
 * Start loading the neural voice, if the driver has turned it on. Call this
 * when a route is plotted: the download must not begin at the first turn.
 */
export const prewarmVoice = neuralVoice.prewarm;

/**
 * Render a route's own instructions ahead of the drive, so their street names
 * are already audio by the time they're spoken.
 */
export const prerenderVoice = neuralVoice.prerender;

/** Speak a line through the neural voice, waiting for it. Previews only — never on the road. */
export async function speakSample(text: string): Promise<boolean> {
  if (!(await neuralVoice.load())) return false;
  await neuralVoice.render(text);
  return neuralVoice.playCached(text);
}

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
 * Unlock audio on iOS. Both engines need a first play inside a user gesture,
 * so this must be called from the Start button handler.
 */
export function primeVoice(): void {
  systemVoice.prime();
  neuralVoice.prime();
}

/**
 * Say a line, now. Plays the neural clip when one is rendered, and otherwise
 * falls straight through to the system voice — this never waits on synthesis,
 * because a turn instruction that arrives late is a missed turn.
 */
export function speak(text: string): void {
  if (!text || isVoiceMuted()) return;
  cancelSpeech();
  if (neuralVoice.playCached(text)) return;
  systemVoice.speak(text);
  neuralVoice.warm(text); // so the next time this line comes up, it's neural
}

export function cancelSpeech(): void {
  systemVoice.cancel();
  neuralVoice.stop();
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
