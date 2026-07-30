import type { LeagueStanding } from '@/lib/leagueModel';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { isOfficialMatch } from '@/lib/status';
import type { League, Match, Season, Team } from '@/types';

export type LeagueTableSnapshot = {
  leagueId: string;
  rows: LeagueStanding[];
  officialMatches: number;
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
): LeagueTableSnapshot {
  const leagueTeams = teams.filter((team) => team.leagueId === league.id);
  const leagueMatches = matches.filter((match) => match.leagueId === league.id);
  const season = currentSeasonFor(seasons, league.id, league.currentSeasonId);
  const rows = buildLeagueStandings(leagueTeams, leagueMatches, {
    seasonId: season?.id,
    scoring: scoringForSeason(season, league.sport),
  });
  return {
    leagueId: league.id,
    rows,
    officialMatches: leagueMatches.filter((match) => (
      (!season?.id || match.seasonId === season.id) && isOfficialMatch(match)
    )).length,
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
