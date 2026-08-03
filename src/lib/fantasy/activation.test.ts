import { describe, expect, it } from 'vitest';
import type {
  FantasyCompetition,
  FantasyPlayer,
  FantasyPlayerPrice,
  FantasyRound,
  FantasyScoringProfile,
  FantasySquadRules,
} from '@/types/fantasy';
import { measureObservedCoverage, validateFantasyActivation } from './activation';

const competition: FantasyCompetition = {
  id: 'competition_1',
  name: 'Kampala Football Fantasy',
  shortName: 'KFF',
  sport: 'football',
  variant: 'association_football',
  leagueId: 'league_1',
  seasonId: 'season_1',
  scoringProfileId: 'profile_1',
  scoringProfileVersion: 1,
  squadRulesId: 'rules_1',
  dataLevel: 'basic',
  recordedStatKeys: ['active_squad', 'appearance', 'goal', 'win_participation', 'yellow_card', 'red_card'],
  status: 'approved',
  isFreeToPlay: true,
  creditsLabel: 'Fantasy Credits',
  createdAt: '2026-07-29T00:00:00.000Z',
};

const scoringProfile: FantasyScoringProfile = {
  id: 'profile_1',
  sport: 'football',
  variant: 'association_football',
  name: 'Football Lite',
  version: 1,
  status: 'approved',
  captainMultiplier: 1.5,
  createdAt: '2026-07-29T00:00:00.000Z',
  publishedAt: '2026-07-29T00:00:00.000Z',
  rules: [
    rule('active_squad', 'active_squad', 'basic'),
    rule('appearance', 'appearance', 'basic'),
    rule('goal', 'goal', 'basic'),
    rule('assist', 'assist', 'standard'),
    rule('win_participation', 'win_participation', 'basic'),
    rule('yellow_card', 'yellow_card', 'basic'),
    rule('red_card', 'red_card', 'basic'),
  ],
};

const squadRules: FantasySquadRules = {
  id: 'rules_1',
  sport: 'football',
  variant: 'association_football',
  version: 1,
  squadSize: 4,
  startingSize: 4,
  benchSize: 0,
  budgetCredits: 100,
  maxFromRealTeam: 3,
  captainRequired: true,
  viceCaptainRequired: true,
  transferAllowancePerRound: 2,
  deadlineStrategy: 'first_round_kickoff',
  positionGroups: [
    { id: 'goalkeeper', label: 'Goalkeepers', positions: ['Goalkeeper'], minimum: 1, maximum: 1 },
    { id: 'defender', label: 'Defenders', positions: ['Defender'], minimum: 1, maximum: 1 },
    { id: 'midfielder', label: 'Midfielders', positions: ['Midfielder'], minimum: 1, maximum: 1 },
    { id: 'forward', label: 'Forwards', positions: ['Forward'], minimum: 1, maximum: 1 },
  ],
  createdAt: '2026-07-29T00:00:00.000Z',
};

function rule(
  id: FantasyScoringProfile['rules'][number]['stat'],
  requiredStatKey: string,
  requiredDataLevel: FantasyScoringProfile['rules'][number]['requiredDataLevel'],
): FantasyScoringProfile['rules'][number] {
  return {
    id,
    stat: id,
    label: id,
    points: 1,
    requiredDataLevel,
    requiredStatKey,
    enabled: true,
  };
}

function players(): FantasyPlayer[] {
  return ['goalkeeper', 'defender', 'midfielder', 'forward'].map((positionGroup, index) => ({
    id: `player_${index + 1}`,
    competitionId: 'competition_1',
    athleteId: `athlete_${index + 1}`,
    realTeamId: `team_${(index % 2) + 1}`,
    sport: 'football',
    position: positionGroup,
    positionGroup,
    availability: 'available',
    verifiedRecentForm: [],
    ownershipPercentage: 0,
    active: true,
  }));
}

function prices(): FantasyPlayerPrice[] {
  return players().map((player, index) => ({
    id: `price_${index + 1}`,
    competitionId: 'competition_1',
    athleteId: player.athleteId,
    credits: 5 + index,
    version: 1,
    status: 'draft',
  }));
}

const rounds: FantasyRound[] = [{
  id: 'round_1',
  competitionId: 'competition_1',
  number: 1,
  name: 'Round 1',
  matchIds: ['match_1'],
  startsAt: '2026-08-03T12:00:00.000Z',
  deadlineAt: '2026-08-03T12:00:00.000Z',
  endsAt: '2026-08-03T16:00:00.000Z',
  status: 'upcoming',
}];

