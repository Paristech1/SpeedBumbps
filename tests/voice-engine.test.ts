/**
 * The speech engine — and specifically, whether it admits when it failed.
 *
 * A neural voice shipped here that never played on a real phone, and nothing
 * in the app could say so: speak() was fire-and-forget into an API that fails
 * silently. EasySpeech's speak() resolves on `end` and rejects on `error`, so
 * every line now has an outcome. These cases pin that down.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let speakMock: ReturnType<typeof vi.fn>;
let initMock: ReturnType<typeof vi.fn>;
let voicesMock: ReturnType<typeof vi.fn>;
let detectMock: ReturnType<typeof vi.fn>;
let cancelMock: ReturnType<typeof vi.fn>;
let resetMock: ReturnType<typeof vi.fn>;
let bareSpoke: string[];
let bareFails: boolean;

vi.mock('easy-speech', () => ({
  default: {
    get init() {
      return initMock;
    },
    get speak() {
      return speakMock;
    },
    get voices() {
      return voicesMock;
    },
    get detect() {
      return detectMock;
    },
    get cancel() {
      return cancelMock;
    },
    get reset() {
      return resetMock;
    },
  },
}));

const voice = (name: string, lang = 'en-US') =>
  ({ name, lang, default: false, localService: true, voiceURI: name }) as SpeechSynthesisVoice;

beforeEach(() => {
  vi.resetModules();
  speakMock = vi.fn(async () => ({ type: 'end' }));
  initMock = vi.fn(async () => true);
  voicesMock = vi.fn(() => [voice('Samantha'), voice('Daniel', 'en-GB')]);
  detectMock = vi.fn(() => ({ speechSynthesis: {} }));
  cancelMock = vi.fn();
  resetMock = vi.fn();

  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  // The bare-API floor speaks through these directly, bypassing the library.
  bareSpoke = [];
  bareFails = false;
  const synth = {
    cancel: vi.fn(),
    speak: (u: { text: string; onend?: () => void; onerror?: (e: unknown) => void }) => {
      if (bareFails) setTimeout(() => u.onerror?.({ error: 'synthesis-failed' }), 0);
      else {
        bareSpoke.push(u.text);
        setTimeout(() => u.onend?.(), 0);
      }
    },
  };
  vi.stubGlobal('window', { speechSynthesis: synth });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string;
      onend?: () => void;
      onerror?: (e: unknown) => void;
      constructor(text: string) {
        this.text = text;
      }
    },
  );
});

afterEach(() => vi.unstubAllGlobals());

const load = () => import('@/lib/voice/web-speech');

/** speak() is fire-and-forget; wait for the outcome it settles on. */
const settled = async (engine: Awaited<ReturnType<typeof load>>) =>
  vi.waitFor(() => {
    const o = engine.getOutcome();
    expect(o.state === 'spoke' || o.state === 'failed' || o.state === 'idle').toBe(true);
    expect(o.state).not.toBe('speaking');
    return o;
  });

