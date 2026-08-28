import { effectiveCapturePolicy, type CapturePolicy } from '@/lib/capturePolicy';
import { enabledFantasyRules } from './scoring';
import type {
  FantasyCompetition,
  FantasyOfficialAthletePerformance,
  FantasyScoringProfile,
} from '@/types/fantasy';

/**
 * The rule that keeps a fantasy competition fair.
 *
 * The scoring engine gates each rule by how much was actually recorded for that athlete in
 * that match, which is correct: inventing the missing data would be far worse. But running a
 * competitive game across matches whose data quality differs, and saying nothing, produces a
 * silent unfairness. Two athletes play identically; one scores half as much because of who
 * was holding the phone at their match. The manager who picked the second did nothing wrong,
 * cannot see why they lost, and cannot avoid it next week either.
 *
 * There are only three ways out. Scaling thin coverage up invents points nobody earned, on a
 * platform whose whole thesis is that data is not invented. Running at the floor — only rules
 * every match supports — degrades every competition to goals only, and there is no game left.
 * What remains is to guarantee uniform data by construction, and to refuse to score the
 * residue that slips through anyway.
 */

/**
 * Rule 1. Fantasy binds to capture policy.
 *
 * A competition can be fantasy enabled only when its effective capture policy is
 * FIELD_REQUIRED, so no match in it can arrive by post-match entry. Every performance is then
 * captured to the same standard and the coverage gap that produces the unfairness cannot
 * occur, because the condition that produces it cannot occur.
 */
export const FANTASY_REQUIRED_CAPTURE_POLICY: CapturePolicy = 'FIELD_REQUIRED';

export function fantasyCapturePolicyEligibility({
  leagueRequested,
  platformMinimum,
}: {
  leagueRequested: unknown;
  platformMinimum: unknown;
}): { eligible: boolean; effectivePolicy: CapturePolicy; reason: string | null } {
  const effectivePolicy = effectiveCapturePolicy(leagueRequested, platformMinimum);
  if (effectivePolicy === FANTASY_REQUIRED_CAPTURE_POLICY) {
    return { eligible: true, effectivePolicy, reason: null };
  }
  return {
    eligible: false,
    effectivePolicy,
    reason:
      `Fantasy requires an effective capture policy of ${FANTASY_REQUIRED_CAPTURE_POLICY}, `
      + `but this competition is ${effectivePolicy}. A competition that permits a typed score `
      + 'cannot score every athlete by the same rules.',
  };
}

/**
 * Conditions that can degrade a fixture that was field captured anyway.
 *
 * Rule 1 handles the ordinary case. It does not handle the residual one: an abandonment, an
 * emergency takeover mid-game, an unresolved exception, a device that stopped syncing.
 */
export type FixtureIntegrityConditions = {
  /** The match did not run to completion. */
  abandoned?: boolean;
  /** Operational exceptions still open against this fixture. */
  openExceptionCount?: number;
  /** Events are known to be missing, for example a device that never finished syncing. */
  unsyncedEventCount?: number;
};

export type FixtureScoringGate =
  | { decision: 'score' }
  | {
    decision: 'void';
    /** Operator- and manager-readable, published on the round page verbatim. */
    reason: string;
    /** Rules that could not be evaluated for at least one athlete. */
    unevaluableRuleIds: string[];
    /** Athletes whose coverage was short of the competition's own standard. */
    affectedAthleteIds: string[];
  };

/**
 * Rule 2. A degraded fixture is void for everyone.
 *
 * If any enabled rule cannot be evaluated for any athlete in the fixture, the fixture scores
 * zero for every manager and says so, with the reason. Never partial, never silent.
 *
 * Symmetry is the whole point. Nobody gains, nobody loses, and the manager who owned three
 * players in that match can see exactly why their round is short instead of quietly
 * concluding the game is rigged.
 *
 * Voiding is a fantasy decision, not a sporting one. The official result, its events and the
 * standings are untouched; fantasy is declining to score a match, not cancelling it.
 */
