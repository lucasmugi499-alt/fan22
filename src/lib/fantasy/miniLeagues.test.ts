import { describe, expect, it } from 'vitest';
import {
  clubMiniLeagueSeed,
  headToHeadResult,
  headToHeadSchedule,
  headToHeadStandings,
  isAllowedMiniLeaguePrize,
  isClubMiniLeague,
  miniLeagueJoinUrl,
  whatsappInviteLink,
} from './miniLeagues';

describe('club mini-leagues', () => {
  const seed = clubMiniLeagueSeed({
    competitionId: 'competition_1',
    teamId: 'team_1',
    teamName: 'Kampala United',
    inviteCode: 'KAMP01',
    createdAt: '2026-08-01T00:00:00.000Z',
  });

  it('is named for the club and joinable without approval', () => {
    expect(seed.name).toBe('Kampala United supporters');
    expect(seed.visibility).toBe('public');
    expect(seed.approvalRequired).toBe(false);
    expect(seed.status).toBe('active');
  });

  it('has a deterministic id, so seeding twice cannot duplicate it', () => {
    const again = clubMiniLeagueSeed({
      competitionId: 'competition_1',
      teamId: 'team_1',
      teamName: 'Kampala United',
      inviteCode: 'DIFFER',
      createdAt: '2026-09-01T00:00:00.000Z',
    });
    expect(again.id).toBe(seed.id);
  });

  it('belongs to the competition, so no member leaving can orphan it', () => {
    expect(seed.ownerUserId).toBe('');
    expect(isClubMiniLeague(seed)).toBe(true);
  });

  it('does not mistake a user-created league for a club one', () => {
    expect(isClubMiniLeague({ id: 'competition_1_abc123', competitionId: 'competition_1' })).toBe(false);
  });
});

