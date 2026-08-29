import type { LeagueStanding } from '@/lib/leagueModel';
import { resolveLeagueStandings, type StandingsSource } from '@/lib/standings/resolve';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { isOfficialMatch } from '@/lib/status';
import type { League, Match, Season, StoredStanding, Team } from '@/types';

export type LeagueTableSnapshot = {
  leagueId: string;
  rows: LeagueStanding[];
  officialMatches: number;
  /**
   * Where the rows came from, so a surface can be honest about a fallback.
   *
   * Discovery previously built every league's table from ONE global match slice shared across
   * the whole page — 700 documents covering up to 48 leagues. A league's position in the feed
   * therefore depended on how many of ITS matches happened to fall inside a limit it shared
   * with 47 others, which is not a property of the league at all.
   */
  source: StandingsSource;
  provisional: boolean;
};

export function sportLabel(sport?: string) {
  const value = String(sport ?? 'football').toLowerCase();
  if (value === 'basketball') return 'Basketball';
  if (value === 'rugby') return 'Rugby';
  return 'Football';
}

export function regionLabel(city?: string) {
  const value = String(city ?? '').trim();
  if (!value) return 'Uganda';
  if (/kampala|wakiso|mukono|entebbe/i.test(value)) return 'Central';
  if (/jinja|mbale|soroti|tororo|iganga|eastern/i.test(value)) return 'Eastern';
  if (/gulu|lira|arua|northern/i.test(value)) return 'Northern';
  if (/mbarara|kabale|fort portal|western|hoima/i.test(value)) return 'Western';
  return value;
}

export function buildLeagueTableSnapshot(
  league: League,
  teams: Team[],
  matches: Match[],
  seasons: Season[],
  /**
   * Stored rows for every league on the page. Filtered to this one here rather than by each
   * caller, so no caller can forget and quietly fall back to the shared-slice computation.
   */
  storedStandings: StoredStanding[] = [],
): LeagueTableSnapshot {
  const leagueTeams = teams.filter((team) => team.leagueId === league.id);
  const leagueMatches = matches.filter((match) => match.leagueId === league.id);
  const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
  const resolved = resolveLeagueStandings({
    stored: storedStandings.filter((row) => row.leagueId === league.id),
    seasonId: season?.id,
    teams: leagueTeams,
    matches: leagueMatches,
    scoring: scoringForSeason(season, league.sport),
  });
  return {
    leagueId: league.id,
    rows: resolved.rows,
    officialMatches: resolved.source === 'projection'
      // From the table itself: each match appears in two rows.
      ? resolved.rows.reduce((total, row) => total + row.played, 0) / 2
      : leagueMatches.filter((match) => (
        (!season?.id || match.seasonId === season.id) && isOfficialMatch(match)
      )).length,
    source: resolved.source,
    provisional: resolved.provisional,
  };
}

export function tableForLeague(
  leagueId: string,
  snapshots: Map<string, LeagueTableSnapshot>,
) {
  return snapshots.get(leagueId)?.rows ?? [];
}

export function standingForTeam(teamId: string, snapshots: Map<string, LeagueTableSnapshot>) {
  for (const snapshot of snapshots.values()) {
    const index = snapshot.rows.findIndex((row) => row.teamId === teamId);
    if (index >= 0) return { row: snapshot.rows[index], rank: index + 1 };
  }
  return null;
}

export function groupBy<T>(items: T[], keyFor: (item: T) => string) {
  return items.reduce((groups, item) => {
    const key = keyFor(item);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
    return groups;
  }, new Map<string, T[]>());
}
