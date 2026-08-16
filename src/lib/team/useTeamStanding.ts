'use client';

import { useMemo } from 'react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings, type LeagueStanding } from '@/lib/leagueModel';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import type { Team } from '@/types';

/**
 * A team's row in the official standings, computed from official results only.
 *
 * Exists so no surface has to reach for `team.leaguePoints`. That field is a stored
 * aggregate that does not derive from any match: clubs displayed totals like 19 points and
 * records like 3-0-10 in a competition holding four fixtures, while the league table beside
 * them read zero. Anything showing a sporting number now reads the same projection the
 * table is built from, or shows nothing.
 *
 * Scoped to the team's league and its active season, so the number matches what the league
 * page publishes rather than a lifetime total across seasons.
 */
export function useTeamOfficialStanding(team?: Pick<Team, 'id' | 'leagueId'>) {
  const leagueId = team?.leagueId;
  const league = useGoalPlaceData({
    collections: ['teams', 'matches', 'seasons', 'leagues'],
    scope: { leagueId: leagueId ?? 'goalplace-pending' },
    recordLimit: 250,
  });

  const rows = useMemo(() => {
    if (!leagueId) return [] as LeagueStanding[];
    const leagueTeams = league.teams.filter((candidate) => candidate.leagueId === leagueId);
    if (!leagueTeams.length) return [] as LeagueStanding[];
    const record = league.leagues.find((candidate) => candidate.id === leagueId);
    const season = currentSeasonFor(league.seasons, leagueId, record?.currentSeasonId);
    return buildLeagueStandings(
      leagueTeams,
      league.matches.filter((match) => match.leagueId === leagueId),
      {
        seasonId: season?.id,
        scoring: season ? scoringForSeason(season, record?.sport ?? 'football') : undefined,
      },
    );
  }, [league.teams, league.matches, league.seasons, league.leagues, leagueId]);

  return {
    rows,
    standing: useMemo(() => rows.find((row) => row.teamId === team?.id), [rows, team?.id]),
    loading: Boolean(leagueId) && league.loading,
  };
}
