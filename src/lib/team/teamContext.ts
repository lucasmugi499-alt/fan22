import type { Athlete, Match, Team, UserProfile } from '@/types';
import { isOfficialMatch, isUpcomingMatch } from '@/lib/status';
import { selectedAssignmentId } from '@/lib/auth/assignmentSelection';
import type { AccessContext } from '@/lib/auth/access';
import { scopedIdsForAccess } from '@/lib/auth/clientAccess';

/**
 * Resolves which team the current admin operates, by `adminUserIds`.
 *
 * The demo team-admin profile is not wired to a specific team, so in demo mode only it
 * falls back to the most active team to give the console something real to show. That
 * fallback must never run for a real account: a genuine admin whose assignment is missing
 * would silently open an unrelated club's console. Outside demo mode an unassigned user
 * gets `null`, and the caller renders an explicit empty state.
 *
 * This is presentation only either way; write authority is gated by the finalizer and rules.
 */
export function resolveMyTeam(
  profile: UserProfile | null,
  teams: Team[],
  matches: Match[],
  isDemoMode = false,
  accessContext?: AccessContext,
): Team | null {
  if (teams.length === 0) return null;
  const scopedTeamIds = scopedIdsForAccess(accessContext, 'team');
  if (profile) {
    const ownedTeams = teams.filter((t) =>
      scopedTeamIds.has(t.id) ||
      t.adminUserIds?.includes(profile.uid) ||
      t.adminUserIds?.includes(profile.id)
    );
    const selectedId = selectedAssignmentId('team');
    const owned = ownedTeams.find((team) => team.id === selectedId) ?? ownedTeams[0];
    if (owned) return owned;
  }
  if (!isDemoMode) return null;
  // Demo fallback: the team with the most fixtures makes the liveliest console.
  const countByTeam = new Map<string, number>();
  for (const m of matches) {
    countByTeam.set(m.homeTeamId, (countByTeam.get(m.homeTeamId) ?? 0) + 1);
    countByTeam.set(m.awayTeamId, (countByTeam.get(m.awayTeamId) ?? 0) + 1);
  }
  return [...teams].sort(
    (a, b) => (countByTeam.get(b.id) ?? 0) - (countByTeam.get(a.id) ?? 0)
  )[0];
}

export function matchesForTeam(teamId: string, matches: Match[]): Match[] {
  return matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
}

export function rosterForTeam(teamId: string, athletes: Athlete[]): Athlete[] {
  return athletes.filter((a) => a.teamId === teamId);
}

/**
 * The result trust-chain items that need the admin's attention, most urgent first:
 * a match being played, then a played-but-unverified result (a claim to submit or confirm),
 * then a disputed result. Official and upcoming matches are not "actions".
 */
export interface TeamAction {
  match: Match;
  kind: 'live' | 'unverified' | 'disputed';
}

export function pendingActions(teamId: string, matches: Match[]): TeamAction[] {
  const actions: TeamAction[] = [];
  for (const m of matchesForTeam(teamId, matches)) {
    if (m.status === 'live') actions.push({ match: m, kind: 'live' });
    else if (m.verificationStatus === 'disputed') actions.push({ match: m, kind: 'disputed' });
    else if (m.status === 'completed' && !isOfficialMatch(m)) actions.push({ match: m, kind: 'unverified' });
  }
  const order = { live: 0, disputed: 1, unverified: 2 } as const;
  return actions.sort((a, b) => order[a.kind] - order[b.kind]);
}

export function upcomingForTeam(teamId: string, matches: Match[]): Match[] {
  return matchesForTeam(teamId, matches)
    .filter(isUpcomingMatch)
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
}

export function teamRecord(team: Team): string {
  return team.record ?? `${team.wins}-${team.draws ?? 0}-${team.losses}`;
}

export type FormResult = 'W' | 'D' | 'L';

/**
 * Recent form from the team's perspective, most recent first. Only official results count,
 * so a pending scoreline can never show up as a win. Returns up to `limit` entries.
 */
export function recentForm(teamId: string, matches: Match[], limit = 5): FormResult[] {
  return matchesForTeam(teamId, matches)
    .filter((m) => isOfficialMatch(m) && m.score.home !== null && m.score.away !== null)
    .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))
    .slice(0, limit)
    .map((m) => {
      const isHome = m.homeTeamId === teamId;
      const own = (isHome ? m.score.home : m.score.away) ?? 0;
      const opp = (isHome ? m.score.away : m.score.home) ?? 0;
      if (own > opp) return 'W';
      if (own < opp) return 'L';
      return 'D';
    });
}
