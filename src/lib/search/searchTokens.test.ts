import { describe, expect, it } from 'vitest';
import {
  buildSearchTokens,
  matchesAllWords,
  normalizeSearchText,
  searchLookupToken,
  searchQueryWords,
} from './searchTokens';

describe('normalizeSearchText', () => {
  it('folds case, accents and punctuation to one comparable form', () => {
    expect(normalizeSearchText("Priscilla N'Dour")).toBe('priscilla ndour');
    expect(normalizeSearchText('  KAMPALA   City  ')).toBe('kampala city');
  });
});

describe('buildSearchTokens', () => {
  it('indexes every word, not only the first', () => {
    const tokens = buildSearchTokens('Priscilla Nakato');

    // A leading-edge-only index would never find someone by surname.
    expect(tokens).toContain('pr');
    expect(tokens).toContain('nakato');
  });

  it('combines several fields into one token set', () => {
    const tokens = buildSearchTokens('Kisenyi United', 'Kampala', 'football');

    expect(tokens).toContain('kisenyi');
    expect(tokens).toContain('kampala');
    expect(tokens).toContain('football');
  });

  it('skips single characters, which match almost everything', () => {
    expect(buildSearchTokens('A B')).toEqual([]);
  });

  it('deduplicates and stays bounded for long text', () => {
    const tokens = buildSearchTokens('Kampala '.repeat(40));

    expect(new Set(tokens).size).toBe(tokens.length);
    expect(tokens.length).toBeLessThanOrEqual(120);
  });

  it('tolerates missing fields', () => {
    expect(buildSearchTokens(undefined, null, 'Jinja')).toContain('jinja');
  });
});

describe('searchLookupToken', () => {
  it('chooses the most selective word rather than the first', () => {
    // "fc" would return nearly every club; "kisenyi" narrows immediately.
    expect(searchLookupToken('fc kisenyi')).toBe('kisenyi');
  });

  it('returns null when nothing is long enough to search on', () => {
    expect(searchLookupToken('a')).toBeNull();
    expect(searchLookupToken('   ')).toBeNull();
  });

  it('caps the token so it can match an indexed prefix', () => {
    // Indexed prefixes stop at 12 characters, so a longer query word must be truncated
    // to the same length or it would match nothing at all.
    expect(searchLookupToken('extraordinarily')).toBe('extraordinar');
  });
});

describe('matchesAllWords', () => {
  it('requires every query word to prefix some indexed word', () => {
    expect(matchesAllWords('Priscilla Nakato', 'pris nak')).toBe(true);
    expect(matchesAllWords('Priscilla Nakato', 'pris zzz')).toBe(false);
  });

  it('matches words in any order', () => {
    expect(matchesAllWords('Kisenyi United', 'united kisenyi')).toBe(true);
  });

  it('ignores accents and punctuation on both sides', () => {
    expect(matchesAllWords("Priscilla N'Dour", 'ndour')).toBe(true);
  });
});

describe('searchQueryWords', () => {
  it('drops fragments too short to be meaningful', () => {
    expect(searchQueryWords('a kampala fc')).toEqual(['kampala', 'fc']);
  });
});
