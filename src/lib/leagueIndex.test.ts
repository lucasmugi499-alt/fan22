import { describe, expect, it } from 'vitest';
import {
  MIN_MATCHES_FOR_INDEX,
  computeLeagueIndex,
  indexLabel,
  indexSortValue,
  publishedIndexScore,
} from './leagueIndex';
import type { Athlete, League, Match, Roster, Team } from '@/types';

/**
 * The GoalPlace Index used to be a constant.
 *
 * It is displayed on every league card, sorts the discovery feed, and the product's own copy
 * describes it as the thing that "helps leagues prove operational quality to sponsors,
 * athletes, and fans". Nothing computed it. It was seeded per league, and every league created
 * through the platform command got the literal value 45 — forever, regardless of matches
 * played, results verified or athletes registered.
 *
 * That is the line between acceptable demo seed data and fake application behaviour, and it
 * fell on the wrong side: the APPLICATION minted the number, for real leagues.
 */

const LEAGUE_ID = 'league_1';
const SEASON = 'season_2026';
const NOW = new Date('2026-08-29T00:00:00.000Z');

function league(): League {
  return { id: LEAGUE_ID, currentSeasonId: SEASON } as League;
}

function team(id: string): Team {
  return { id, leagueId: LEAGUE_ID, name: id, sport: 'football' } as Team;
}

function athlete(id: string, over: Partial<Athlete> = {}): Athlete {
  return {
    id,
    leagueId: LEAGUE_ID,
    teamId: 'team_a',
    registeredPosition: 'Striker',
    legalName: id,
    sport: 'football',
    ...over,
  } as Athlete;
}

function roster(id: string, status: Roster['status'], teamId = 'team_a'): Roster {
  return {
    id, leagueId: LEAGUE_ID, seasonId: SEASON, teamId, athleteIds: [], status, completeness: 100,
    createdAt: NOW.toISOString(),
  } as Roster;
}

function match(id: string, over: Partial<Match> = {}): Match {
  return {
    id,
    leagueId: LEAGUE_ID,
    seasonId: SEASON,
    sport: 'football',
    homeTeamId: 'team_a',
    awayTeamId: 'team_b',
    scheduledAt: '2026-05-01T00:00:00.000Z',
    status: 'completed',
    verificationStatus: 'verified',
    score: { home: 1, away: 0 },
    teamAScore: 1,
    teamBScore: 0,
    venue: 'Ground',
    city: 'Kampala',
    supportersCount: 0,
    totalSupport: 0,
    events: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  } as Match;
}

function computeWith(over: {
  matches?: Match[];
  teams?: Team[];
  athletes?: Athlete[];
  rosters?: Roster[];
} = {}) {
  return computeLeagueIndex({
    league: league(),
    seasonId: SEASON,
    matches: over.matches ?? [],
    teams: over.teams ?? [team('team_a'), team('team_b')],
    athletes: over.athletes ?? [],
    rosters: over.rosters ?? [],
    now: NOW,
  });
}

function signal(result: ReturnType<typeof computeLeagueIndex>, key: string) {
  const found = result.signals.find((item) => item.key === key);
  if (!found) throw new Error(`no signal ${key}`);
  return found;
}

describe('a league with too little history', () => {
  it('is not established below the minimum match count', () => {
    const result = computeWith({
      matches: Array.from({ length: MIN_MATCHES_FOR_INDEX - 1 }, (_, i) => match(`m${i}`)),
    });
    expect(result.established).toBe(false);
  });

  it('publishes no score at all, rather than 0 or 45', () => {
    // A two-fixture league trivially sits at 100, which would out-rank an established league
    // that played a season and dropped a few results. `null` is a real state.
    const result = computeWith({ matches: [match('m1'), match('m2')] });
    expect(result.score).toBeGreaterThan(0);
    expect(publishedIndexScore(result)).toBeNull();
  });

  it('becomes established at the threshold', () => {
    const result = computeWith({
      matches: Array.from({ length: MIN_MATCHES_FOR_INDEX }, (_, i) => match(`m${i}`)),
    });
    expect(result.established).toBe(true);
    expect(publishedIndexScore(result)).toBe(result.score);
  });
});

