import roundRobin from 'roundrobin';
import type { League, Match, Season, Team } from '@/types';

const DAY = 24 * 60 * 60 * 1000;

export interface FixtureConflict {
  matchId: string;
  message: string;
}

export function validateFixtureDraft(fixtures: Match[], minimumRestHours = 48): FixtureConflict[] {
  const conflicts: FixtureConflict[] = [];
  const byTeam = new Map<string, Match[]>();
  const venueSlots = new Map<string, string>();
  for (const fixture of fixtures) {
    const slot = `${fixture.venue.trim().toLowerCase()}|${fixture.scheduledAt}`;
    const existingAtVenue = venueSlots.get(slot);
    if (existingAtVenue) {
      conflicts.push({
        matchId: fixture.id,
        message: `${fixture.venue} is already used at this kickoff by ${existingAtVenue}.`,
      });
    } else {
      venueSlots.set(slot, fixture.id);
    }
    for (const teamId of [fixture.homeTeamId, fixture.awayTeamId]) {
      byTeam.set(teamId, [...(byTeam.get(teamId) ?? []), fixture]);
    }
  }
  for (const [teamId, teamFixtures] of byTeam) {
    const ordered = [...teamFixtures].sort(
      (left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt),
    );
    for (let index = 1; index < ordered.length; index += 1) {
      const restHours = (Date.parse(ordered[index].scheduledAt) - Date.parse(ordered[index - 1].scheduledAt)) / 3_600_000;
      if (restHours < minimumRestHours) {
        conflicts.push({
          matchId: ordered[index].id,
          message: `${teamId} has only ${Math.round(restHours)} hours of rest.`,
        });
      }
    }
  }
  return conflicts;
}

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

/**
 * Turns a reviewed schedule preview into the fixtures the trusted command accepts.
 *
 * The preview owns pairing, dates and validation; this owns the `Match` shape — ids, city,
 * the empty score and the pending verification status — so there is one place that knows what
 * a fixture document looks like. Nothing is written here: the caller passes the result to
 * `createFixtures`, which is the only path to the sporting record.
 */
export function fixturesFromPreview({
  league,
  season,
  teams,
  preview,
  createdAt = new Date().toISOString(),
}: {
  league: Pick<League, 'id' | 'sport' | 'city'>;
  season: Pick<Season, 'id'>;
  teams: readonly Team[];
  preview: ReadonlyArray<{
    round: number;
    homeTeamId: string;
    awayTeamId: string;
    scheduledAt: string;
    venue: string;
  }>;
  createdAt?: string;
}): Match[] {
  const byId = new Map(teams.map((team) => [team.id, team]));
  // Counted per round so two fixtures in the same round cannot collide on an id.
  const seenInRound = new Map<number, number>();

  return preview.map((fixture) => {
    const index = (seenInRound.get(fixture.round) ?? 0) + 1;
    seenInRound.set(fixture.round, index);
    const home = byId.get(fixture.homeTeamId);
    return {
      id: `${season.id}_r${fixture.round}_m${index}`,
      sport: league.sport,
      leagueId: league.id,
      seasonId: season.id,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      venue: fixture.venue,
      city: home?.city ?? league.city,
      scheduledAt: fixture.scheduledAt,
      status: 'scheduled',
      score: { home: null, away: null },
      verificationStatus: 'pending',
      supportersCount: 0,
      totalSupport: 0,
      events: [],
      createdAt,
    } as Match;
  });
}
