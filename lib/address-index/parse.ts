/**
 * Classify a search query for the City address index: a house-number
 * address ("4521 n fr"), an intersection ("broad and girard"), or anything
 * else (left to Photon). Pure.
 */

import { cleanQuery, leadingHouseNumber } from '@/lib/search-results';
import { endsWithStreetType, normalizeStreetTokens, tokenize } from './normalize';

export type ParsedQuery =
  | {
      kind: 'address';
      house: number;
      /** OPA house suffix: a letter ("1234R") or "2" for a half address ("256 1/2"). */
      houseSuffix: string;
      streetTokens: string[];
      /** The last street word may still be growing ("4521 n fr"). */
      lastTokenPartial: boolean;
      zip?: string;
    }
  | {
      kind: 'intersection';
      a: string[];
      b: string[];
      lastTokenPartial: boolean;
      /** Each side as typed ("16th", "bigler"), for upstream queries and filtering. */
      text: [string, string];
    }
  | { kind: 'other' };

const OTHER: ParsedQuery = { kind: 'other' };

/** Words that just mean "in Philadelphia" after the street. */
const PHILLY_WORDS = new Set(['PHILADELPHIA', 'PHILA', 'PHILLY', 'PA', 'PENNSYLVANIA', 'USA', 'US', 'UNITED', 'STATES']);
const ZIP_PATTERN = /\b(\d{5})(?:-\d{4})?\b/g;
const TRAILING_LOCALITY = /(?:\s+(?:philadelphia|phila|philly|pa|pennsylvania|usa|\d{5}(?:-\d{4})?))+$/i;

// "1234", "1234r", "1234-36" (OPA range), "256 1/2"
const HOUSE_PATTERN = /^(\d+)([a-z])?(?:-\d+[a-z]?)?(\s+1\/2)?(?=\s|$)/i;
// "x and y", "x at y", "x & y", "x @ y", "x/y"
const INTERSECTION_PATTERN = /^(.+?)(?:\s+(?:and|at)\s+|\s*[&@/]\s*)(.+)$/i;

/**
 * Text after the first comma. Returns the typed zip, or null when it names
 * somewhere other than Philadelphia ("Haddonfield NJ") — the index can't help.
 */
function parseLocality(text: string): { zip?: string } | null {
  const zip = [...text.matchAll(ZIP_PATTERN)][0]?.[1];
  const words = tokenize(text.replace(ZIP_PATTERN, ' '));
  const last = words.length - 1;
  const rest = words.filter((word, i) => {
    if (PHILLY_WORDS.has(word)) return false;
    // Still typing it: "…, phil", "…, pa 191"
    return !(i === last && (/^\d{1,5}$/.test(word) || [...PHILLY_WORDS].some((w) => w.startsWith(word))));
  });
  return rest.length > 0 ? null : { zip };
}

export function parseQuery(query: string): ParsedQuery {
  const cleaned = cleanQuery(query);
  if (!cleaned) return OTHER;

  const [head, ...rest] = cleaned.split(',');
  const locality = parseLocality(rest.join(' '));
  if (!locality) return OTHER;

  // "4521 n franklin st philadelphia pa 19140" without commas
  const trailing = head.match(TRAILING_LOCALITY);
  const street = trailing ? head.slice(0, trailing.index) : head;
  const zip = locality.zip ?? (trailing ? [...trailing[0].matchAll(ZIP_PATTERN)][0]?.[1] : undefined);
  // Anything after the street (comma, city, trailing space) means the last word is finished
  const endsOpen = rest.length === 0 && !trailing && !/[\s,]$/.test(query);

  if (leadingHouseNumber(street) !== null) {
    const house = street.match(HOUSE_PATTERN);
    if (!house) return OTHER;
    const streetText = street.slice(house[0].length);
    const rawTokens = tokenize(streetText);
    if (rawTokens.length === 0) return OTHER;
    const lastTokenPartial = endsOpen && !endsWithStreetType(rawTokens);
    return {
      kind: 'address',
      house: Number(house[1]),
      houseSuffix: house[3] ? '2' : (house[2] ?? '').toUpperCase(),
      streetTokens: normalizeStreetTokens(streetText, lastTokenPartial),
      lastTokenPartial,
      ...(zip ? { zip } : {}),
    };
  }

  const intersection = street.match(INTERSECTION_PATTERN);
  if (intersection) {
    const bRaw = tokenize(intersection[2]);
    const lastTokenPartial = endsOpen && !endsWithStreetType(bRaw);
    const a = normalizeStreetTokens(intersection[1]);
    const b = normalizeStreetTokens(intersection[2], lastTokenPartial);
    if (a.length === 0 || b.length === 0) return OTHER;
    return { kind: 'intersection', a, b, lastTokenPartial, text: [intersection[1].trim(), intersection[2].trim()] };
  }

  return OTHER;
}
