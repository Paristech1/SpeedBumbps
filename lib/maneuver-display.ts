/**
 * Split a turn instruction into a short action word and the rest, so the
 * navigation HUD can set the action at display size ("RIGHT") with the street
 * on its own quieter line ("onto Spruce St").
 *
 * The input shapes are the ones lib/osrm-service.ts builds (see
 * `buildInstruction` there); anything else falls back to splitting on the
 * first preposition, and finally to showing the instruction as-is.
 */

export interface ManeuverHeadline {
  /** Short action, sentence case — render it uppercase at display size. */
  action: string;
  /** Remainder of the instruction, e.g. "onto Spruce St". May be empty. */
  detail: string;
}

type Rule = { pattern: RegExp; action: (m: RegExpMatchArray) => string };

/** Sentence case: "sharp left" → "Sharp left". */
function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

/** Ordered longest-match-first; the matched prefix becomes the action. */
const RULES: Rule[] = [
  { pattern: /^make a u-turn/i, action: () => 'U-turn' },
  { pattern: /^at end of road,?\s+turn\s+(left|right)/i, action: (m) => sentenceCase(m[1]) },
  { pattern: /^at end of road,?\s+continue/i, action: () => 'Continue' },
  {
    pattern: /^turn\s+(sharp left|sharp right|slight left|slight right|left|right)/i,
    action: (m) => sentenceCase(m[1]),
  },
  { pattern: /^continue straight/i, action: () => 'Straight' },
  { pattern: /^(sharp|slight)\s+(left|right)/i, action: (m) => `${sentenceCase(m[1])} ${m[2].toLowerCase()}` },
  { pattern: /^merge\s+(left|right)/i, action: (m) => `Merge ${m[1].toLowerCase()}` },
  { pattern: /^keep\s+(left|right|straight)/i, action: (m) => `Keep ${m[1].toLowerCase()}` },
  { pattern: /^take the ramp on the (left|right)/i, action: (m) => `Ramp ${m[1].toLowerCase()}` },
  { pattern: /^take the ramp/i, action: () => 'Ramp' },
  { pattern: /^take the roundabout/i, action: () => 'Roundabout' },
  { pattern: /^turn(?=\s|$)/i, action: () => 'Turn' },
  { pattern: /^merge(?=\s|$)/i, action: () => 'Merge' },
  { pattern: /^exit(?=\s|$)/i, action: () => 'Exit' },
  { pattern: /^enter(?=\s|$)/i, action: () => 'Enter' },
  { pattern: /^head(?=\s|$)/i, action: () => 'Head' },
  { pattern: /^depart(?=\s|$)/i, action: () => 'Depart' },
  { pattern: /^arrive(?=\s|$)/i, action: () => 'Arrive' },
  { pattern: /^continue(?=\s|$)/i, action: () => 'Continue' },
];

/** Leading punctuation the rules leave behind, e.g. "Continue, then…". */
function tidyDetail(rest: string): string {
  return rest.replace(/^[,\s]+/, '').trim();
}

export function maneuverHeadline(instruction: string): ManeuverHeadline {
  const text = instruction.trim();
  if (!text) return { action: '', detail: '' };

  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (match) {
      return { action: rule.action(match), detail: tidyDetail(text.slice(match[0].length)) };
    }
  }

  // Unknown phrasing: keep everything before the first preposition as the action.
  const split = text.match(/^(.{1,18}?)\s+(onto|on|at|to|toward|towards)\s+(.+)$/i);
  if (split) {
    return { action: sentenceCase(split[1]), detail: `${split[2].toLowerCase()} ${split[3]}` };
  }

  return { action: text, detail: '' };
}
