/**
 * Voice guidance.
 *
 * The bug this suite exists for: the voice went silent on a real phone and
 * there was no way to tell from inside the app. Every case below is either
 * "the line reaches the engine" or "a failure is reported rather than
 * swallowed".
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const engine = vi.hoisted(() => ({
  isSupported: vi.fn(() => true),
  diagnostics: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  getOutcome: vi.fn(() => ({ state: 'idle' as const })),
  getAvailableVoices: vi.fn(() => []),
  getSelectedVoiceName: vi.fn(() => null),
  setVoiceByName: vi.fn(),
  init: vi.fn(async () => true),
  prime: vi.fn(),
  speak: vi.fn(),
  cancel: vi.fn(),
  reset: vi.fn(),
}));

vi.mock('@/lib/voice/web-speech', () => engine);

import {
  speak,
  speakSample,
  primeVoice,
  cancelSpeech,
  setVoiceMuted,
  speechDistance,
  SAMPLE_LINE,
} from '@/lib/voice-guidance';

describe('speak()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setVoiceMuted(false);
  });

  it('hands the line to the engine', () => {
    speak('Turn left onto South Street');

    expect(engine.speak).toHaveBeenCalledWith('Turn left onto South Street');
  });

  it('says nothing when muted', () => {
    setVoiceMuted(true);

    speak('Turn left');

    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('ignores an empty line', () => {
    speak('');

    expect(engine.speak).not.toHaveBeenCalled();
  });

  it('stops speaking when muted mid-sentence', () => {
    setVoiceMuted(true);

    expect(engine.cancel).toHaveBeenCalled();
  });
});

describe('speakSample()', () => {
  beforeEach(() => vi.clearAllMocks());

  it('speaks through the mute setting', () => {
    // A Test button that is silent because guidance is muted is exactly how a
    // working voice gets reported as broken.
    setVoiceMuted(true);

    speakSample();

    expect(engine.speak).toHaveBeenCalledWith(SAMPLE_LINE);
    setVoiceMuted(false);
  });

  it('takes a line of its own when given one', () => {
    speakSample('Testing, one two.');

    expect(engine.speak).toHaveBeenCalledWith('Testing, one two.');
  });
});

describe('primeVoice()', () => {
  it('unlocks the engine — iOS ignores speech until it happens in a gesture', () => {
    vi.clearAllMocks();

    primeVoice();

    expect(engine.prime).toHaveBeenCalled();
  });
});

describe('cancelSpeech()', () => {
  it('stops the engine', () => {
    vi.clearAllMocks();

    cancelSpeech();

    expect(engine.cancel).toHaveBeenCalled();
  });
});

describe('speechDistance()', () => {
  it('rounds to phrases a driver can act on, not decimals', () => {
    expect(speechDistance(30)).toMatch(/feet$/);
    expect(speechDistance(400)).toBe('a quarter mile');
    expect(speechDistance(800)).toBe('half a mile');
    expect(speechDistance(1200)).toBe('three quarters of a mile');
    expect(speechDistance(1600)).toBe('one mile');
  });

  it('keeps one decimal in the middle distances and whole miles past ten', () => {
    expect(speechDistance(4000)).toBe('2.5 miles');
    expect(speechDistance(32000)).toBe('20 miles');
  });
});
