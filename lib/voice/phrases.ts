/**
 * The lines guidance says over and over.
 *
 * Navigation prompts are a nearly closed set: the maneuvers come from a fixed
 * vocabulary, the distances are bucketed by speechDistance(), and the bump
 * alerts are three fixed sentences. Rendering these once, up front, is what
 * lets the neural voice run in a car at all — the driving path plays audio
 * instead of waiting on inference.
 *
 * Only street names are genuinely open-ended, and a route's own steps get
 * rendered when it's plotted (see kokoro.prerender).
 *
 * Kept deliberately short. Every line here is a model run at startup, so it
 * holds the lines that actually recur, not every line that could exist.
 */

/** Distance phrasings, matching the buckets speechDistance() produces. */
const DISTANCES = [
  'a quarter mile',
  'half a mile',
  'three quarters of a mile',
  'one mile',
];

/** The maneuvers OSRM/Valhalla hand back most of the time. */
const MANEUVERS = [
  'Turn left',
  'Turn right',
  'Turn slight left',
  'Turn slight right',
  'Turn sharp left',
  'Turn sharp right',
  'Make a U-turn',
  'Keep left',
  'Keep right',
  'Continue straight',
  'Merge',
  'Take the exit',
  'Enter the roundabout',
];

/** The fixed lines in useVoiceGuidance — bump alerts and arrival. */
const SPOKEN_LINES = [
  'Caution — rough speed bump just ahead. Ease off the gas.',
  'Heads up, speed bump ahead. Take it easy.',
  'Gentle speed bump coming up.',
  "You've arrived — smooth all the way. Nice driving!",
  'Your destination is just ahead.',
  "you'll arrive at your destination",
];

/**
 * Every line rendered when the model comes up. Maneuvers appear bare (the
 * "now" tier) and prefixed with each distance (the "early" tier), which is
 * exactly the shape useVoiceGuidance builds.
 */
export const FIXED_PROMPTS: readonly string[] = [
  ...MANEUVERS,
  ...DISTANCES.flatMap((d) => MANEUVERS.map((m) => `In ${d}, ${m}`)),
  ...SPOKEN_LINES,
];

/**
 * How many rendered clips to hold. The fixed set is most of it; the rest is
 * headroom for a route's own street names. Past this, oldest out first — a
 * long drive would otherwise hold every instruction it ever spoke.
 */
export const CLIP_CACHE_LIMIT = FIXED_PROMPTS.length + 120;

/** A line for the driver to hear when trying a voice out in the Profile panel. */
export const SAMPLE_LINE = 'In a quarter mile, turn right onto South Street. Speed bump ahead.';
