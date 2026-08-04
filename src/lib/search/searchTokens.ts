/**
 * Token generation for the public search index.
 *
 * Global search loaded the first 60 records from each of five collections and filtered
 * them in the browser. Those 60 were not the most relevant or even the most recent —
 * `.limit()` without `orderBy` returns documents in key order — so with a thousand
 * athletes roughly nineteen in twenty were unfindable. To a fan that reads as "this
 * platform does not have my player", which is the opposite of what a discovery surface
 * is for.
 *
 * Firestore has no substring operator, so searchable text is expanded into prefix tokens
 * at write time and matched with `array-contains` at read time. That turns search into
 * an indexed lookup over the whole collection rather than a scan of an arbitrary slice.
 */

/** Below this, a prefix matches so much that it is noise rather than a search. */
export const MIN_TOKEN_LENGTH = 2;

/** Above this, prefixes stop adding recall and only cost storage. */
export const MAX_TOKEN_LENGTH = 12;

/** Firestore rejects very large arrays; names never legitimately reach this. */
const MAX_TOKENS_PER_DOCUMENT = 120;

/**
 * Lowercases, strips accents and collapses punctuation, so "Priscilla N'Dour" and
 * "priscilla ndour" produce the same tokens.
 */
export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    // Combining diacritical marks: "Ngũgĩ" and "Ngugi" must reach the same tokens.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Apostrophes are removed rather than replaced with a space, so "N'Dour" stays one
    // searchable word instead of splitting into "n" and "dour".
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every prefix of every word, so a search matches on any word rather than only the
 * first. "nakato" finds "Priscilla Nakato", which a leading-edge-only index would miss.
 */
export function buildSearchTokens(...values: Array<string | null | undefined>): string[] {
  const tokens = new Set<string>();

  for (const value of values) {
    if (!value) continue;
    for (const word of normalizeSearchText(value).split(' ')) {
      if (word.length < MIN_TOKEN_LENGTH) continue;
      const ceiling = Math.min(word.length, MAX_TOKEN_LENGTH);
      for (let length = MIN_TOKEN_LENGTH; length <= ceiling; length += 1) {
        tokens.add(word.slice(0, length));
      }
    }
  }

  return [...tokens].sort().slice(0, MAX_TOKENS_PER_DOCUMENT);
}

/**
 * The token a query should be looked up by: the longest word, because it is the most
 * selective. Remaining words are applied as a filter over the returned candidates.
 */
export function searchLookupToken(query: string): string | null {
  const words = normalizeSearchText(query)
    .split(' ')
    .filter((word) => word.length >= MIN_TOKEN_LENGTH);
  if (!words.length) return null;

  const longest = words.reduce((best, word) => (word.length > best.length ? word : best), words[0]);
  return longest.slice(0, MAX_TOKEN_LENGTH);
}

/** All query words, for narrowing candidates returned by the lookup token. */
export function searchQueryWords(query: string): string[] {
  return normalizeSearchText(query)
    .split(' ')
    .filter((word) => word.length >= MIN_TOKEN_LENGTH);
}

/** True when every query word prefixes some word in the indexed text. */
export function matchesAllWords(indexedText: string, query: string): boolean {
  const haystack = normalizeSearchText(indexedText).split(' ');
  return searchQueryWords(query).every((word) =>
    haystack.some((candidate) => candidate.startsWith(word)));
}
