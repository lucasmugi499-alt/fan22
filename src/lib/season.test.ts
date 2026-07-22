import { describe, expect, it } from 'vitest';
import { Match, MatchStatus, Season, Team, VerificationStatus } from '@/types';
import { buildLeagueStandings } from './leagueModel';
import { currentSeasonFor, defaultScoringFor, DEFAULT_SCORING, seasonsForLeague } from './season';

function team(id: string, name: string, sport: Team['sport'] = 'football'): Team {
  return {
    id,
    name,
    sport,
    leagueId: 'league_001',
    city: 'Kampala',
    country: 'Uganda',
    description: `${name} fixture`,
    plan: 'free',
    verified: true,
    adminUserIds: [],
    totalSupport: 0,
    supportersCount: 0,
    wins: 0,
    losses: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    leaguePoints: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function match(
  id: string,
  seasonId: string,
  homeScore: number,
  awayScore: number,
  sport: Match['sport'] = 'football',
  status: MatchStatus = 'completed',
  verificationStatus: VerificationStatus = 'verified'
): Match {
  return {
    id,
    sport,
    leagueId: 'league_001',
    seasonId,
    homeTeamId: 'team_a',
    awayTeamId: 'team_b',
    teamAId: 'team_a',
    teamBId: 'team_b',
    venue: 'Kampala',
    city: 'Kampala',
    scheduledAt: '2026-03-01T00:00:00.000Z',
    status,
    score: { home: homeScore, away: awayScore },
    teamAScore: homeScore,
    teamBScore: awayScore,
    verificationStatus,
    supportersCount: 0,
    totalSupport: 0,
    events: [],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function season(id: string, leagueId: string, status: Season['status'] = 'active'): Season {
  return {
    id,
    leagueId,
    name: `${id} fixture`,
    sport: 'football',
    status,
    startDate: '2026-01-15T00:00:00.000Z',
    competitionFormat: 'league',
    scoring: DEFAULT_SCORING.football,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

const TEAMS = [team('team_a', 'Kampala Stars FC'), team('team_b', 'Wakiso City FC')];

function row(teamId: string, matches: Match[], options = {}) {
  const found = buildLeagueStandings(TEAMS, matches, options).find((r) => r.teamId === teamId);
  if (!found) throw new Error(`no row for ${teamId}`);
  return found;
}

describe('per-sport scoring', () => {
  it("uses each sport's own convention, not football's", () => {
    expect(defaultScoringFor('football')).toEqual({ win: 3, draw: 1, loss: 0 });
    expect(defaultScoringFor('rugby')).toEqual({ win: 4, draw: 2, loss: 0 });
    expect(defaultScoringFor('basketball')).toEqual({ win: 2, draw: null, loss: 0 });
  });

  it('accepts the display casing of a sport name', () => {
    expect(defaultScoringFor('Rugby')).toEqual(defaultScoringFor('rugby'));
  });

  it('awards a rugby win 4 points, not 1', () => {
    // The previous hardcoded rule gave every non-football win a single point.
    expect(row('team_a', [match('m1', 's1', 20, 10, 'rugby')]).points).toBe(4);
  });

  it('awards a rugby draw 2 points a side, not zero', () => {
    const drawn = [match('m1', 's1', 15, 15, 'rugby')];
    expect(row('team_a', drawn).points).toBe(2);
    expect(row('team_b', drawn).points).toBe(2);
  });

  it('awards a football win 3 and a football draw 1', () => {
    expect(row('team_a', [match('m1', 's1', 2, 1, 'football')]).points).toBe(3);
    expect(row('team_a', [match('m1', 's1', 1, 1, 'football')]).points).toBe(1);
  });

  it('records a drawn basketball scoreline without inventing points for it', () => {
    const drawn = [match('m1', 's1', 88, 88, 'basketball')];
    // draw: null — the sport cannot draw, so the anomaly stays visible as a drawn fixture
    // rather than being scored.
    expect(row('team_a', drawn).draws).toBe(1);
    expect(row('team_a', drawn).points).toBe(0);
  });

  it('lets a season override the sport default', () => {
    const points = row('team_a', [match('m1', 's1', 2, 1)], {
      scoring: { win: 10, draw: 5, loss: 1 },
    }).points;
    expect(points).toBe(10);
  });
});

describe('season scoping', () => {
  const matches = [
    match('s1_m1', 'season_2025', 3, 0),
    match('s1_m2', 'season_2025', 2, 0),
    match('s2_m1', 'season_2026', 1, 0),
  ];

  it('counts only the requested season', () => {
    expect(row('team_a', matches, { seasonId: 'season_2026' }).played).toBe(1);
    expect(row('team_a', matches, { seasonId: 'season_2025' }).played).toBe(2);
  });

  it("keeps last season's points out of this season's table", () => {
    expect(row('team_a', matches, { seasonId: 'season_2026' }).points).toBe(3);
    expect(row('team_a', matches, { seasonId: 'season_2025' }).points).toBe(6);
  });

  it('counts everything supplied when no season is given', () => {
    expect(row('team_a', matches).played).toBe(3);
  });
});

describe('currentSeasonFor', () => {
  const seasons = [
    season('season_old', 'league_001', 'completed'),
    season('season_now', 'league_001', 'active'),
    season('season_other', 'league_002', 'active'),
  ];

  it('prefers the explicit pointer on the league', () => {
    expect(currentSeasonFor(seasons, 'league_001', 'season_old')?.id).toBe('season_old');
  });

  it('falls back to the active season for that league', () => {
    expect(currentSeasonFor(seasons, 'league_001')?.id).toBe('season_now');
  });

  it("never returns another league's season", () => {
    expect(currentSeasonFor(seasons, 'league_003')).toBeUndefined();
  });

  it("scopes a league's season list", () => {
    expect(seasonsForLeague(seasons, 'league_001').map((s) => s.id)).toEqual([
      'season_old',
      'season_now',
    ]);
  });
});
