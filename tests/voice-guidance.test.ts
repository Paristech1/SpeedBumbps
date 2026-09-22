/**
 * Voice guidance — the engine handover.
 *
 * The rule under test is the one that matters in a car: a prompt is never
 * delayed. The neural voice speaks only when a clip is already rendered; in
 * every other case the system voice answers immediately and the neural engine
 * renders in the background for next time.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const systemVoice = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  getAvailableVoices: vi.fn(() => []),
  getSelectedVoiceName: vi.fn(() => null),
  setVoiceByName: vi.fn(),
  prime: vi.fn(),
  speak: vi.fn(),
  cancel: vi.fn(),
}));

const neuralVoice = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  hasWebGPU: vi.fn(() => false),
  isEnabled: vi.fn(() => true),
  setEnabled: vi.fn(),
  getStatus: vi.fn(() => 'ready' as const),
  getProgress: vi.fn(() => 1),
  getVoices: vi.fn(() => []),
  getVoiceId: vi.fn(() => 'af_heart'),
  setVoiceId: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  load: vi.fn(async () => true),
  render: vi.fn(async () => true),
  prewarm: vi.fn(),
  prerender: vi.fn(),
  prime: vi.fn(),
  playCached: vi.fn(() => false),
  warm: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/lib/voice/web-speech', () => systemVoice);
vi.mock('@/lib/voice/kokoro', () => neuralVoice);

import { speak, primeVoice, setVoiceMuted, speechDistance } from '@/lib/voice-guidance';
import { FIXED_PROMPTS, CLIP_CACHE_LIMIT } from '@/lib/voice/phrases';

describe('speak()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVoiceMuted(false);
    neuralVoice.playCached.mockReturnValue(false);
  });

  it('plays the neural clip when one is rendered, and stays off the system voice', () => {
    neuralVoice.playCached.mockReturnValue(true);

    speak('Turn left');

    expect(neuralVoice.playCached).toHaveBeenCalledWith('Turn left');
    expect(systemVoice.speak).not.toHaveBeenCalled();
  });

  it('falls through to the system voice immediately when no clip is rendered', () => {
    speak('Turn right onto South Street');

    expect(systemVoice.speak).toHaveBeenCalledWith('Turn right onto South Street');
  });

  it('renders the line in the background so the next time it is neural', () => {
    speak('Turn right onto South Street');

    expect(neuralVoice.warm).toHaveBeenCalledWith('Turn right onto South Street');
  });

  it('never awaits synthesis — a late turn instruction is a missed turn', () => {
    // render() resolving would be the only way speak() could block; prove it is
    // never the thing standing between the call and audible speech.
    neuralVoice.render.mockImplementation(() => new Promise(() => {})); // never settles

    speak('Turn left');

    expect(systemVoice.speak).toHaveBeenCalledWith('Turn left');
  });

  it('cancels whatever is speaking before starting the next line', () => {
    speak('Turn left');

    expect(systemVoice.cancel).toHaveBeenCalled();
    expect(neuralVoice.stop).toHaveBeenCalled();
  });

  it('says nothing at all when muted', () => {
    setVoiceMuted(true);

    speak('Turn left');

    expect(systemVoice.speak).not.toHaveBeenCalled();
    expect(neuralVoice.playCached).not.toHaveBeenCalled();
    expect(neuralVoice.warm).not.toHaveBeenCalled();
  });

  it('ignores an empty line', () => {
    speak('');

    expect(systemVoice.speak).not.toHaveBeenCalled();
    expect(neuralVoice.playCached).not.toHaveBeenCalled();
  });
});

describe('primeVoice()', () => {
  it('unlocks both engines — iOS needs a gesture for each', () => {
    vi.clearAllMocks();

    primeVoice();

    expect(systemVoice.prime).toHaveBeenCalled();
    expect(neuralVoice.prime).toHaveBeenCalled();
  });
});

describe('the fixed prompt set', () => {
  it('covers every line speak() is handed by the distance tiers', () => {
    // useVoiceGuidance builds the early tier as `In ${speechDistance(d)}, ${instruction}`.
    expect(FIXED_PROMPTS).toContain('In a quarter mile, Turn left');
    expect(FIXED_PROMPTS).toContain('In half a mile, Turn right');
    expect(FIXED_PROMPTS).toContain('Turn left');
  });

  it('covers the bump alerts and the arrival line verbatim', () => {
    expect(FIXED_PROMPTS).toContain('Heads up, speed bump ahead. Take it easy.');
    expect(FIXED_PROMPTS).toContain('Caution — rough speed bump just ahead. Ease off the gas.');
    expect(FIXED_PROMPTS).toContain("You've arrived — smooth all the way. Nice driving!");
  });

  it('leaves headroom above the fixed set for a route’s own street names', () => {
    expect(CLIP_CACHE_LIMIT).toBeGreaterThan(FIXED_PROMPTS.length);
  });

  it('holds no duplicates — each one is a model run at startup', () => {
    expect(new Set(FIXED_PROMPTS).size).toBe(FIXED_PROMPTS.length);
  });
});

describe('speechDistance()', () => {
  it('produces the phrasings the fixed prompt set was built from', () => {
    // 400 m ≈ 0.25 mi, 800 m ≈ 0.5 mi, 1600 m ≈ 1 mi
    expect(FIXED_PROMPTS).toContain(`In ${speechDistance(400)}, Turn left`);
    expect(FIXED_PROMPTS).toContain(`In ${speechDistance(800)}, Turn left`);
    expect(FIXED_PROMPTS).toContain(`In ${speechDistance(1600)}, Turn left`);
  });
});
