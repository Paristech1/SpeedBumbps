/**
 * Street-name normalisation for the City address index. Maps what people
 * type onto OPA's spelling (opa_properties_public), which is already
 * canonical: UPPERCASE, predirs N/S/E/W, USPS-style types (ST, AVE, BLVD…),
 * numbered streets as ordinals (5TH, 21ST) and "Saint" written ST.
 *
 * Pure — shared by the query parser and the matcher. The build script reads
 * OPA's canonical fields directly, so it only needs keys.mjs.
 */

export const PREDIRS = new Set(['N', 'S', 'E', 'W']);

/** Every street_designation value in OPA, plus HWY for typed input. */
export const STREET_TYPES = new Set([
  'ST', 'AVE', 'RD', 'LN', 'DR', 'PL', 'BLVD', 'SQ', 'TER', 'WAY', 'CT', 'CIR', 'PIKE',
  'WALK', 'PKWY', 'PLZ', 'MEWS', 'ALY', 'MALL', 'HTS', 'PATH', 'ROW', 'HWY',
]);

/** Canonical token → other spellings people type. Canonical = OPA's spelling. */
const SPELLINGS: Record<string, string[]> = {
  N: ['NORTH'], S: ['SOUTH'], E: ['EAST'], W: ['WEST'],
  ST: ['STREET', 'STR', 'STRT', 'SAINT'],
  AVE: ['AV', 'AVENUE', 'AVN', 'AVEN'],
  RD: ['ROAD'],
  LN: ['LANE'],
  DR: ['DRIVE', 'DRV'],
  PL: ['PLACE'],
  BLVD: ['BOULEVARD', 'BLV', 'BOUL'],
  SQ: ['SQUARE', 'SQR'],
  TER: ['TERRACE', 'TERR'],
  WAY: ['WY'],
  CT: ['COURT', 'CRT'],
  CIR: ['CIRCLE', 'CIRC'],
  PIKE: ['PK'],
  WALK: ['WLK'],
  PKWY: ['PARKWAY', 'PKY', 'PKWAY'],
  PLZ: ['PLAZA'],
  ALY: ['ALLEY', 'ALLY'],
  HTS: ['HEIGHTS', 'HGTS'],
  HWY: ['HIGHWAY'],
  MOUNT: ['MT'],
  FORT: ['FT'],
};

const ORDINAL_WORDS: Record<string, number> = {
  FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5, SIXTH: 6, SEVENTH: 7, EIGHTH: 8, NINTH: 9,
  TENTH: 10, ELEVENTH: 11, TWELFTH: 12, THIRTEENTH: 13, FOURTEENTH: 14, FIFTEENTH: 15,
  SIXTEENTH: 16, SEVENTEENTH: 17, EIGHTEENTH: 18, NINETEENTH: 19,
  TWENTIETH: 20, THIRTIETH: 30, FORTIETH: 40, FIFTIETH: 50,
  SIXTIETH: 60, SEVENTIETH: 70, EIGHTIETH: 80, NINETIETH: 90,
};

/** "twenty first" → 21ST */
const TENS_WORDS: Record<string, number> = {
  TWENTY: 20, THIRTY: 30, FORTY: 40, FIFTY: 50, SIXTY: 60, SEVENTY: 70, EIGHTY: 80, NINETY: 90,
};

/**
 * Multi-word names people shorten differently from OPA. Matched at the start
 * of the street (after an optional predir) so "john f kennedy blvd" isn't
 * rewritten again. Longest patterns first.
 */
const NAME_ALIASES: [string[], string[]][] = [
  [['MARTIN', 'LUTHER', 'KING', 'JR'], ['M', 'L', 'KING']],
  [['MARTIN', 'LUTHER', 'KING'], ['M', 'L', 'KING']],
  [['KENNEDY', 'BLVD'], ['JOHN', 'F', 'KENNEDY', 'BLVD']],
  [['JOHN', 'KENNEDY'], ['JOHN', 'F', 'KENNEDY']],
  [['BENJAMIN', 'FRANKLIN'], ['BEN', 'FRANKLIN']],
  [['CHRISTOPHER', 'COLUMBUS'], ['CHRIS', 'COLUMBUS']],
  [['COLUMBUS', 'BLVD'], ['CHRIS', 'COLUMBUS', 'BLVD']],
  [['CECIL', 'MOORE'], ['CECIL', 'B', 'MOORE']],
  [['MLK'], ['M', 'L', 'KING']],
  [['JFK'], ['JOHN', 'F', 'KENNEDY']],
];

