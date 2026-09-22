/**
 * The neural voice — Kokoro, running entirely in the browser.
 *
 * An 82M-parameter model (Apache-2.0 weights) fetched once from the Hugging
 * Face CDN and kept in the browser's cache. After that the voice is the same
 * on every phone, works with no network, and sounds like a person instead of
 * a screen reader — which the OS voices, whatever we pick from them, do not.
 *
 * Three rules hold this together, and none of them is optional in a car:
 *
 * 1. **Never make a prompt wait.** Synthesis takes a second or two on WASM. A
 *    turn instruction that arrives a second late is a missed turn, so speak()
 *    here only ever plays a clip that is *already* rendered. Anything else is
 *    the system voice's job, and the caller falls back without pausing.
 *
 * 2. **The prompt set is nearly closed.** "Turn left", "in a quarter mile",
 *    "speed bump ahead" — the same few dozen lines, every trip. Render them
 *    once, keep them, and the driving path plays audio instead of running
 *    inference. Only street names are open-ended, and a route's own steps are
 *    rendered the moment it's plotted.
 *
 * 3. **The download is the driver's call.** ~86 MB on a metered connection is
 *    not ours to spend. It is off by default, and everything works without it.
 *
 * Nothing about the route, the destination or the driver's location leaves the
 * device: synthesis is local, and the only network call is the model fetch.
 */

import { CLIP_CACHE_LIMIT, FIXED_PROMPTS } from './phrases';

/** Pinned: the model this was tested against. */
export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
/** q8 is ~86 MB. fp32 is roughly four times that, for no audible gain here. */
const KOKORO_DTYPE = 'q8';
const DEFAULT_VOICE = 'af_heart';

const ENABLED_KEY = 'speedbumps-voice-neural';
const VOICE_KEY = 'speedbumps-voice-neural-name';

export type KokoroStatus = 'off' | 'loading' | 'ready' | 'unsupported' | 'failed';

