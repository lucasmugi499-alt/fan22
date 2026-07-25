import type { League, Match, Team, UserProfile } from '@/types';
import { isOfficialMatch } from '@/lib/status';

/**
 * Resolves which league the current admin runs. Real accounts match by `adminUserIds`; the
 * demo league-admin profile is not wired to one, so it falls back to the league with the
 * most fixtures. UI/demo convenience only, never a grant of authority.
 */
export function resolveMyLeague(
  profile: UserProfile | null,
  leagues: League[],
  matches: Match[]
): League | null {
  if (leagues.length === 0) return null;
  if (profile) {
    const owned = leagues.find(
      (l) => l.adminUserIds?.includes(profile.uid) || l.adminUserIds?.includes(profile.id)
    );
    if (owned) return owned;
  }
  const count = new Map<string, number>();
  for (const m of matches) count.set(m.leagueId, (count.get(m.leagueId) ?? 0) + 1);
  return [...leagues].sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0))[0];
}

export function teamsInLeague(leagueId: string, teams: Team[]): Team[] {
  return teams.filter((t) => t.leagueId === leagueId);
}

export function matchesInLeague(leagueId: string, matches: Match[]): Match[] {
  return matches.filter((m) => m.leagueId === leagueId);
}

export type ExceptionKind = 'disputed' | 'awaiting' | 'live';

export interface LeagueException {
  match: Match;
  kind: ExceptionKind;
}

/**
 * The verification *exception* queue: results that need a league decision, not every normal
 * mutually-confirmed result. Disputes first, then results awaiting confirmation, then live.
 * A verified/official result is never an exception.
 */
export function exceptionQueue(leagueId: string, matches: Match[]): LeagueException[] {
  const out: LeagueException[] = [];
  for (const m of matchesInLeague(leagueId, matches)) {
    if (isOfficialMatch(m)) continue;
    if (m.verificationStatus === 'disputed') out.push({ match: m, kind: 'disputed' });
    else if (m.status === 'completed' && m.verificationStatus === 'pending') out.push({ match: m, kind: 'awaiting' });
    else if (m.status === 'live') out.push({ match: m, kind: 'live' });
  }
  const order = { disputed: 0, awaiting: 1, live: 2 } as const;
  return out.sort((a, b) => order[a.kind] - order[b.kind]);
}

export function verifiedRate(leagueId: string, matches: Match[]): number {
  const played = matchesInLeague(leagueId, matches).filter((m) => m.status === 'completed');
  if (played.length === 0) return 0;
  const official = played.filter(isOfficialMatch).length;
  return Math.round((official / played.length) * 100);
}