describe('head-to-head schedule', () => {
  it('has nothing to schedule below two members', () => {
    expect(headToHeadSchedule([])).toEqual([]);
    expect(headToHeadSchedule(['a'])).toEqual([]);
  });

  it('pairs everyone with everyone exactly once', () => {
    const members = ['a', 'b', 'c', 'd'];
    const fixtures = headToHeadSchedule(members);
    const pairs = fixtures.map((fixture) =>
      [fixture.homeFantasyTeamId, fixture.awayFantasyTeamId].sort().join('-')).sort();
    expect(pairs).toEqual(['a-b', 'a-c', 'a-d', 'b-c', 'b-d', 'c-d']);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it('gives every member one fixture per round when the count is even', () => {
    const fixtures = headToHeadSchedule(['a', 'b', 'c', 'd']);
    const rounds = new Set(fixtures.map((fixture) => fixture.round));
    expect(rounds.size).toBe(3);
    for (const round of rounds) {
      const inRound = fixtures.filter((fixture) => fixture.round === round);
      expect(inRound).toHaveLength(2);
      const played = inRound.flatMap((fixture) => [fixture.homeFantasyTeamId, fixture.awayFantasyTeamId]);
      expect(new Set(played).size).toBe(4);
    }
  });

  it('gives an odd membership a bye rather than an unbalanced fixture', () => {
    const fixtures = headToHeadSchedule(['a', 'b', 'c']);
    const pairs = fixtures.map((fixture) =>
      [fixture.homeFantasyTeamId, fixture.awayFantasyTeamId].sort().join('-')).sort();
    expect(pairs).toEqual(['a-b', 'a-c', 'b-c']);
    // Three members, three rounds, one member resting each round.
    expect(new Set(fixtures.map((fixture) => fixture.round)).size).toBe(3);
    for (const fixture of fixtures) {
      expect(fixture.homeFantasyTeamId).not.toBe('__bye__');
      expect(fixture.awayFantasyTeamId).not.toBe('__bye__');
    }
  });

  it('ignores a duplicated member rather than scheduling them against themselves', () => {
    const fixtures = headToHeadSchedule(['a', 'a', 'b']);
    expect(fixtures).toHaveLength(1);
    expect(fixtures[0]).toMatchObject({ round: 1 });
  });

  it('alternates which member is listed first', () => {
    const fixtures = headToHeadSchedule(['a', 'b', 'c', 'd']);
    const firstRoundHome = fixtures.filter((f) => f.round === 1).map((f) => f.homeFantasyTeamId);
    const secondRoundHome = fixtures.filter((f) => f.round === 2).map((f) => f.homeFantasyTeamId);
    expect(firstRoundHome).not.toEqual(secondRoundHome);
  });
});

describe('head-to-head results and table', () => {
  it('reads a result from the round totals both managers already scored', () => {
    expect(headToHeadResult(61, 55)).toBe('win');
    expect(headToHeadResult(55, 61)).toBe('loss');
    expect(headToHeadResult(55, 55)).toBe('draw');
  });

  it('builds a table on three for a win and one for a draw', () => {
    const table = headToHeadStandings([
      { round: 1, homeFantasyTeamId: 'a', awayFantasyTeamId: 'b', homePoints: 60, awayPoints: 40 },
      { round: 1, homeFantasyTeamId: 'c', awayFantasyTeamId: 'd', homePoints: 50, awayPoints: 50 },
      { round: 2, homeFantasyTeamId: 'a', awayFantasyTeamId: 'c', homePoints: 30, awayPoints: 70 },
    ]);
    // c took a win and a draw for four points; a took a win and a loss for three.
    expect(table.map((row) => row.fantasyTeamId)).toEqual(['c', 'a', 'd', 'b']);
    expect(table[0]).toMatchObject({ fantasyTeamId: 'c', played: 2, won: 1, drawn: 1, headToHeadPoints: 4 });
    expect(table[1]).toMatchObject({ fantasyTeamId: 'a', played: 2, won: 1, lost: 1, headToHeadPoints: 3, fantasyPointsScored: 90 });
  });

  it('separates equal league points by fantasy points scored', () => {
    const table = headToHeadStandings([
      { round: 1, homeFantasyTeamId: 'a', awayFantasyTeamId: 'b', homePoints: 90, awayPoints: 10 },
      { round: 1, homeFantasyTeamId: 'c', awayFantasyTeamId: 'd', homePoints: 60, awayPoints: 10 },
    ]);
    expect(table.slice(0, 2).map((row) => row.fantasyTeamId)).toEqual(['a', 'c']);
  });
});

describe('invite links', () => {
  it('opens the join screen with the code already present', () => {
    expect(miniLeagueJoinUrl({ origin: 'https://goalplace256.com', inviteCode: 'KAMP01' }))
      .toBe('https://goalplace256.com/fantasy/mini-leagues?join=KAMP01');
  });

  it('tolerates a trailing slash on the origin', () => {
    expect(miniLeagueJoinUrl({ origin: 'https://goalplace256.com/', inviteCode: 'KAMP01' }))
      .toBe('https://goalplace256.com/fantasy/mini-leagues?join=KAMP01');
  });

  it('builds a WhatsApp share carrying the join link', () => {
    const link = whatsappInviteLink({
      origin: 'https://goalplace256.com',
      miniLeagueName: 'Kampala United supporters',
      inviteCode: 'KAMP01',
    });
    expect(link.startsWith('https://wa.me/?text=')).toBe(true);
    const message = decodeURIComponent(link.slice('https://wa.me/?text='.length));
    expect(message).toContain('Kampala United supporters');
    expect(message).toContain('https://goalplace256.com/fantasy/mini-leagues?join=KAMP01');
  });

  it('escapes a code that would otherwise break the URL', () => {
    expect(miniLeagueJoinUrl({ origin: 'https://x.test', inviteCode: 'a b&c' }))
      .toBe('https://x.test/fantasy/mini-leagues?join=a%20b%26c');
  });
});

describe('prizes', () => {
  it('allows only non-cash prizes', () => {
    expect(isAllowedMiniLeaguePrize('match_tickets')).toBe(true);
    expect(isAllowedMiniLeaguePrize('kit')).toBe(true);
    expect(isAllowedMiniLeaguePrize('cash')).toBe(false);
    expect(isAllowedMiniLeaguePrize('entry_fee_pool')).toBe(false);
    expect(isAllowedMiniLeaguePrize(500)).toBe(false);
  });
});
