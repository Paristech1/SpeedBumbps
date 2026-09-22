/**
 * The neural voice engine — loading, the clip cache, and the fallback paths.
 *
 * The model is stubbed: what's under test is the wiring that has to be right
 * for the voice to be safe to ship — that a failed load degrades to the system
 * voice instead of throwing, that a line is only ever rendered once, and that
 * the cache can't grow without bound over a long drive.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let generate: ReturnType<typeof vi.fn>;
let fromPretrained: ReturnType<typeof vi.fn>;

vi.mock('kokoro-js', () => ({
  get KokoroTTS() {
    return { from_pretrained: fromPretrained };
  },
}));

// jsdom isn't in play here, so stand in for the browser bits the engine touches.
let objectUrls = 0;
const revoked: string[] = [];
const played: string[] = [];

beforeEach(async () => {
  vi.resetModules();
  objectUrls = 0;
  revoked.length = 0;
  played.length = 0;

  generate = vi.fn(async () => ({ toBlob: () => new Blob() }));
  fromPretrained = vi.fn(async () => ({
    generate,
    voices: { af_heart: { name: 'Heart', gender: 'Female' }, am_puck: { name: 'Puck', gender: 'Male' } },
  }));

  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal('window', {});
  vi.stubGlobal('navigator', {});
  // Subclass rather than replace: the real URL constructor is still needed.
  const RealURL = globalThis.URL;
  class StubURL extends RealURL {
    static createObjectURL = () => `blob:clip-${++objectUrls}`;
    static revokeObjectURL = (u: string) => void revoked.push(u);
  }
  vi.stubGlobal('URL', StubURL);
  vi.stubGlobal(
    'Audio',
    class {
      src = '';
      preload = '';
      currentTime = 0;
      play() {
        played.push(this.src);
        return Promise.resolve();
      }
      pause() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadEngine() {
  return import('@/lib/voice/kokoro');
}

/**
 * load() renders the fixed prompt set in the background. Wait it out, so a
 * test that counts model runs isn't counting that work too.
 */
async function settle(k: Awaited<ReturnType<typeof loadEngine>>) {
  const { FIXED_PROMPTS } = await import('@/lib/voice/phrases');
  const last = FIXED_PROMPTS[FIXED_PROMPTS.length - 1];
  await vi.waitFor(() => expect(k.playCached(last)).toBe(true), { timeout: 5000 });
}

/** A line the fixed prompt set can't already hold — street names are the open case. */
const STREET_LINE = 'Turn left onto Fitzwater Street';

describe('load()', () => {
  it('comes up ready and pins the model it was tested against', async () => {
    const k = await loadEngine();

    expect(await k.load()).toBe(true);
    expect(k.getStatus()).toBe('ready');
    expect(fromPretrained).toHaveBeenCalledWith(k.KOKORO_MODEL_ID, expect.anything());
  });

  it('returns false rather than throwing when the model will not load', async () => {
    fromPretrained = vi.fn(async () => {
      throw new Error('offline');
    });
    const k = await loadEngine();

    await expect(k.load()).resolves.toBe(false);
    expect(k.getStatus()).toBe('failed');
  });

  it('only fetches once however many callers ask at the same time', async () => {
    const k = await loadEngine();

    await Promise.all([k.load(), k.load(), k.load()]);

    expect(fromPretrained).toHaveBeenCalledTimes(1);
  });

  it('offers the voices the model came with', async () => {
    const k = await loadEngine();
    await k.load();

    expect(k.getVoices()).toEqual([
      { id: 'af_heart', label: 'Heart', gender: 'Female' },
      { id: 'am_puck', label: 'Puck', gender: 'Male' },
    ]);
  });
});

describe('prewarm()', () => {
  it('does nothing until the driver has asked for the neural voice', async () => {
    const k = await loadEngine();

    k.prewarm();
    await vi.waitFor(() => expect(fromPretrained).not.toHaveBeenCalled());
  });

  it('starts the download once they have', async () => {
    const k = await loadEngine();
    k.setEnabled(true);

    await vi.waitFor(() => expect(fromPretrained).toHaveBeenCalled());
  });
});