/** A voice the driver can pick, as offered in the Profile panel. */
export interface KokoroVoice {
  id: string;
  label: string;
  gender: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type KokoroModel = { generate(text: string, opts: { voice: string; speed?: number }): Promise<any> };

let model: KokoroModel | null = null;
let loading: Promise<boolean> | null = null;
let status: KokoroStatus = 'off';
let progress = 0;
let voices: KokoroVoice[] = [];

/** Rendered clips, keyed by the exact line spoken. */
const clips = new Map<string, string>();
/** Lines being rendered right now, so two prompts don't race on the same text. */
const inFlight = new Set<string>();

let audio: HTMLAudioElement | null = null;
let primed = false;

// --- status, for the UI -----------------------------------------------------

const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStatus(): KokoroStatus {
  return status;
}

/** 0–1 while the model downloads; meaningless in any other state. */
export function getProgress(): number {
  return progress;
}

export function getVoices(): KokoroVoice[] {
  return voices;
}

function setStatus(next: KokoroStatus): void {
  if (status === next) return;
  status = next;
  emit();
}

// --- capability and opt-in --------------------------------------------------

/**
 * Whether this browser could run the model at all. WebAssembly is the floor;
 * WebGPU, where present, makes it roughly an order of magnitude faster.
 */
export function isSupported(): boolean {
  return typeof window !== 'undefined' && typeof WebAssembly === 'object';
}

export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export function isEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function getVoiceId(): string {
  try {
    return localStorage.getItem(VOICE_KEY) || DEFAULT_VOICE;
  } catch {
    return DEFAULT_VOICE;
  }
}

export function setVoiceId(id: string): void {
  if (id === getVoiceId()) return;
  try {
    localStorage.setItem(VOICE_KEY, id);
  } catch {
    // storage unavailable — the default voice still works
  }
  // Every rendered clip is in the old voice. Throw them out rather than let
  // one route speak in two voices.
  clearClips();
  if (status === 'ready') void renderFixedPrompts();
  emit();
}

/**
 * Turn the neural voice on or off. Turning it on starts the download; turning
 * it off drops the clips but leaves the model in the browser cache, so
 * changing your mind again costs nothing.
 */
export function setEnabled(value: boolean): void {
  try {
    localStorage.setItem(ENABLED_KEY, String(value));
  } catch {
    // storage unavailable — this session only
  }
  if (value) {
    void load();
  } else {
    stop();
    clearClips();
    setStatus('off');
  }
}

// --- loading ----------------------------------------------------------------

/**
 * Fetch and initialise the model. Safe to call repeatedly — the first call
 * owns the work and the rest wait on it. Returns false rather than throwing:
 * a voice that can't load is a fallback to the system voice, not an error the
 * driver should see mid-turn.
 */
export function load(): Promise<boolean> {
  // Already have it, or already fetching it. Either way put the status back
  // where it belongs: switching off and on again while a load is in flight
  // used to leave the panel showing neither progress nor a result.
  if (model) {
    if (status !== 'ready') {
      setStatus('ready');
      void renderFixedPrompts();
    }
    return Promise.resolve(true);
  }
  if (loading) {
    setStatus('loading');
    return loading;
  }
  if (!isSupported()) {
    setStatus('unsupported');
    return Promise.resolve(false);
  }

  setStatus('loading');
  progress = 0;

  loading = (async () => {
    try {
      const { KokoroTTS } = await import('kokoro-js');
      const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype: KOKORO_DTYPE,
        device: hasWebGPU() ? 'webgpu' : 'wasm',
        progress_callback: (p: any) => {
          if (p?.status === 'progress' && typeof p.progress === 'number') {
            progress = Math.min(1, p.progress / 100);
            emit();
          }
        },
      });
      model = tts as unknown as KokoroModel;
      voices = Object.entries((tts as any).voices ?? {}).map(([id, v]: [string, any]) => ({
        id,
        label: v?.name ?? id,
        gender: v?.gender ?? '',
      }));
      progress = 1;
      setStatus('ready');
      void renderFixedPrompts();
      return true;
    } catch {
      model = null;
      setStatus('failed');
      return false;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

/**
 * Load the model if the driver has asked for it. Called when a route is
 * plotted, not when the first prompt fires — an 86 MB download starting at
 * the first turn is a missed turn.
 */
export function prewarm(): void {
  if (!isEnabled() || model || loading) return;
  void load();
}

// --- rendering --------------------------------------------------------------

function clearClips(): void {
  for (const url of clips.values()) URL.revokeObjectURL(url);
  clips.clear();
}

function cache(text: string, url: string): void {
  // Oldest out first. A long drive through a street-name-heavy route would
  // otherwise hold every instruction it ever spoke.
  while (clips.size >= CLIP_CACHE_LIMIT) {
    const oldest = clips.keys().next();
    if (oldest.done) break;
    const stale = clips.get(oldest.value);
    if (stale) URL.revokeObjectURL(stale);
    clips.delete(oldest.value);
  }
  clips.set(text, url);
}

/**
 * Render one line and keep it. Resolves false if the model isn't up, the line
 * is already rendered, or synthesis failed — in every one of those cases the
 * caller has already spoken through the system voice.
 */
export async function render(text: string): Promise<boolean> {
  if (!model || !text || clips.has(text) || inFlight.has(text)) return false;
  inFlight.add(text);
  try {
    const out = await model.generate(text, { voice: getVoiceId() });
    const blob: Blob = out.toBlob();
    cache(text, URL.createObjectURL(blob));
    return true;
  } catch {
    return false;
  } finally {
    inFlight.delete(text);
  }
}

/** Render the lines that never change, so the common prompts are instant. */
async function renderFixedPrompts(): Promise<void> {
  for (const line of FIXED_PROMPTS) {
    if (!model) return; // turned off mid-render
    await render(line);
  }
}

/**
 * Render a route's own instructions ahead of the drive. Called on plot, so by
 * the time the first turn comes up its wording is already audio.
 */
export function prerender(lines: string[]): void {
  if (!isEnabled()) return;
  void (async () => {
    if (!(await load())) return;
    for (const line of lines) await render(line);
  })();
}

// --- speaking ---------------------------------------------------------------

/**
 * Unlock audio playback inside a user gesture, the same way the system voice
 * needs unlocking on iOS. Without this the first clip is silently dropped.
 */
export function prime(): void {
  if (primed || typeof Audio === 'undefined') return;
  primed = true;
  audio = new Audio();
  audio.preload = 'auto';
  // A zero-length WAV: enough to satisfy the gesture requirement, inaudible.
  audio.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA=';
  void audio.play().catch(() => {});
}

/**
 * Play the rendered clip for this line, if there is one. Returns false when
 * there isn't — the caller then speaks it with the system voice and doesn't
 * wait on us.
 */
export function playCached(text: string): boolean {
  const url = clips.get(text);
  if (!url || typeof Audio === 'undefined') return false;
  try {
    if (!audio) audio = new Audio();
    audio.src = url;
    void audio.play().catch(() => {});
    return true;
  } catch {
    return false;
  }
}

/**
 * Render this line in the background so the next time it comes up it's
 * instant. Guidance repeats itself constantly, so the voice upgrades itself
 * over a drive without ever holding a prompt up.
 */
export function warm(text: string): void {
  if (!model || !isEnabled()) return;
  void render(text);
}

export function stop(): void {
  if (!audio) return;
  try {
    audio.pause();
    audio.currentTime = 0;
  } catch {
    // nothing playing
  }
}

/** Test seam: forget the loaded model and every rendered clip. */
export function reset(): void {
  stop();
  clearClips();
  inFlight.clear();
  model = null;
  loading = null;
  voices = [];
  progress = 0;
  status = 'off';
}
