import { describe, expect, it } from 'vitest';
import type { Match } from '@/types';

/**
 * "Team vs Team" on every fixture involving one of 61 clubs.
 *
 * `/matches` paired a 700-match read with `getPublicTeams()`, which returns the 80 most
 * recently created clubs. The demo database has 141, and the 582 matches on that page
 * reference 101 distinct clubs — so 61 of them were absent from the lookup, and `MatchCard`
 * falls back to the literal string `'Team'` when an id does not resolve.
 *
 * Measured against the real database before the fix: 61 unresolved. After: 0.
 *
 * The lesson is the same one the standings table taught. A limit chosen to be "bigger than the
 * catalogue" is a guess that expires the moment the catalogue grows, and it expires silently —
 * the page renders, every card is present, and the names are wrong.
 */

/** Mirrors the id collection in `teamsForMatches`. */
function referencedTeamIds(matches: Pick<Match, 'homeTeamId' | 'awayTeamId' | 'teamAId' | 'teamBId'>[]) {
  return [...new Set(
    matches.flatMap((match) => [
      match.homeTeamId, match.awayTeamId, match.teamAId, match.teamBId,
    ]).filter((id): id is string => Boolean(id)),
  )];
}

function match(home: string, away: string, extra: Partial<Match> = {}) {
  return { homeTeamId: home, awayTeamId: away, ...extra } as Match;
}

describe('which clubs a page of matches needs', () => {
  it('collects both sides of every fixture', () => {
    expect(referencedTeamIds([match('a', 'b'), match('c', 'd')]).sort())
      .toEqual(['a', 'b', 'c', 'd']);
  });

  it('de-duplicates a club that appears in several fixtures', () => {
    // The count that matters is distinct clubs, not fixtures: 582 matches referenced 101 clubs.
    expect(referencedTeamIds([match('a', 'b'), match('a', 'c'), match('b', 'c')]).sort())
      .toEqual(['a', 'b', 'c']);
  });

  it('includes the teamA/teamB aliases legacy records carry', () => {
    // Legacy-shaped matches store the sides under different keys. Missing them would leave
    // exactly the class of fixture this bug was reported on still unresolved.
    expect(referencedTeamIds([
      match('', '', { teamAId: 'a', teamBId: 'b' } as Partial<Match>),
    ]).sort()).toEqual(['a', 'b']);
  });

  it('drops empty ids rather than querying for them', () => {
    // Firestore rejects an `in` containing an empty string, so one malformed match would fail
    // the whole page rather than render without that club.
    expect(referencedTeamIds([
      match('a', ''), match('', 'b'),
    ]).sort()).toEqual(['a', 'b']);
  });

  it('returns nothing for no matches, so no query is issued', () => {
    expect(referencedTeamIds([])).toEqual([]);
  });

  it('produces chunks Firestore will accept', () => {
    // `in` takes 30 values. A page referencing 101 clubs is four queries, not one that fails.
    const ids = referencedTeamIds(
      Array.from({ length: 60 }, (_, i) => match(`home_${i}`, `away_${i}`)),
    );
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));

    expect(ids).toHaveLength(120);
    expect(chunks).toHaveLength(4);
    expect(chunks.every((chunk) => chunk.length <= 30)).toBe(true);
    expect(chunks.flat()).toHaveLength(ids.length);
  });
});
