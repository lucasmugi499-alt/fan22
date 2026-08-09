import type { Match, SportSlug, SportType } from '@/types';
import { normalizeMatchStatus, normalizeMatchVerification } from '@/lib/status';

/**
 * The single adapter for a stored match record.
 *
 * Match documents exist in two shapes. The current one carries `score.{home,away}` and a
 * lifecycle `status` of `completed` with a separate `verificationStatus`. Older records
 * carry `teamAScore`/`teamBScore` and overload `status` with the verification outcome
 * (`status: 'verified'`), which is what `normalizeMatchStatus` exists to undo.
 *
 * Reading either shape has to produce the same canonical Match, because `isOfficialMatch`
 * — the definition every table, leaderboard and sponsor report gates on — only recognises
 * `status: 'completed'` plus `verificationStatus: 'verified'`, and `buildLeagueStandings`
 * additionally requires numeric `teamAScore`/`teamBScore`.
 *
 * This lives in its own module, free of React and of `server-only`, because it must run on
 * BOTH sides of the data boundary. It previously lived inside the `'use client'` data hook,
 * so the server-rendered public pages could not use it: they returned raw documents, and
 * every legacy-shaped match was silently invisible to standings. Ten leagues showed an
 * empty table while their teams displayed stored points. Do not re-inline this mapping at
 * a call site — a second copy is how the two paths drifted in the first place.
 */

export function toSportName(sport?: SportSlug | SportType): SportType {
  if (sport === 'basketball' || sport === 'Basketball') return 'Basketball';
  if (sport === 'rugby' || sport === 'Rugby') return 'Rugby';
  return 'Football';
}

export function adaptMatch(match: Match): Match {
  const sport = toSportName(match.sport);
  return {
    ...match,
    sport,
    teamAId: match.teamAId ?? match.homeTeamId,
    teamBId: match.teamBId ?? match.awayTeamId,
    teamAScore: match.teamAScore ?? match.score?.home ?? undefined,
    teamBScore: match.teamBScore ?? match.score?.away ?? undefined,
    date: match.date ?? match.scheduledAt,
    status: normalizeMatchStatus(match.status),
    // Passes the raw status too: a legacy record's verification outcome lives there, and
    // collapsing the lifecycle field must not discard a 'disputed' signal.
    verificationStatus: normalizeMatchVerification(match.verificationStatus, match.status),
  };
}
