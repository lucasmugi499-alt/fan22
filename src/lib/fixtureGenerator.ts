import roundRobin from 'roundrobin';
import type { League, Match, Season, Team } from '@/types';

const DAY = 24 * 60 * 60 * 1000;

export function generateDoubleRoundRobinFixtures({
  league,
  season,
  teams,
  firstKickoff,
  daysBetweenRounds = 7,
  venueForTeam,
}: {
  league: League;
  season: Season;
  teams: Team[];
  firstKickoff: string;
  daysBetweenRounds?: number;
  venueForTeam?: (team: Team) => string;
}): Match[] {
  if (teams.length < 2) throw new Error('Add at least two teams before generating fixtures.');
  const firstLeg = roundRobin(teams.length, teams);
  const rounds = [
    ...firstLeg,
    ...firstLeg.map((round) => round.map(([away, home]) => [home, away] as [Team, Team])),
  ];
  const start = new Date(firstKickoff);
  if (Number.isNaN(start.getTime())) throw new Error('Choose a valid first kickoff.');

  return rounds.flatMap((round, roundIndex) =>
    round.map(([away, home], matchIndex) => ({
      id: `${season.id}_r${roundIndex + 1}_m${matchIndex + 1}`,
      sport: league.sport,
      leagueId: league.id,
      seasonId: season.id,
      homeTeamId: home.id,
      awayTeamId: away.id,
      venue: venueForTeam?.(home) ?? home.location ?? `${home.name} home venue`,
      city: home.city,
      scheduledAt: new Date(start.getTime() + roundIndex * daysBetweenRounds * DAY).toISOString(),
      status: 'scheduled',
      score: { home: null, away: null },
      verificationStatus: 'pending',
      supportersCount: 0,
      totalSupport: 0,
      events: [],
      createdAt: new Date().toISOString(),
    })),
  );
}