export function evaluateFixtureScoringGate({
  competition,
  profile,
  performances,
  conditions = {},
}: {
  competition: FantasyCompetition;
  profile: FantasyScoringProfile;
  performances: readonly FantasyOfficialAthletePerformance[];
  conditions?: FixtureIntegrityConditions;
}): FixtureScoringGate {
  if (conditions.abandoned) {
    return {
      decision: 'void',
      reason: 'The match was abandoned, so it could not be scored fairly for anyone.',
      unevaluableRuleIds: [],
      affectedAthleteIds: [],
    };
  }
  if ((conditions.unsyncedEventCount ?? 0) > 0) {
    const count = conditions.unsyncedEventCount ?? 0;
    return {
      decision: 'void',
      reason:
        `The field manager's device stopped syncing and ${count} `
        + `${count === 1 ? 'event' : 'events'} never arrived, so the round could not be scored `
        + 'fairly for anyone.',
      unevaluableRuleIds: [],
      affectedAthleteIds: [],
    };
  }
  if ((conditions.openExceptionCount ?? 0) > 0) {
    return {
      decision: 'void',
      reason:
        'An operational exception on this fixture is still open, so its record is not yet '
        + 'settled enough to score.',
      unevaluableRuleIds: [],
      affectedAthleteIds: [],
    };
  }

  /*
   * A fixture with no official performances has nothing to score and nothing to be unfair
   * about. Scoring it would award every manager zero silently, which is the same outcome as
   * voiding it but without the explanation.
   */
  if (!performances.length) {
    return {
      decision: 'void',
      reason: 'No official athlete performances were recorded for this fixture.',
      unevaluableRuleIds: [],
      affectedAthleteIds: [],
    };
  }

  const enabled = enabledFantasyRules(competition, profile);
  const unevaluableRuleIds = new Set<string>();
  const affectedAthleteIds = new Set<string>();

  for (const performance of performances) {
    for (const rule of enabled) {
      if (ruleEvaluableFor(performance, rule.requiredStatKey)) continue;
      unevaluableRuleIds.add(rule.id);
      affectedAthleteIds.add(performance.athleteId);
    }
  }

  if (!unevaluableRuleIds.size) return { decision: 'score' };

  const ruleList = [...unevaluableRuleIds].sort().join(', ');
  const athleteCount = affectedAthleteIds.size;
  return {
    decision: 'void',
    reason:
      `${ruleList} could not be evaluated for ${athleteCount} `
      + `${athleteCount === 1 ? 'athlete' : 'athletes'} in this fixture, so it was voided for `
      + 'fantasy rather than scored unevenly. No manager gained or lost points from it.',
    unevaluableRuleIds: [...unevaluableRuleIds].sort(),
    affectedAthleteIds: [...affectedAthleteIds].sort(),
  };
}

/**
 * Whether one rule can be evaluated against one athlete's official record.
 *
 * This mirrors the scoring engine's coverage filter deliberately. The engine drops rules it
 * cannot evaluate; the gate's job is to notice that it would have to, and refuse the whole
 * fixture rather than let a partial score go out.
 */
function ruleEvaluableFor(
  performance: FantasyOfficialAthletePerformance,
  requiredStatKey: string,
): boolean {
  if (performance.dataCoverage === 'scorer_only') {
    return ['goal', 'try', 'points_scored'].includes(requiredStatKey);
  }
  if (performance.dataCoverage === 'match_squad_basic') {
    return ['active_squad', 'appearance', 'goal', 'try', 'points_scored', 'win_participation']
      .includes(requiredStatKey);
  }
  return true;
}

/**
 * The record published when a fixture is voided.
 *
 * Stored rather than recomputed at read time so the explanation a manager saw on the round
 * page stays the explanation, even after the underlying records move on.
 */
export type FantasyFixtureVoid = {
  id: string;
  competitionId: string;
  roundId: string;
  matchId: string;
  officialResultVersion: number;
  reason: string;
  unevaluableRuleIds: string[];
  affectedAthleteCount: number;
  createdAt: string;
};

export function buildFantasyFixtureVoid({
  competitionId,
  roundId,
  matchId,
  officialResultVersion,
  gate,
  createdAt,
}: {
  competitionId: string;
  roundId: string;
  matchId: string;
  officialResultVersion: number;
  gate: Extract<FixtureScoringGate, { decision: 'void' }>;
  createdAt: string;
}): FantasyFixtureVoid {
  return {
    id: `${competitionId}:${roundId}:${matchId}:v${officialResultVersion}`,
    competitionId,
    roundId,
    matchId,
    officialResultVersion,
    reason: gate.reason,
    unevaluableRuleIds: gate.unevaluableRuleIds,
    affectedAthleteCount: gate.affectedAthleteIds.length,
    createdAt,
  };
}
