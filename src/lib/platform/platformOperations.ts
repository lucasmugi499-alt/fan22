import type { Athlete, League, Match, Season, Team, TeamAssignment, VerificationStatus } from '@/types';
import { isOfficialMatch } from '@/lib/status';

export type PlatformTeamNode = {
  team: Team;
  athletesCount: number;
  matchesCount: number;
  officialResults: number;
  disputedResults: number;
  activeAdmins: number;
  pendingInvites: number;
};

export type PlatformLeagueNode = {
  league: League;
  seasonsCount: number;
  teams: PlatformTeamNode[];
  athletesCount: number;
  matchesCount: number;
  officialResults: number;
  disputedResults: number;
  pendingInvites: number;
};

export function buildPlatformOrganizationTree(input: {
  leagues: League[];
  seasons: Season[];
  teams: Team[];
  athletes: Athlete[];
  matches: Match[];
  teamAssignments: TeamAssignment[];
}): PlatformLeagueNode[] {
  return [...input.leagues]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((league) => {
      const leagueTeams = input.teams
        .filter((team) => team.leagueId === league.id)
        .sort((left, right) => left.name.localeCompare(right.name));
      const teamNodes = leagueTeams.map((team) => {
        const teamMatches = input.matches.filter(
          (match) => match.homeTeamId === team.id || match.awayTeamId === team.id,
        );
        const assignments = input.teamAssignments.filter((assignment) => assignment.teamId === team.id);
        return {
          team,
          athletesCount: input.athletes.filter((athlete) => athlete.teamId === team.id).length,
          matchesCount: teamMatches.length,
          officialResults: teamMatches.filter(isOfficialMatch).length,
          disputedResults: teamMatches.filter((match) => match.verificationStatus === 'disputed').length,
          activeAdmins: assignments.filter((assignment) => assignment.status === 'active').length,
          pendingInvites: assignments.filter((assignment) => assignment.status === 'invited').length,
        };
      });
      const leagueMatches = input.matches.filter((match) => match.leagueId === league.id);
      return {
        league,
        seasonsCount: input.seasons.filter((season) => season.leagueId === league.id).length,
        teams: teamNodes,
        athletesCount: teamNodes.reduce((count, team) => count + team.athletesCount, 0),
        matchesCount: leagueMatches.length,
        officialResults: leagueMatches.filter(isOfficialMatch).length,
        disputedResults: leagueMatches.filter((match) => match.verificationStatus === 'disputed').length,
        pendingInvites: teamNodes.reduce((count, team) => count + team.pendingInvites, 0),
      };
    });
}

export function teamOperationalState(team: Team): VerificationStatus {
  if (team.verificationStatus) return team.verificationStatus;
  return team.verified ? 'verified' : 'pending';
}
