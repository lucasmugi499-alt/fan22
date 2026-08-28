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

/**
 * Fantasy may only activate on an effective capture policy of FIELD_REQUIRED, so every test
 * that is asserting something else has to satisfy that rule first.
 */
const ELIGIBLE_POLICY = { leagueRequested: 'FIELD_REQUIRED', platformMinimum: 'POST_MATCH_ALLOWED' };

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
      capturePolicy: ELIGIBLE_POLICY,
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
      capturePolicy: ELIGIBLE_POLICY,
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
      capturePolicy: ELIGIBLE_POLICY,
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
      capturePolicy: ELIGIBLE_POLICY,
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
      capturePolicy: ELIGIBLE_POLICY,
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
      capturePolicy: ELIGIBLE_POLICY,
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
      capturePolicy: ELIGIBLE_POLICY,
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

describe('budget-free activation', () => {
  function check(overrides: { prices: FantasyPlayerPrice[]; budgetFree?: boolean }) {
    return validateFantasyActivation({
      competition: overrides.budgetFree
        ? { ...competition, budgetMode: 'budget_free' }
        : competition,
      scoringProfile,
      squadRules,
      players: players(),
      prices: overrides.prices,
      rounds,
      capturePolicy: ELIGIBLE_POLICY,
    });
  }

  it('does not require a price per athlete, which nothing in the platform computes', () => {
    const priced = check({ prices: [] });
    expect(priced.blockers.some((blocker) => blocker.includes('no publishable price'))).toBe(true);
    expect(priced.summary.budgetMode).toBe('credits');

    const budgetFree = check({ prices: [], budgetFree: true });
    expect(budgetFree.blockers.some((blocker) => blocker.includes('no publishable price'))).toBe(false);
    expect(budgetFree.summary.budgetMode).toBe('budget_free');
  });

  it('still validates any price records a budget-free competition happens to carry', () => {
    const budgetFree = check({ prices: prices(), budgetFree: true });
    expect(budgetFree.warnings.some((warning) => warning.includes('runs budget free'))).toBe(true);
    const invalid = check({
      prices: [{ ...prices()[0], credits: 0 }],
      budgetFree: true,
    });
    expect(invalid.blockers.some((blocker) => blocker.includes('positive credits'))).toBe(true);
  });
});

describe('rule 1: fantasy binds to capture policy', () => {
  function check(capturePolicy?: { leagueRequested: unknown; platformMinimum: unknown }) {
    return validateFantasyActivation({
      competition,
      scoringProfile,
      squadRules,
      players: players(),
      prices: prices(),
      rounds,
      capturePolicy,
    });
  }

  it('refuses a competition that still permits a typed score', () => {
    const readiness = check({ leagueRequested: 'FIELD_PREFERRED', platformMinimum: 'POST_MATCH_ALLOWED' });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((blocker) => blocker.includes('FIELD_REQUIRED'))).toBe(true);
    expect(readiness.summary.effectiveCapturePolicy).toBe('FIELD_PREFERRED');
  });

  it('accepts a competition the platform floor raised to FIELD_REQUIRED', () => {
    const readiness = check({ leagueRequested: 'POST_MATCH_ALLOWED', platformMinimum: 'FIELD_REQUIRED' });
    expect(readiness.blockers.some((blocker) => blocker.includes('FIELD_REQUIRED'))).toBe(false);
    expect(readiness.summary.effectiveCapturePolicy).toBe('FIELD_REQUIRED');
  });

  it('fails closed when no caller supplied a policy at all', () => {
    const readiness = check(undefined);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.some((blocker) => blocker.includes('FIELD_REQUIRED'))).toBe(true);
  });
});