const TO_CANONICAL = new Map<string, string>();
for (const [canonical, spellings] of Object.entries(SPELLINGS)) {
  TO_CANONICAL.set(canonical, canonical);
  for (const spelling of spellings) TO_CANONICAL.set(spelling, canonical);
}

export function ordinal(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}TH`;
  return `${n}${({ 1: 'ST', 2: 'ND', 3: 'RD' } as Record<number, string>)[n % 10] ?? 'TH'}`;
}

/** Uppercase words with punctuation removed: "N. 5th St." → [N, 5TH, ST]. */
export function tokenize(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/['’.]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter(Boolean);
}

/** One word in OPA's spelling: NORTH → N, AVENUE → AVE, FIFTH / 5 → 5TH, MT → MOUNT. */
export function canonicalToken(token: string): string {
  const known = TO_CANONICAL.get(token);
  if (known) return known;
  if (/^\d{1,2}$/.test(token) && token !== '0') return ordinal(Number(token));
  const numbered = token.match(/^(\d{1,2})(?:ST|ND|RD|TH)$/);
  if (numbered) return ordinal(Number(numbered[1]));
  if (token in ORDINAL_WORDS) return ordinal(ORDINAL_WORDS[token]);
  return token;
}

/** A street token OPA spells in full ("SOUTH ST", "WEST END DR") still matches typed "S"/"W". */
export function tokenMatches(canonical: string, streetToken: string): boolean {
  return canonical === streetToken || TO_CANONICAL.get(streetToken) === canonical;
}

// Long spellings of types and numbered streets, for matching a half-typed word
// ("stre" → ST, "fif" → 5TH). Predirs are left out: "nor" shouldn't match every N street.
const EXPANDABLE_WORDS: [string, string][] = [
  ...[...TO_CANONICAL].filter(([word, canonical]) => word !== canonical && !PREDIRS.has(canonical)),
  ...Object.entries(ORDINAL_WORDS).map(([word, n]): [string, string] => [word, ordinal(n)]),
];

/** A half-typed last word: prefix of the street's word, or of a spelling of it. */
export function partialTokenMatches(typed: string, streetToken: string): boolean {
  if (streetToken.startsWith(typed) || tokenMatches(canonicalToken(typed), streetToken)) return true;
  return typed.length >= 3 && EXPANDABLE_WORDS.some(([word, canonical]) => canonical === streetToken && word.startsWith(typed));
}

/** A street type word ("st", "avenue") that follows at least one name word. */
export function endsWithStreetType(rawTokens: string[]): boolean {
  if (rawTokens.length < 2) return false;
  const last = TO_CANONICAL.get(rawTokens[rawTokens.length - 1]);
  const hasName = rawTokens.slice(0, -1).some((t) => !PREDIRS.has(canonicalToken(t)));
  return !!last && STREET_TYPES.has(last) && hasName;
}

function mergeCompoundOrdinals(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tens = TENS_WORDS[tokens[i]];
    const ones = ORDINAL_WORDS[tokens[i + 1]];
    if (tens && ones && ones < 10) {
      out.push(ordinal(tens + ones));
      i++;
    } else {
      out.push(tokens[i]);
    }
  }
  return out;
}

function applyAliases(tokens: string[]): string[] {
  const start = tokens.length > 1 && PREDIRS.has(tokens[0]) ? 1 : 0;
  for (const [from, to] of NAME_ALIASES) {
    if (from.every((token, i) => tokens[start + i] === token)) {
      return [...tokens.slice(0, start), ...to, ...tokens.slice(start + from.length)];
    }
  }
  return tokens;
}

/**
 * Street text → canonical tokens: "north fifth street" → [N, 5TH, ST].
 * With `lastPartial`, the last word is kept as typed ("fr" stays FR) so it
 * can prefix-match.
 */
export function normalizeStreetTokens(text: string, lastPartial = false): string[] {
  const raw = mergeCompoundOrdinals(tokenize(text));
  const last = raw.length - 1;
  return applyAliases(raw.map((token, i) => (lastPartial && i === last ? token : canonicalToken(token))));
}
