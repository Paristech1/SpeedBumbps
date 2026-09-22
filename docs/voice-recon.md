# Navigation voices — GitHub recon

What exists on GitHub that would give SpeedBumps a better guidance voice than
the one it has, and what it would cost to adopt.

Run on 2026-09-22. Vetted against MITRE ATT&CK and MITRE ATLAS v6
(`ATLAS-2026.09.yaml`). Star counts come from the GitHub search API this run;
last-commit dates and licenses come from shallow clones.

---

## What SpeedBumps does today

`lib/voice-guidance.ts` drives the browser's Web Speech API. It picks the best
available English system voice from a hint list (Google US English, Microsoft
Aria, Samantha…), handles the iOS user-gesture unlock, the Chrome
garbage-collection bug and the async `voiceschanged` hydration, and lets the
driver override the pick from the Profile panel.

That is a careful implementation of a weak foundation. The ceiling is whatever
voices the OS ships, so the same route sounds different on every phone, the
voice list is unknowable at build time, and on a stock Android the result is
noticeably robotic. The phrasing side is hand-rolled too:
`lib/maneuver-display.ts` splits an instruction into action and detail with a
local rule table, and `speechDistance()` covers English only.

Two separate gaps, then: **the voice** and **the words**.

---

## Vetted repos

| # | Repo | Region | Last commit | Stars | License | Risk | Why it matters |
|---|---|---|---|---|---|---|---|
| 1 | [hexgrad/kokoro](https://github.com/hexgrad/kokoro) (`kokoro-js`) | Global | 2025-08-06 | — | Apache-2.0 | 🟢 | 82M-param neural TTS, 54 voices, runs 100% in the browser on WebGPU or WASM |
| 2 | [xenova/kokoro-web](https://github.com/xenova/kokoro-web) | Global | 2025-02-14 | 179 | Apache-2.0 | 🟢 | Reference wiring of kokoro-js in a TS web app, by the Transformers.js author |
| 3 | [met4citizen/HeadTTS](https://github.com/met4citizen/HeadTTS) | Global | 2026-04-03 | 176 | MIT | 🟢 | Same model with phoneme timestamps; worker-based, no eSpeak, no GPL |
| 4 | [rhulha/StreamingKokoroJS](https://github.com/rhulha/StreamingKokoroJS) | Global | 2025-06-12 | 372 | Apache-2.0 | 🟢 | Streams audio chunk by chunk so speech starts before synthesis finishes |
| 5 | [leaonline/easy-speech](https://github.com/leaonline/easy-speech) | Global | 2025-11-23 | 266 | MIT | 🟢 | Every Web Speech API browser quirk, already fixed and tested |
| 6 | [Project-OSRM/osrm-text-instructions](https://github.com/Project-OSRM/osrm-text-instructions) | Global | 2026-09-20 | 106 | BSD-2-Clause | 🟢 | The canonical turn-phrasing tables — 31 languages |
| 7 | [ayutaz/piper-plus](https://github.com/ayutaz/piper-plus) | JP | 2026-09-20 | 214 | MIT | 🟡 | Piper VITS with an npm WASM build; 6 languages, streaming |
| 8 | [k2-fsa/sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) | CN | 2026-09-21 | 14894 | Apache-2.0 | 🟢 | Offline TTS across 12 languages incl. a WASM target |
| 9 | [steveseguin/tts.rocks](https://github.com/steveseguin/tts.rocks) | Global | 2025-08-29 | 40 | none | 🟡 | Side-by-side of Kokoro / Kitten / Piper in one browser page |
| 10 | [sauravpanda/BrowserAI](https://github.com/sauravpanda/BrowserAI) | Global | 2026-04-23 | 1451 | MIT | 🟢 | Model-loading and caching patterns for in-browser inference |
| 11 | [PimpinPumpkin/Vela](https://github.com/PimpinPumpkin/Vela) | Global | 2026-09-21 | 415 | GPL-3.0 | 🟢 | A current FOSS turn-by-turn app — ideas only, the license rules out code |
| 12 | [rany2/edge-tts](https://github.com/rany2/edge-tts) | Global | 2026-09-22 | 11991 | GPL-3.0 | 🔴 | Microsoft neural voices with no API key — see below |

Regions that came up short: pt-BR and DE produced nothing on topic. The
Portuguese and German searches returned general-purpose lists, not navigation
or browser-TTS work. JP and CN each contributed one repo.

---

## Security findings

Nothing malicious in any repo kept above. Every grep hit was read in place:

| Repo | Technique | Evidence | Verdict |
|---|---|---|---|
| hexgrad/kokoro | T1620 reflective loading | `kokoro/pipeline.py:109`, `examples/export.py:142` | Clean — `.eval()` is PyTorch eval mode, not `eval()` |
| piper-plus | T1105 ingress tool transfer | `.github/workflows/integration-tests-issue-426.yml:61,108` | Clean — `astral.sh/uv/install.sh`, a known vendor, in CI only |
| piper-plus | T1195 CI compromise | `.github/workflows/release-drafter.yml:32` | Clean — a JP comment saying to add `pull_request_target` later; no such workflow exists |
| piper-plus | AML.T0081 agent config | `src/wasm/g2p/test/test-ssml.js:128` | Clean — `"yolo"` is an SSML fixture string |
| piper-plus, Vela | AML.T0110.000 tool poisoning | `CLAUDE.md` in both | Clean — ordinary contributor guides, no instructions aimed at a visiting agent |
| tts.rocks | T1027 obfuscated files | `thirdparty/ort.min.js`, `thirdparty/espeakng.worker.js` | Yellow — known libraries (ONNX Runtime, eSpeak-NG WASM), but vendored unpinned with no integrity hashes |
| all | AML.T0068 hidden unicode | — | No hits |
| all | T1552 credential paths, T1071 C2 | — | No hits |

**edge-tts is the one to leave alone.** It reaches an undocumented Microsoft
Edge endpoint with a hardcoded client token to get free neural voices. No
malice, but it is an unauthorised use of someone else's service that can be
cut off without notice, and it is GPL-3.0, which SpeedBumps cannot take code
from. Excluded from the feature list.

### Scan of SpeedBumps itself

`scan.sh` on this repo: no install hooks, no `curl | bash`, no `eval`, no
credential paths, no hardcoded hosts or webhooks, no `pull_request_target`, no
hidden Unicode, no shell-out calls at all. The only `npx` mentions are
`npx tsc --noEmit` in `tests/qa/place-search-qa.md` and
`docs/search-fix-plan.md`. Nothing to fix.

---

## Dropped

| Repo | Reason |
|---|---|
| coqui-ai/TTS, NVIDIA NeMo, Amphion, espnet, StyleTTS2, VITS | Python training toolkits — nothing to run in a browser |
| rhasspy/piper | Archived upstream; piper-plus is the live fork |
| supertone-oss-archive/supertonic | Archived |
| VOICEVOX, AivisSpeech | Japanese-only voices, desktop apps |
| OpenVoiceOS/ovos-tts-plugin-piper | Archived, marked deprecated |
| rany2/edge-tts | 🔴 — unauthorised endpoint use, GPL-3.0 |

---

## Feature ideas, ranked

| # | Feature | Seen in | Effort | Reuse code? |
|---|---|---|---|---|
| 1 | Kokoro neural voice, downloaded once and cached, with Web Speech as the fallback | kokoro-js, kokoro-web | M | Yes — Apache-2.0 |
| 2 | Pre-synthesise the fixed prompt set at install and play them as audio | — (follows from 1) | S | n/a |
| 3 | Voice picker showing real samples instead of opaque OS voice names | kokoro-web | S | Yes |
| 4 | Swap the hand-rolled phrasing for the OSRM instruction tables | osrm-text-instructions | S | Yes — BSD-2 |
| 5 | Spanish guidance (Philadelphia's second language) | osrm-text-instructions + Kokoro `ef_*` | M | Yes |
| 6 | Replace the hand-rolled Web Speech quirk handling with EasySpeech | easy-speech | S | Yes — MIT |
| 7 | Stream long instructions so speech starts before synthesis ends | StreamingKokoroJS | M | Yes — Apache-2.0 |
| 8 | Prewarm the model when a route is plotted, not when the first prompt fires | BrowserAI | S | Idea only |
| 9 | Distinct voice treatment for the bump warning vs. the turn instruction | — | S | n/a |

---

## Top pick: Kokoro as the voice, Web Speech as the floor

> **Built.** `lib/voice/` holds the two engines behind `lib/voice-guidance.ts`;
> the driver turns the neural one on from the Profile panel. What follows is
> the plan it was built from — the shipped code differs in one place, noted
> below.

One 82M-parameter model, about 86 MB at `q8`, downloaded once and kept in the
browser cache. After that the voice is identical on every phone, works with no
network, and sounds like a person rather than a screen reader. Web Speech stays
as the fallback for browsers that can't run it and for the first drive before
the download finishes.

The unlock is that navigation prompts are a nearly closed set. "Turn left",
"in a quarter mile", "speed bump ahead" — the same few dozen phrases, every
trip. Synthesise them once at first run, keep the clips, and the driving path
plays cached audio with no inference at all. Only street names need synthesis
in flight, and those can be pre-rendered per route the moment it's plotted.
That is what keeps a neural voice viable in a car.

### Files

```
lib/
  voice-guidance.ts          ← becomes a thin front for the engines
  voice/
    engine.ts                ← VoiceEngine interface + pickEngine()
    web-speech-engine.ts     ← today's code, moved behind the interface
    kokoro-engine.ts         ← new: kokoro-js, model cache, prewarm
    phrase-bank.ts           ← new: the fixed prompt set, synthesised once
hooks/
  useVoiceGuidance.ts        ← unchanged call sites
components/map/
  VoicePicker.tsx            ← samples per voice, engine chooser
```

### Install

```bash
npm i kokoro-js@1.2.1        # pulls @huggingface/transformers ^3.5.1, phonemizer ^1.2.1
```

Check with `osv-scanner` before committing the lockfile — the sandbox this was
run in has no access to the OSV database, so that step has not been done yet.

### The pattern

```ts
// lib/voice/kokoro-engine.ts
import { KokoroTTS } from 'kokoro-js';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

let tts: KokoroTTS | null = null;

/** Load the model once. Called when a route is plotted, not when the first
 *  prompt fires — an 86 MB download at the first turn is a missed turn. */
export async function prewarm(): Promise<boolean> {
  if (tts) return true;
  try {
    tts = await KokoroTTS.from_pretrained(MODEL, {
      dtype: 'q8',                                    // ~86 MB; fp32 is ~4x that
      device: navigator.gpu ? 'webgpu' : 'wasm',
    });
    return true;
  } catch {
    return false;                                     // caller falls back to Web Speech
  }
}

export async function synthesise(text: string, voice = 'af_heart'): Promise<Blob | null> {
  if (!tts) return null;
  const audio = await tts.generate(text, { voice });
  return audio.toBlob();
}
```

The engine interface keeps `speak()`, `cancelSpeech()`, `primeVoice()` and
`isVoiceMuted()` exactly as they are, so `hooks/useVoiceGuidance.ts` and every
call site stay untouched.

### Guardrails

- The model comes from the Hugging Face CDN at a **pinned repo id**. Pin the
  revision too once a known-good commit is chosen.
- Nothing about the driver's route, location or destination leaves the device:
  synthesis is local, and the only network call is the one-time model fetch.
- Cap the phrase bank. A per-route street-name cache needs a size limit, or a
  long trip fills the browser's storage quota.
- Never let a slow first synthesis hold up a prompt: if the clip isn't ready
  when the turn arrives, speak it through Web Speech and keep going.
- Offer the download rather than starting it. 86 MB on a metered connection is
  the driver's call, and the app must work fully without it.

### What the shipped code does differently

The plan had `speak()` choosing an engine. It doesn't: it plays a neural clip
only when one is **already rendered**, and otherwise falls straight through to
the system voice while rendering that line in the background. Guidance repeats
itself constantly, so a line is neural the next time it comes up, and no prompt
ever waits on synthesis. That turned out to be the only shape that is safe in a
car, and it made the phrase bank a warm-up rather than a lookup.

### Testing

`tests/voice-guidance.test.ts` and `tests/voice-kokoro.test.ts` — 33 cases
covering the handover (neural when rendered, system otherwise, never awaited,
silent when muted), the load paths (failure degrades instead of throwing, one
fetch however many callers, off-and-on mid-download), and the clip cache
(rendered once, oldest-out past the limit, dropped on a voice change).

Still to do by ear: the same route on Chrome desktop, Android Chrome and iOS
Safari. This sandbox can't reach huggingface.co, so the model has never
actually been fetched — the loading and failure states are verified, the
**ready** state is not.

---

## Worth doing alongside: the words

`osrm-text-instructions` carries the phrase tables that Mapbox and OSRM ship,
in 31 languages, keyed by maneuver type and modifier:

```json
"turn": {
  "left":  { "default": "Turn left",  "name": "Turn left onto {way_name}" },
  "right": { "default": "Turn right", "name": "Turn right onto {way_name}" }
},
"arrive": {
  "left": { "default": "You have arrived at your {nth} destination, on the left" }
}
```

BSD-2-Clause, so the tables can be vendored with their copyright notice. It
would replace the rule table in `lib/maneuver-display.ts` with phrasing that
has been through a decade of real driving, and it is the shortest path to
Spanish guidance — which for a Philadelphia app is the language that matters
after English.

---

## License notes

- **Apache-2.0** (kokoro-js, kokoro-web, StreamingKokoroJS, sherpa-onnx),
  **MIT** (HeadTTS, easy-speech, piper-plus), **BSD-2-Clause**
  (osrm-text-instructions): code can be reused, keep the copyright notice.
- **GPL-3.0** (Vela, edge-tts): idea only, no code.
- **No license** (tts.rocks): idea only.
- Kokoro's own weights are Apache-2.0, which is what makes shipping them in a
  product possible at all.

---

## Sources

- https://github.com/hexgrad/kokoro
- https://github.com/xenova/kokoro-web
- https://github.com/met4citizen/HeadTTS
- https://github.com/rhulha/StreamingKokoroJS
- https://github.com/leaonline/easy-speech
- https://github.com/Project-OSRM/osrm-text-instructions
- https://github.com/ayutaz/piper-plus
- https://github.com/k2-fsa/sherpa-onnx
- https://github.com/steveseguin/tts.rocks
- https://github.com/sauravpanda/BrowserAI
- https://github.com/PimpinPumpkin/Vela
- https://github.com/rany2/edge-tts
- https://github.com/mitre-atlas/atlas-data
