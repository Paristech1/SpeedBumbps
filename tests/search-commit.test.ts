/**
 * What Enter does in a search field.
 *
 * The reported bug, in the driver's words: "when I hit enter for the location
 * I'm typing it defaults to selecting from the suggested, or nothing at all,
 * or the last entered, instead of triggering a search for the typed in
 * location." Each of those is a case below.
 */

import { describe, it, expect } from 'vitest';
import { resolveSearchCommit, resolveSearchOutcome } from '@/lib/search-commit';
import type { GeocodingResult } from '@/types/speedbumps';

const result = (shortName: string): GeocodingResult => ({
  shortName,
  displayName: `${shortName}, Philadelphia, PA`,
  location: { lat: 39.95, lng: -75.16 },
});

const SUGGESTIONS = [result('600 S 6th St'), result('600 S 60th St'), result('600 S 56th St')];

describe('resolveSearchCommit', () => {
  it('searches the typed text when the driver has not touched the suggestions', () => {
    // The bug: activeIndex -1 was clamped to 0, committing a suggestion
    // nobody chose.
    const commit = resolveSearchCommit({
      query: '600 s 6th',
      results: SUGGESTIONS,
      resultsFor: '600 s 6th',
      activeIndex: -1,
    });

    expect(commit).toEqual({ kind: 'search', query: '600 s 6th' });
  });

  it('takes the suggestion the driver actually arrowed to', () => {
    const commit = resolveSearchCommit({
      query: '600 s 6th',
      results: SUGGESTIONS,
      resultsFor: '600 s 6th',
      activeIndex: 1,
    });

    expect(commit).toEqual({ kind: 'choose', result: SUGGESTIONS[1] });
  });

  it('ignores a highlight left over from an earlier query', () => {
    // Suggestions stay on screen while the next search loads, so a highlight
    // can describe text the driver has since changed — "the last entered".
    const commit = resolveSearchCommit({
      query: '600 s 6th street',
      results: SUGGESTIONS,
      resultsFor: '600 s 6th',
      activeIndex: 0,
    });

    expect(commit).toEqual({ kind: 'search', query: '600 s 6th street' });
  });

  it('ignores a highlight pointing past the end of a shrunken list', () => {
    const commit = resolveSearchCommit({
      query: '600 s 6th',
      results: [SUGGESTIONS[0]],
      resultsFor: '600 s 6th',
      activeIndex: 2,
    });

    expect(commit).toEqual({ kind: 'search', query: '600 s 6th' });
  });

  it('searches the typed text when suggestions have not arrived yet', () => {
    const commit = resolveSearchCommit({
      query: 'reading terminal market',
      results: [],
      resultsFor: '',
      activeIndex: -1,
    });

    expect(commit).toEqual({ kind: 'search', query: 'reading terminal market' });
  });

  it('trims what it hands to the search', () => {
    const commit = resolveSearchCommit({
      query: '  rittenhouse square  ',
      results: [],
      resultsFor: '',
      activeIndex: -1,
    });

    expect(commit).toEqual({ kind: 'search', query: 'rittenhouse square' });
  });

  it('matches a highlight against the trimmed query', () => {
    const commit = resolveSearchCommit({
      query: '  600 s 6th  ',
      results: SUGGESTIONS,
      resultsFor: '600 s 6th',
      activeIndex: 2,
    });

    expect(commit).toEqual({ kind: 'choose', result: SUGGESTIONS[2] });
  });

  it('does nothing on an empty box', () => {
    expect(
      resolveSearchCommit({ query: '   ', results: [], resultsFor: '', activeIndex: -1 }),
    ).toEqual({ kind: 'none' });
  });

  it('still takes a highlight when the box is empty of new text', () => {
    // Arrowing into the list is a choice even if the query is whitespace-only;
    // it can't be, in practice, but the highlight must win over 'none'.
    expect(
      resolveSearchCommit({ query: '', results: SUGGESTIONS, resultsFor: '', activeIndex: 0 }),
    ).toEqual({ kind: 'choose', result: SUGGESTIONS[0] });
  });
});

describe('resolveSearchOutcome', () => {
  it('takes a single match — there is nothing to choose between', () => {
    expect(resolveSearchOutcome([SUGGESTIONS[0]])).toEqual({
      kind: 'choose',
      result: SUGGESTIONS[0],
    });
  });

  it('shows several matches rather than picking one for the driver', () => {
    expect(resolveSearchOutcome(SUGGESTIONS)).toEqual({
      kind: 'present',
      results: SUGGESTIONS,
      activeIndex: 0,
    });
  });

  it('highlights the first, so a second Enter commits it', () => {
    const outcome = resolveSearchOutcome(SUGGESTIONS);
    expect(outcome.kind).toBe('present');
    if (outcome.kind !== 'present') return;

    const next = resolveSearchCommit({
      query: '600 s 6th',
      results: outcome.results,
      resultsFor: '600 s 6th',
      activeIndex: outcome.activeIndex,
    });

    expect(next).toEqual({ kind: 'choose', result: SUGGESTIONS[0] });
  });

  it('reports an empty search rather than guessing', () => {
    expect(resolveSearchOutcome([])).toEqual({ kind: 'empty' });
  });
});