describe('render() and playCached()', () => {
  it('renders a line once, then plays it without touching the model again', async () => {
    const k = await loadEngine();
    await k.load();
    await settle(k);
    generate.mockClear();

    expect(await k.render(STREET_LINE)).toBe(true);
    expect(k.playCached(STREET_LINE)).toBe(true);
    expect(played.at(-1)).toMatch(/^blob:clip-/);

    expect(await k.render(STREET_LINE)).toBe(false); // already have it
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('has the common prompts rendered by the time the model reports ready', async () => {
    const k = await loadEngine();
    await k.load();
    await settle(k);

    // The lines guidance says every trip are audio before the first turn.
    expect(k.playCached('Turn left')).toBe(true);
    expect(k.playCached('In a quarter mile, Turn right')).toBe(true);
    expect(k.playCached('Heads up, speed bump ahead. Take it easy.')).toBe(true);
  });

  it('reports no clip for a line it has never seen, so the caller falls back', async () => {
    const k = await loadEngine();
    await k.load();

    expect(k.playCached('Turn onto a street nobody has driven')).toBe(false);
  });

  it('renders nothing before the model is up', async () => {
    const k = await loadEngine();

    expect(await k.render(STREET_LINE)).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it('survives a synthesis failure without poisoning the cache', async () => {
    const k = await loadEngine();
    await k.load();
    await settle(k);
    generate.mockRejectedValueOnce(new Error('inference failed'));

    expect(await k.render(STREET_LINE)).toBe(false);
    expect(k.playCached(STREET_LINE)).toBe(false);

    // and the line can still be rendered later
    expect(await k.render(STREET_LINE)).toBe(true);
  });

  it('does not run the same line twice when two prompts race on it', async () => {
    const k = await loadEngine();
    await k.load();
    await settle(k);
    generate.mockClear();

    await Promise.all([k.render(STREET_LINE), k.render(STREET_LINE)]);

    expect(generate).toHaveBeenCalledTimes(1);
  });
});

describe('the clip cache', () => {
  it('evicts oldest-first past its limit and releases the blob', async () => {
    const k = await loadEngine();
    const { CLIP_CACHE_LIMIT } = await import('@/lib/voice/phrases');
    await k.load();

    await settle(k);

    const overflow = CLIP_CACHE_LIMIT + 5;
    for (let i = 0; i < overflow; i++) await k.render(`Street number ${i}`);

    // Everything still in the cache is the newest; the oldest were released.
    expect(revoked.length).toBeGreaterThan(0);
    expect(k.playCached(`Street number ${overflow - 1}`)).toBe(true);
  }, 20000);
});

describe('changing voice', () => {
  it('throws away clips in the old voice so one route never speaks in two', async () => {
    const k = await loadEngine();
    await k.load();
    await settle(k);
    await k.render(STREET_LINE);
    expect(k.playCached(STREET_LINE)).toBe(true);

    k.setVoiceId('am_puck');

    expect(k.playCached(STREET_LINE)).toBe(false);
    expect(k.getVoiceId()).toBe('am_puck');
  });
});

describe('switching off and back on', () => {
  it('goes straight back to ready without fetching the model again', async () => {
    const k = await loadEngine();
    await k.load();
    await settle(k);
    fromPretrained.mockClear();

    k.setEnabled(false);
    expect(k.getStatus()).toBe('off');

    k.setEnabled(true);
    await vi.waitFor(() => expect(k.getStatus()).toBe('ready'));
    expect(fromPretrained).not.toHaveBeenCalled();
  });

  it('re-renders the fixed prompts that were dropped on the way out', async () => {
    const k = await loadEngine();
    await k.load();
    await settle(k);

    k.setEnabled(false);
    expect(k.playCached('Turn left')).toBe(false);

    k.setEnabled(true);
    await vi.waitFor(() => expect(k.playCached('Turn left')).toBe(true), { timeout: 5000 });
  });

  it('shows progress again when re-enabled mid-download, not a blank panel', async () => {
    let release: (v: unknown) => void = () => {};
    fromPretrained = vi.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ generate, voices: {} });
        }),
    );
    const k = await loadEngine();

    const first = k.load();
    expect(k.getStatus()).toBe('loading');
    // The fetch starts behind a dynamic import, so wait until it is actually
    // in flight before pulling the rug.
    await vi.waitFor(() => expect(fromPretrained).toHaveBeenCalled());

    k.setEnabled(false);
    expect(k.getStatus()).toBe('off');

    k.setEnabled(true);
    expect(k.getStatus()).toBe('loading'); // not 'off', and not nothing

    release(null);
    await expect(first).resolves.toBe(true);
  });
});

describe('setEnabled(false)', () => {
  it('drops the clips and reports itself off', async () => {
    const k = await loadEngine();
    await k.load();
    await settle(k);
    await k.render(STREET_LINE);

    k.setEnabled(false);

    expect(k.getStatus()).toBe('off');
    expect(k.playCached(STREET_LINE)).toBe(false);
    expect(k.playCached('Turn left')).toBe(false);
  });
});