describe('what the index actually measures', () => {
  const played = Array.from({ length: 10 }, (_, i) => match(`m${i}`));

  it('scores verification from official results over played fixtures', () => {
    const matches = [
      ...played.slice(0, 8),
      match('m8', { verificationStatus: 'pending' }),
      match('m9', { verificationStatus: 'disputed' }),
    ];
    const result = computeWith({ matches });
    expect(signal(result, 'verification')).toMatchObject({
      value: 80, numerator: 8, denominator: 10,
    });
  });

  it('scores completion against fixtures whose date has passed, not the whole calendar', () => {
    // A fixture next month is not an outstanding result. Counting it would penalise a league
    // for publishing its calendar early, which is the opposite of what this rewards.
    const matches = [
      ...played,
      match('future_1', { status: 'scheduled', scheduledAt: '2027-01-01T00:00:00.000Z' }),
      match('future_2', { status: 'scheduled', scheduledAt: '2027-02-01T00:00:00.000Z' }),
    ];
    const result = computeWith({ matches });
    expect(signal(result, 'completion')).toMatchObject({
      value: 100, numerator: 10, denominator: 10,
    });
  });

  it('penalises a past fixture with no recorded result', () => {
    const matches = [
      ...played,
      match('overdue', { status: 'scheduled', scheduledAt: '2026-06-01T00:00:00.000Z' }),
    ];
    expect(signal(computeWith({ matches }), 'completion')).toMatchObject({
      numerator: 10, denominator: 11,
    });
  });

  it('scores athlete registration on eligibility fields, not persona fields', () => {
    // A bio and an avatar are the athlete's own and say nothing about how the league is run.
    const result = computeWith({
      matches: played,
      athletes: [
        athlete('a1'),
        athlete('a2', { bio: undefined, avatarUrl: undefined }),
        athlete('a3', { registeredPosition: '', position: undefined }),
        athlete('a4', { teamId: undefined }),
      ],
    });
    expect(signal(result, 'athleteRegistration')).toMatchObject({
      numerator: 2, denominator: 4, value: 50,
    });
  });

  it('scores roster confirmation on confirmed rosters per club', () => {
    const result = computeWith({
      matches: played,
      rosters: [roster('r1', 'confirmed', 'team_a'), roster('r2', 'submitted', 'team_b')],
    });
    expect(signal(result, 'rosterConfirmation')).toMatchObject({
      numerator: 1, denominator: 2, value: 50,
    });
  });

  it('ignores another league\'s records entirely', () => {
    // Each league's score must depend only on its own records — the failure that made the old
    // discovery tables depend on a limit shared across 47 other leagues.
    const result = computeWith({
      matches: [...played, match('other', { leagueId: 'league_OTHER', verificationStatus: 'pending' })],
      athletes: [athlete('a1'), athlete('mine_not', { leagueId: 'league_OTHER', teamId: undefined })],
    });
    expect(signal(result, 'verification').denominator).toBe(10);
    expect(signal(result, 'athleteRegistration').denominator).toBe(1);
  });

  it('ignores a previous season', () => {
    const result = computeWith({
      matches: [...played, match('old', { seasonId: 'season_2025', verificationStatus: 'pending' })],
    });
    expect(signal(result, 'verification').denominator).toBe(10);
  });
});

describe('the score itself', () => {
  it('is 100 for a league doing everything', () => {
    const result = computeWith({
      matches: Array.from({ length: 10 }, (_, i) => match(`m${i}`)),
      athletes: [athlete('a1'), athlete('a2')],
      rosters: [roster('r1', 'confirmed', 'team_a'), roster('r2', 'confirmed', 'team_b')],
    });
    expect(result.score).toBe(100);
  });

  it('is 0 for a league with nothing recorded', () => {
    expect(computeWith().score).toBe(0);
  });

  it('weights verification highest, because that is what the product sells', () => {
    const verifiedOnly = computeWith({
      matches: Array.from({ length: 10 }, (_, i) => match(`m${i}`)),
      athletes: [athlete('a1', { teamId: undefined })],
      rosters: [roster('r1', 'draft', 'team_a')],
    });
    const rostersOnly = computeWith({
      matches: Array.from({ length: 10 }, (_, i) => match(`m${i}`, { verificationStatus: 'pending' })),
      athletes: [athlete('a1', { teamId: undefined })],
      rosters: [roster('r1', 'confirmed', 'team_a'), roster('r2', 'confirmed', 'team_b')],
    });
    expect(verifiedOnly.score).toBeGreaterThan(rostersOnly.score);
  });

  it('never assigns 45 to anything', () => {
    // The literal this replaced. Not a meaningful assertion about arithmetic — a marker that
    // the constant is gone, and a failure here means somebody put it back.
    const results = [
      computeWith(),
      computeWith({ matches: Array.from({ length: 10 }, (_, i) => match(`m${i}`)) }),
    ];
    for (const result of results) {
      expect(publishedIndexScore(result)).not.toBe(45);
    }
  });

  it('produces no signal that was not measured', () => {
    // `adminReliability: 88` and `mediaUploads: 70` were hard-coded into the old breakdown.
    // A fabricated sub-score is the same defect at a smaller scale, and worse inside a
    // breakdown, where it reads as evidence for the total.
    const keys = computeWith().signals.map((item) => item.key);
    expect(keys).toEqual(['verification', 'completion', 'athleteRegistration', 'rosterConfirmation']);
    for (const item of computeWith().signals) {
      expect(item.denominator).toBeGreaterThanOrEqual(0);
      expect(item.value).toBeLessThanOrEqual(100);
    }
  });
});

describe('how an unrated league sorts and reads', () => {
  it('sorts below every rated league, including one scoring zero', () => {
    expect(indexSortValue(null)).toBeLessThan(indexSortValue(0));
  });

  it('says so rather than printing a number', () => {
    expect(indexLabel(null)).toBe('Not yet rated');
    expect(indexLabel(undefined)).toBe('Not yet rated');
    expect(indexLabel(72)).toBe('72');
  });
});
