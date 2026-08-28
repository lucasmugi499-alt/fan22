import { describe, expect, it } from 'vitest';
import {
  buildFantasyFixtureVoid,
  evaluateFixtureScoringGate,
  fantasyCapturePolicyEligibility,
} from './fairness';
import type {
  FantasyCompetition,
  FantasyOfficialAthletePerformance,
  FantasyScoringProfile,
} from '@/types/fantasy';

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
  dataLevel: 'standard',
  recordedStatKeys: ['active_squad', 'appearance', 'goal', 'win_participation', 'clean_sheet'],
  status: 'active',
  isFreeToPlay: true,
  creditsLabel: 'Fantasy Credits',
  createdAt: '2026-07-29T00:00:00.000Z',
};

const profile: FantasyScoringProfile = {
  id: 'profile_1',
  sport: 'football',
  variant: 'association_football',
  name: 'Football Lite',
  version: 1,
  status: 'approved',
  captainMultiplier: 2,
  createdAt: '2026-07-29T00:00:00.000Z',
  publishedAt: '2026-07-29T00:00:00.000Z',
  rules: [
    { id: 'active_squad', stat: 'active_squad', label: 'Active squad', points: 1, requiredDataLevel: 'basic', requiredStatKey: 'active_squad', enabled: true },
    { id: 'appearance', stat: 'appearance', label: 'Appearance', points: 2, requiredDataLevel: 'basic', requiredStatKey: 'appearance', enabled: true },
    { id: 'goal', stat: 'goal', label: 'Goal', points: 4, requiredDataLevel: 'basic', requiredStatKey: 'goal', enabled: true },
    { id: 'win_participation', stat: 'win_participation', label: 'Win', points: 1, requiredDataLevel: 'basic', requiredStatKey: 'win_participation', enabled: true },
    { id: 'clean_sheet', stat: 'clean_sheet', label: 'Clean sheet', points: 4, requiredDataLevel: 'standard', requiredStatKey: 'clean_sheet', enabled: true },
  ],
};

function performance(
  athleteId: string,
  dataCoverage: FantasyOfficialAthletePerformance['dataCoverage'],
): FantasyOfficialAthletePerformance {
  return {
    id: `perf_${athleteId}`,
    matchId: 'match_1',
    athleteId,
    realTeamId: 'team_1',
    sport: 'football',
    position: 'Defender',
    positionGroup: 'defender',
    officialResultVersion: 1,
    verificationStatus: 'verified',
    dataLevel: 'standard',
    dataCoverage,
    activeSquad: true,
    didPlay: true,
    minutesPlayed: 90,
    teamWon: true,
    playerOfMatch: false,
    stats: { active_squad: 1, appearance: 1, goal: 1, win_participation: 1, clean_sheet: 1 },
    sourceEventIds: {},
  };
}

describe('rule 1: fantasy binds to capture policy', () => {
  it('accepts a competition whose effective policy is FIELD_REQUIRED', () => {
    const result = fantasyCapturePolicyEligibility({
      leagueRequested: 'FIELD_REQUIRED',
      platformMinimum: 'POST_MATCH_ALLOWED',
    });
    expect(result).toEqual({ eligible: true, effectivePolicy: 'FIELD_REQUIRED', reason: null });
  });

  it('accepts a competition raised to FIELD_REQUIRED by the platform floor', () => {
    const result = fantasyCapturePolicyEligibility({
      leagueRequested: 'POST_MATCH_ALLOWED',
      platformMinimum: 'FIELD_REQUIRED',
    });
    expect(result.eligible).toBe(true);
    expect(result.effectivePolicy).toBe('FIELD_REQUIRED');
  });

  it('refuses anything that still permits a typed score, and names the reason', () => {
    for (const policy of ['POST_MATCH_ALLOWED', 'FIELD_PREFERRED']) {
      const result = fantasyCapturePolicyEligibility({
        leagueRequested: policy,
        platformMinimum: policy,
      });
      expect(result.eligible).toBe(false);
      expect(result.reason).toContain('FIELD_REQUIRED');
    }
  });

  it('refuses an unset policy rather than assuming the strict one', () => {
    expect(fantasyCapturePolicyEligibility({ leagueRequested: undefined, platformMinimum: null }).eligible)
      .toBe(false);
  });
});

describe('rule 2: fair or void', () => {
  it('scores a fixture where every enabled rule is evaluable for every athlete', () => {
    expect(evaluateFixtureScoringGate({
      competition,
      profile,
      performances: [performance('a_1', 'verified_stat_line'), performance('a_2', 'complete')],
    })).toEqual({ decision: 'score' });
  });

  it('voids the whole fixture when one athlete has thinner coverage than the rest', () => {
    const gate = evaluateFixtureScoringGate({
      competition,
      profile,
      performances: [performance('a_1', 'verified_stat_line'), performance('a_2', 'scorer_only')],
    });
    expect(gate.decision).toBe('void');
    if (gate.decision !== 'void') throw new Error('expected a void');
    expect(gate.affectedAthleteIds).toEqual(['a_2']);
    expect(gate.unevaluableRuleIds).toContain('appearance');
    expect(gate.unevaluableRuleIds).toContain('clean_sheet');
    expect(gate.reason).toContain('voided for');
    expect(gate.reason).toContain('No manager gained or lost points');
  });

  it('never scores partially: a scored fixture and a void fixture are the only outcomes', () => {
    const gate = evaluateFixtureScoringGate({
      competition,
      profile,
      performances: [performance('a_1', 'match_squad_basic')],
    });
    expect(gate.decision).toBe('void');
  });

  it('voids an abandoned match with a reason a manager can read', () => {
    const gate = evaluateFixtureScoringGate({
      competition,
      profile,
      performances: [performance('a_1', 'verified_stat_line')],
      conditions: { abandoned: true },
    });
    expect(gate.decision).toBe('void');
    if (gate.decision !== 'void') throw new Error('expected a void');
    expect(gate.reason).toContain('abandoned');
  });

  it('voids a fixture whose events never finished syncing, and counts them', () => {
    const gate = evaluateFixtureScoringGate({
      competition,
      profile,
      performances: [performance('a_1', 'verified_stat_line')],
      conditions: { unsyncedEventCount: 6 },
    });
    if (gate.decision !== 'void') throw new Error('expected a void');
    expect(gate.reason).toContain('6 events never arrived');
  });

  it('voids a fixture with an open operational exception', () => {
    const gate = evaluateFixtureScoringGate({
      competition,
      profile,
      performances: [performance('a_1', 'verified_stat_line')],
      conditions: { openExceptionCount: 1 },
    });
    expect(gate.decision).toBe('void');
  });

  it('voids rather than silently zeroing a fixture with no performances', () => {
    const gate = evaluateFixtureScoringGate({ competition, profile, performances: [] });
    if (gate.decision !== 'void') throw new Error('expected a void');
    expect(gate.reason).toContain('No official athlete performances');
  });
});

describe('published void record', () => {
  it('stores the explanation the manager was shown', () => {
    const gate = evaluateFixtureScoringGate({
      competition,
      profile,
      performances: [performance('a_1', 'scorer_only')],
    });
    if (gate.decision !== 'void') throw new Error('expected a void');
    const record = buildFantasyFixtureVoid({
      competitionId: 'competition_1',
      roundId: 'round_1',
      matchId: 'match_1',
      officialResultVersion: 2,
      gate,
      createdAt: '2026-08-03T18:00:00.000Z',
    });
    expect(record.id).toBe('competition_1:round_1:match_1:v2');
    expect(record.reason).toBe(gate.reason);
    expect(record.affectedAthleteCount).toBe(1);
  });
});
