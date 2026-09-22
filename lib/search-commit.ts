/**
 * What Enter means in a search field.
 *
 * It means: search for what I typed. That sounds obvious, and it is the one
 * thing the old handler didn't do — it committed whichever suggestion sat at
 * the top of the list, because the "nothing highlighted" sentinel (-1) was
 * clamped to 0 before indexing. A driver typing "600 S 6th" and pressing Enter
 * partway through got the top match for "600 S", never having chosen it.
 *
 * The rule, in one line: take a suggestion only when the driver moved to it;
 * otherwise search the text.
 *
 * Kept out of the panel because the decision is the part worth being sure
 * about, and it was unreachable by a test while it lived inside a keydown.
 */

import type { GeocodingResult } from '@/types/speedbumps';

export interface SearchCommitState {
  /** Exactly what's in the box, untrimmed — the caller's raw query. */
  query: string;
  /** The suggestions currently on screen. */
  results: GeocodingResult[];
  /** The query those suggestions were fetched for; they linger while the next search loads. */
  resultsFor: string;
  /** Which suggestion the driver arrowed to. -1 means they haven't touched the list. */
  activeIndex: number;
}

export type SearchCommit =
  /** Nothing typed, nothing to do. */
  | { kind: 'none' }
  /** The driver highlighted this one — take it. */
  | { kind: 'choose'; result: GeocodingResult }
  /** Run a fresh search for this text. */
  | { kind: 'search'; query: string };

/** Decide what Enter should do, given what's on screen. */
export function resolveSearchCommit({
  query,
  results,
  resultsFor,
  activeIndex,
}: SearchCommitState): SearchCommit {
  const trimmed = query.trim();

  // A suggestion counts only if the driver actually moved to it, it exists,
  // and it belongs to the text that's in the box right now — suggestions stay
  // visible while the next search loads, so they routinely describe an older,
  // shorter query.
  const highlighted =
    activeIndex >= 0 && activeIndex < results.length && resultsFor === trimmed
      ? results[activeIndex]
      : null;

  if (highlighted) return { kind: 'choose', result: highlighted };
  if (!trimmed) return { kind: 'none' };
  return { kind: 'search', query: trimmed };
}

export type SearchOutcome =
  /** The search found nothing; say so rather than guessing. */
  | { kind: 'empty' }
  /** One match, no ambiguity — take it. */
  | { kind: 'choose'; result: GeocodingResult }
  /** Several matches — show them, first one highlighted, so a second Enter takes it. */
  | { kind: 'present'; results: GeocodingResult[]; activeIndex: number };

/**
 * What to do with what the search came back with.
 *
 * One result is unambiguous, so it's taken. Several are put on screen rather
 * than picked from on the driver's behalf — that silent pick is the behaviour
 * this whole module exists to undo.
 */
export function resolveSearchOutcome(results: GeocodingResult[]): SearchOutcome {
  if (results.length === 0) return { kind: 'empty' };
  if (results.length === 1) return { kind: 'choose', result: results[0] };
  return { kind: 'present', results, activeIndex: 0 };
}
