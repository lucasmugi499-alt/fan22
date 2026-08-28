import type { FantasyMiniLeague } from '@/types/fantasy';

/**
 * The social layer, which is the reason anyone plays a second week.
 *
 * A global leaderboard nobody near the top reads is not a stake. Competing with the people you
 * actually know is, and in a grassroots league those people are already grouped: they support
 * the same club, they work together, they live on the same street.
 */

/**
 * The mini-league every club gets, without anyone setting it up.
 *
 * Supporters of the same club competing with each other is the most natural rivalry available
 * and it needs no configuration, so requiring someone to create it by hand guarantees that
 * most clubs never have one. Deterministic id so creating it twice is a no-op rather than a
 * duplicate.
 */
export function clubMiniLeagueSeed({
  competitionId,
  teamId,
  teamName,
  inviteCode,
  createdAt,
}: {
  competitionId: string;
  teamId: string;
  teamName: string;
  inviteCode: string;
  createdAt: string;
}): FantasyMiniLeague {
  return {
    id: `${competitionId}_club_${teamId}`,
    competitionId,
    // Club leagues belong to the competition rather than to a person, so no member's
    // departure can orphan or delete one.
    ownerUserId: '',
    name: `${teamName} supporters`,
    description: `The mini-league for everyone backing ${teamName} this season.`,
    inviteCode,
    visibility: 'public',
    approvalRequired: false,
    memberLimit: 5000,
    status: 'active',
    createdAt,
  };
}

export function isClubMiniLeague(miniLeague: Pick<FantasyMiniLeague, 'id' | 'competitionId'>) {
  return miniLeague.id.startsWith(`${miniLeague.competitionId}_club_`);
}

export type HeadToHeadFixture = {
  round: number;
  homeFantasyTeamId: string;
  awayFantasyTeamId: string;
};

/**
 * A round robin over the members of a mini-league.
 *
 * Turns a leaderboard into a personal fixture every week, which is what keeps a mid-table
 * manager engaged in round nineteen: they are not chasing first place, they are trying to beat
 * one named person.
 *
 * Standard circle method: one member is held fixed and the rest rotate, so every member meets
 * every other exactly once across the schedule. An odd number of members produces a bye each
 * round rather than an unbalanced fixture, because a manager silently omitted from a round
 * reads as the game forgetting them.
 */
export function headToHeadSchedule(fantasyTeamIds: readonly string[]): HeadToHeadFixture[] {
  const members = [...new Set(fantasyTeamIds)];
  if (members.length < 2) return [];

  // A bye placeholder keeps the rotation even; pairings against it are dropped.
  const BYE = '__bye__';
  const entrants = members.length % 2 === 0 ? members : [...members, BYE];
  const roundsCount = entrants.length - 1;
  const half = entrants.length / 2;
  const fixtures: HeadToHeadFixture[] = [];

  let rotating = entrants.slice(1);
  const fixed = entrants[0];

  for (let round = 1; round <= roundsCount; round += 1) {
    const ordered = [fixed, ...rotating];
    for (let index = 0; index < half; index += 1) {
      const home = ordered[index];
      const away = ordered[ordered.length - 1 - index];
      if (home === BYE || away === BYE) continue;
      // Alternate home and away each round so no member is always listed first.
      fixtures.push(round % 2 === 0
        ? { round, homeFantasyTeamId: away, awayFantasyTeamId: home }
        : { round, homeFantasyTeamId: home, awayFantasyTeamId: away });
    }
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }

  return fixtures;
}

export type HeadToHeadResult = 'win' | 'draw' | 'loss';

/** Who won one head-to-head, from the round totals both managers already scored. */
export function headToHeadResult(homePoints: number, awayPoints: number): HeadToHeadResult {
  if (homePoints > awayPoints) return 'win';
  if (homePoints < awayPoints) return 'loss';
  return 'draw';
}

export type HeadToHeadStanding = {
  fantasyTeamId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  /** Three for a win, one for a draw. */
  leaguePoints: number;
};

/** The head-to-head table, ordered by league points then by fantasy points scored. */
export function headToHeadStandings(
  fixtures: readonly (HeadToHeadFixture & { homePoints: number; awayPoints: number })[],
): HeadToHeadStanding[] {
  const table = new Map<string, HeadToHeadStanding>();
  const entry = (fantasyTeamId: string) => {
    const existing = table.get(fantasyTeamId);
    if (existing) return existing;
    const created: HeadToHeadStanding = {
      fantasyTeamId, played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, leaguePoints: 0,
    };
    table.set(fantasyTeamId, created);
    return created;
  };

  for (const fixture of fixtures) {
    const home = entry(fixture.homeFantasyTeamId);
    const away = entry(fixture.awayFantasyTeamId);
    const result = headToHeadResult(fixture.homePoints, fixture.awayPoints);
    home.played += 1;
    away.played += 1;
    home.pointsFor += fixture.homePoints;
    away.pointsFor += fixture.awayPoints;
    if (result === 'win') { home.won += 1; home.leaguePoints += 3; away.lost += 1; }
    else if (result === 'loss') { away.won += 1; away.leaguePoints += 3; home.lost += 1; }
    else { home.drawn += 1; away.drawn += 1; home.leaguePoints += 1; away.leaguePoints += 1; }
  }

  return [...table.values()].sort((left, right) =>
    right.leaguePoints - left.leaguePoints
    || right.pointsFor - left.pointsFor
    || left.fantasyTeamId.localeCompare(right.fantasyTeamId));
}

/**
 * A share link that opens WhatsApp with the invite already written.
 *
 * The distribution channel that actually exists in this market. One link, it opens the join
 * screen, and nobody needs an account to look first.
 *
 * `origin` is passed in rather than read from `window` so the same function serves the server
 * render and the client, and so a test can assert the URL it produces.
 */
export function whatsappInviteLink({
  origin,
  miniLeagueName,
  inviteCode,
}: {
  origin: string;
  miniLeagueName: string;
  inviteCode: string;
}): string {
  const joinUrl = miniLeagueJoinUrl({ origin, inviteCode });
  const message = `Join "${miniLeagueName}" on GoalPlace Fantasy. It is free and takes about a minute: ${joinUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function miniLeagueJoinUrl({
  origin,
  inviteCode,
}: {
  origin: string;
  inviteCode: string;
}): string {
  return `${origin.replace(/\/$/, '')}/fantasy/mini-leagues?join=${encodeURIComponent(inviteCode)}`;
}

/**
 * Prizes a mini-league may advertise.
 *
 * Non-cash by construction. That is a constraint from the money engine — fantasy is not a
 * regulated financial product and must never become a route to a payment — and it happens to
 * produce the more interesting kind of prize anyway.
 */
export const ALLOWED_MINI_LEAGUE_PRIZES = [
  'match_tickets',
  'kit',
  'training_session',
  'league_page_recognition',
] as const;

export type MiniLeaguePrize = (typeof ALLOWED_MINI_LEAGUE_PRIZES)[number];

export function isAllowedMiniLeaguePrize(value: unknown): value is MiniLeaguePrize {
  return typeof value === 'string' && (ALLOWED_MINI_LEAGUE_PRIZES as readonly string[]).includes(value);
}