describe('fantasy activation readiness', () => {
  it('approves a competition whose rules, roster, prices, and rounds are internally consistent', () => {
    const readiness = validateFantasyActivation({
      competition,
      scoringProfile,
      squadRules,
      players: players(),
      prices: prices(),
      rounds,
    });

    expect(readiness).toMatchObject({
      ready: true,
      blockers: [],
      summary: {
        playerCount: 4,
        pricedPlayerCount: 4,
        roundCount: 1,
      },
    });
    expect(readiness.summary.activatedRuleIds).toEqual([
      'active_squad',
      'appearance',
      'goal',
      'win_participation',
      'yellow_card',
      'red_card',
    ]);
  });

  it('blocks activation when recorded stats cannot support the active scoring rules', () => {
    const readiness = validateFantasyActivation({
      competition: {
        ...competition,
        recordedStatKeys: ['goal'],
      },
      scoringProfile,
      squadRules,
      players: players(),
      prices: prices(),
      rounds,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContain(
      'Recorded stat coverage is missing: active_squad, appearance, red_card, win_participation, yellow_card.',
    );
  });

  it('blocks activation when the player pool cannot satisfy position requirements', () => {
    const readiness = validateFantasyActivation({
      competition,
      scoringProfile,
      squadRules,
      players: players().filter((player) => player.positionGroup !== 'goalkeeper'),
      prices: prices(),
      rounds,
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContain('Player pool has 3 athletes, but squads require 4.');
    expect(readiness.blockers).toContain('Position group Goalkeepers has 0 eligible athletes, but squads require 1.');
  });

  it('blocks activation when rounds are only shells without matches', () => {
    const readiness = validateFantasyActivation({
      competition,
      scoringProfile,
      squadRules,
      players: players(),
      prices: prices(),
      rounds: [{ ...rounds[0], matchIds: [] }],
    });

    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContain('Round round_1 has no matches.');
  });

  it('warns rather than approving silently when no official results have been observed', () => {
    const readiness = validateFantasyActivation({
      competition,
      scoringProfile,
      squadRules,
      players: players(),
      prices: prices(),
      rounds,
    });

    expect(readiness.warnings).toContain(
      'No official results have been observed yet, so recorded stat coverage is unverified.',
    );
  });

  it('blocks appearance scoring when recent results never record who actually played', () => {
    const readiness = validateFantasyActivation({
      competition,
      scoringProfile,
      squadRules,
      players: players(),
      prices: prices(),
      rounds,
      observedCoverage: measureObservedCoverage([
        // Squads were recorded, but nobody was ever marked as having played.
        { matchId: 'm1', didPlay: false, stats: { active_squad: 1, goal: 1 } },
        { matchId: 'm1', didPlay: false, stats: { active_squad: 1 } },
        { matchId: 'm2', didPlay: false, stats: { active_squad: 1, goal: 2 } },
      ]),
    });

    // A league can declare it collects appearances; this checks whether it actually has.
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers).toContain(
      'Appearance-based rules are activated, but no recent official result records who actually played.',
    );
  });

  it('blocks rules whose stats appear in no recent official result', () => {
    const readiness = validateFantasyActivation({
      competition,
      scoringProfile,
      squadRules,
      players: players(),
      prices: prices(),
      rounds,
      observedCoverage: measureObservedCoverage([
        { matchId: 'm1', didPlay: true, stats: { active_squad: 1, appearance: 1, goal: 1, win_participation: 1 } },
      ]),
    });

    // Cards are activated but never observed.
    expect(readiness.blockers.some((blocker) => blocker.includes('red_card'))).toBe(true);
  });

  it('accepts a competition whose recent results carry every activated stat', () => {
    const readiness = validateFantasyActivation({
      competition,
      scoringProfile,
      squadRules,
      players: players(),
      prices: prices(),
      rounds,
      observedCoverage: measureObservedCoverage([
        { matchId: 'm1', didPlay: true, stats: { active_squad: 1, appearance: 1, goal: 1, win_participation: 1, yellow_card: 1, red_card: 1 } },
        { matchId: 'm2', didPlay: true, stats: { active_squad: 1, appearance: 1, goal: 2, win_participation: 1, yellow_card: 1, red_card: 1 } },
      ]),
    });

    expect(readiness.ready).toBe(true);
    expect(readiness.summary.observedCoverage?.participationCoveragePercent).toBe(100);
  });
});

describe('measureObservedCoverage', () => {
  it('ignores a stat that is always zero', () => {
    const coverage = measureObservedCoverage([
      { matchId: 'm1', didPlay: true, stats: { goal: 0, appearance: 1 } },
    ]);

    // A key present but never non-zero is not evidence the league records it.
    expect(coverage.statKeyCoveragePercent.goal).toBeUndefined();
    expect(coverage.statKeyCoveragePercent.appearance).toBe(100);
  });

  it('reports participation as the share of performances with playing evidence', () => {
    const coverage = measureObservedCoverage([
      { matchId: 'm1', didPlay: true, stats: {} },
      { matchId: 'm1', didPlay: false, stats: {} },
      { matchId: 'm2', didPlay: false, stats: {} },
      { matchId: 'm2', didPlay: false, stats: {} },
    ]);

    expect(coverage.matchesSampled).toBe(2);
    expect(coverage.performancesSampled).toBe(4);
    expect(coverage.participationCoveragePercent).toBe(25);
  });
});