describe('speak()', () => {
  it('reports that the line actually played', async () => {
    const engine = await load();

    engine.speak('Turn left');

    expect(await settled(engine)).toEqual({ state: 'spoke', text: 'Turn left', at: expect.any(Number) });
  });

  it('marks itself speaking while the line is in flight', async () => {
    let finish: (v: unknown) => void = () => {};
    speakMock = vi.fn(() => new Promise((resolve) => (finish = resolve)));
    const engine = await load();

    engine.speak('Turn left');
    await vi.waitFor(() => expect(engine.getOutcome().state).toBe('speaking'));

    finish({ type: 'end' });
  });

  it('reports a failure instead of going quietly silent', async () => {
    speakMock = vi.fn(async () => {
      throw { error: 'synthesis-failed' };
    });
    bareFails = true; // nothing left to fall back to
    const engine = await load();

    engine.speak('Turn left');

    const outcome = await settled(engine);
    expect(outcome.state).toBe('failed');
    if (outcome.state !== 'failed') return;
    expect(outcome.reason).toBe('this device has no working speech voice');
  });

  it('explains a blocked voice in terms of what to do about it', async () => {
    speakMock = vi.fn(async () => {
      throw { error: 'not-allowed' };
    });
    bareFails = true;
    const engine = await load();

    engine.speak('Turn left');

    const outcome = await settled(engine);
    if (outcome.state !== 'failed') throw new Error('expected a failure');
    expect(outcome.reason).toMatch(/start navigation/);
  });

  it('does not report being cut off by the next instruction as a failure', async () => {
    // Guidance cancels the current line to say the next one. Reporting that
    // would bury the real failures under constant noise.
    speakMock = vi.fn(async () => {
      throw { error: 'interrupted' };
    });
    const engine = await load();

    engine.speak('Turn left');

    await vi.waitFor(() => expect(speakMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(engine.getOutcome().state).not.toBe('failed');
  });

  it('hydrates the voice list before the first line rather than after it', async () => {
    const engine = await load();

    engine.speak('Turn left');

    await settled(engine);
    expect(initMock).toHaveBeenCalled();
    expect(speakMock.mock.invocationCallOrder[0]).toBeGreaterThan(initMock.mock.invocationCallOrder[0]);
  });

  it('asks for a voice it picked, not whatever the OS defaults to', async () => {
    const engine = await load();
    await engine.init();

    engine.speak('Turn left');

    await settled(engine);
    expect(speakMock).toHaveBeenCalledWith(expect.objectContaining({ voice: expect.objectContaining({ name: 'Samantha' }) }));
  });

  it('keeps Chrome from cutting off after fifteen seconds', async () => {
    const engine = await load();

    engine.speak('In a quarter mile, turn right onto South Street');

    await settled(engine);
    expect(speakMock).toHaveBeenCalledWith(expect.objectContaining({ infiniteResume: true }));
  });

  it('says nothing, and claims nothing, where speech is unsupported', async () => {
    detectMock = vi.fn(() => ({ speechSynthesis: undefined }));
    const engine = await load();

    engine.speak('Turn left');

    expect(speakMock).not.toHaveBeenCalled();
    expect(engine.getOutcome()).toEqual({ state: 'idle' });
  });
});

describe('a voice object that has gone stale', () => {
  it('is worth a second attempt — the line matters more than the voice', async () => {
    speakMock = vi.fn(async () => {
      throw { error: 'voice-unavailable' };
    });
    const engine = await load();
    await engine.init();

    engine.speak('Turn left onto South Street');

    expect(await settled(engine)).toMatchObject({ state: 'spoke' });
    expect(bareSpoke).toEqual(['Turn left onto South Street']);
  });

  it('still says the line, on the bare API', async () => {
    // iOS swaps its voice objects after backgrounding and Chrome after
    // voiceschanged. Assigning a stale one throws, and that throw used to take
    // the whole utterance down — silence, with no reason given anywhere.
    // Dropping our own voice isn't enough: the library caches one of its own
    // as a default, which is stale too.
    speakMock = vi.fn(async () => {
      throw new TypeError("Failed to set the 'voice' property");
    });
    const engine = await load();
    await engine.init();

    engine.speak('Turn left');

    expect(await settled(engine)).toMatchObject({ state: 'spoke', text: 'Turn left' });
    expect(bareSpoke).toEqual(['Turn left']);
  });

  it('throws the stale setup away so the next line starts clean', async () => {
    speakMock = vi.fn(async () => {
      throw new TypeError("Failed to set the 'voice' property");
    });
    const engine = await load();
    await engine.init();
    initMock.mockClear();

    engine.speak('Turn left');
    await settled(engine);

    expect(resetMock).toHaveBeenCalled();
    await engine.init();
    expect(initMock).toHaveBeenCalled(); // re-reads the browser's voices
  });

  it('puts a rejected voice in the driver’s terms, not the browser’s', async () => {
    speakMock = vi.fn(async () => {
      throw new TypeError("Failed to convert value to 'SpeechSynthesisVoice'");
    });
    bareFails = true;
    const engine = await load();
    await engine.init();

    engine.speak('Turn left');

    const outcome = await settled(engine);
    if (outcome.state !== 'failed') throw new Error('expected a failure');
    expect(outcome.reason).toBe('the chosen voice was rejected — pick another below');
  });

  it('reports the failure when even the bare API will not speak', async () => {
    speakMock = vi.fn(async () => {
      throw { error: 'synthesis-failed' };
    });
    bareFails = true;
    const engine = await load();
    await engine.init();

    engine.speak('Turn left');

    expect(await settled(engine)).toMatchObject({ state: 'failed' });
  });

  it('looks the chosen voice up fresh each time rather than holding the object', async () => {
    const engine = await load();
    await engine.init();
    engine.setVoiceByName('Daniel');

    // The browser hands back a whole new set of voice objects.
    const replacements = [voice('Samantha'), voice('Daniel', 'en-GB')];
    voicesMock = vi.fn(() => replacements);

    engine.speak('Turn left');

    await settled(engine);
    expect(speakMock.mock.calls[0][0].voice).toBe(replacements[1]);
  });
});

describe('init()', () => {
  it('runs once however many callers ask', async () => {
    const engine = await load();

    await Promise.all([engine.init(), engine.init(), engine.init()]);

    expect(initMock).toHaveBeenCalledTimes(1);
  });

  it('survives an engine that will not start', async () => {
    initMock = vi.fn(async () => {
      throw new Error('no voices');
    });
    const engine = await load();

    await expect(engine.init()).resolves.toBe(false);
    expect(engine.diagnostics().initialised).toBe(false);
  });
});

describe('diagnostics()', () => {
  it('reports a browser with no voices, which is the silent case', async () => {
    voicesMock = vi.fn(() => []);
    const engine = await load();
    await engine.init();

    expect(engine.diagnostics()).toMatchObject({
      supported: true,
      voiceCount: 0,
      selectedVoice: null,
    });
  });

  it('names the voice guidance will actually use', async () => {
    const engine = await load();
    await engine.init();

    expect(engine.diagnostics()).toMatchObject({ voiceCount: 2, selectedVoice: 'Samantha' });
  });
});

describe('setVoiceByName()', () => {
  it('honours the driver’s pick over the automatic one', async () => {
    const engine = await load();
    await engine.init();

    engine.setVoiceByName('Daniel');

    expect(engine.getSelectedVoiceName()).toBe('Daniel');
  });

  it('falls back to the automatic pick when the chosen voice is gone', async () => {
    const engine = await load();
    await engine.init();

    engine.setVoiceByName('A voice this phone does not have');

    expect(engine.getSelectedVoiceName()).toBe('Samantha');
  });
});
