import type { FantasyCorrection, FantasyRound } from '@/types/fantasy';

/**
 * What state a round is in, and whether the number on screen is final.
 *
 * Every other fantasy game can treat scoring as final because its results never move. This
 * one has versioned corrections, so a manager's score can change days after they stopped
 * looking. That is not a flaw to hide: handled openly it demonstrates the thing the platform
 * sells. What it does require is that a provisional number is never presented as a final one.
 */

export type FantasyRoundPhase =
  /** Picks allowed, deadline visible. */
  | 'open'
  /** First kickoff has passed; lineups are frozen server side. */
  | 'locked'
  /** Provisional points from the field event stream. Never final. */
  | 'live'
  /** Matches finishing, official results arriving one by one. */
  | 'settling'
  /** Every fixture is either official or voided. The leaderboard is the record of the round. */
  | 'settled'
  /** A correction version arrived after settlement, and the change is explained. */
  | 'adjusted';

export type FantasyFixtureState =
  | 'scheduled'
  | 'live'
  | 'awaiting_official'
  | 'official'
  | 'voided';

export type FantasyFixtureLifecycle = {
  matchId: string;
  state: FantasyFixtureState;
  label: string;
  /** Present only for a voided fixture, and shown verbatim. */
  voidReason?: string;
};

const FIXTURE_LABELS: Record<FantasyFixtureState, string> = {
  scheduled: 'Not started',
  live: 'Live',
  awaiting_official: 'Awaiting official',
  official: 'Official',
  voided: 'Voided for fantasy',
};

/**
 * One fixture's fantasy state, from the match record and any void published against it.
 *
 * A voided fixture outranks everything else it might otherwise be called: the manager needs
 * to know it will not be scored, not that its result is official. The official result and the
 * standings are unaffected either way, which the void reason says explicitly.
 */
export function fixtureLifecycle({
  matchId,
  status,
  verificationStatus,
  officialResultVersion,
  voidReason,
}: {
  matchId: string;
  status: string;
  verificationStatus?: string;
  officialResultVersion?: number;
  voidReason?: string;
}): FantasyFixtureLifecycle {
  if (voidReason) {
    return { matchId, state: 'voided', label: FIXTURE_LABELS.voided, voidReason };
  }
  if (status === 'completed' && verificationStatus === 'verified' && (officialResultVersion ?? 0) > 0) {
    return { matchId, state: 'official', label: FIXTURE_LABELS.official };
  }
  if (status === 'completed') {
    return { matchId, state: 'awaiting_official', label: FIXTURE_LABELS.awaiting_official };
  }
  if (status === 'live' || status === 'in_progress') {
    return { matchId, state: 'live', label: FIXTURE_LABELS.live };
  }
  return { matchId, state: 'scheduled', label: FIXTURE_LABELS.scheduled };
}

export type FantasyRoundLifecycle = {
  phase: FantasyRoundPhase;
  label: string;
  /** One sentence a manager can act on. */
  description: string;
  /**
   * True while any number shown for this round may still change on its own.
   *
   * The UI must label the total accordingly. Only a settled round produces a leaderboard
   * position anyone is asked to care about.
   */
  provisional: boolean;
  fixtures: FantasyFixtureLifecycle[];
  fixturesScored: number;
  fixtureCount: number;
};

const PHASE_LABELS: Record<FantasyRoundPhase, string> = {
  open: 'Open',
  locked: 'Locked',
  live: 'Live',
  settling: 'Settling',
  settled: 'Settled',
  adjusted: 'Adjusted',
};

/**
 * The round's phase, derived from its fixtures rather than from a single stored flag.
 *
 * A stored status can only say what the last writer thought; the fixtures say what is
 * actually true now. Deriving means a round cannot claim to be settled while one of its
 * matches is still waiting for an official result.
 */
export function roundLifecycle({
  round,
  fixtures,
  corrections = [],
  now,
}: {
  round: Pick<FantasyRound, 'deadlineAt' | 'matchIds'>;
  fixtures: readonly FantasyFixtureLifecycle[];
  corrections?: readonly Pick<FantasyCorrection, 'createdAt'>[];
  now: string;
}): FantasyRoundLifecycle {
  const fixtureCount = fixtures.length || round.matchIds.length;
  const resolved = fixtures.filter((fixture) => fixture.state === 'official' || fixture.state === 'voided');
  const fixturesScored = resolved.length;
  const deadlinePassed = Date.parse(now) >= Date.parse(round.deadlineAt);

  const base = {
    fixtures: [...fixtures],
    fixturesScored,
    fixtureCount,
  };

  if (!deadlinePassed) {
    return {
      ...base,
      phase: 'open',
      label: PHASE_LABELS.open,
      description: 'Picks are open until the first kickoff.',
      provisional: true,
    };
  }

  const allResolved = fixtureCount > 0 && fixturesScored === fixtureCount;
  if (allResolved) {
    // A correction only counts as an adjustment once the round had already settled.
    if (corrections.length) {
      return {
        ...base,
        phase: 'adjusted',
        label: PHASE_LABELS.adjusted,
        description: 'A correction changed this round after it settled. The change is explained below.',
        provisional: false,
      };
    }
    return {
      ...base,
      phase: 'settled',
      label: PHASE_LABELS.settled,
      description: 'Every fixture is official or voided. This leaderboard is the record of the round.',
      provisional: false,
    };
  }

  if (fixtures.some((fixture) => fixture.state === 'live')) {
    return {
      ...base,
      phase: 'live',
      label: PHASE_LABELS.live,
      description: 'Points are provisional and come from the live event stream. They are not final.',
      provisional: true,
    };
  }

  if (fixtures.some((fixture) => fixture.state === 'awaiting_official') || fixturesScored > 0) {
    return {
      ...base,
      phase: 'settling',
      label: PHASE_LABELS.settling,
      description: `${fixturesScored} of ${fixtureCount} fixtures are official. The rest are still settling.`,
      provisional: true,
    };
  }

  return {
    ...base,
    phase: 'locked',
    label: PHASE_LABELS.locked,
    description: 'Lineups are frozen. Scoring begins when the first result is finalized.',
    provisional: true,
  };
}

export type FantasyCorrectionNotice = {
  headline: string;
  detail: string;
  oldTotal: number;
  newTotal: number;
  delta: number;
  affectedManagerCount: number;
  reason: string;
  matchId: string;
};

/**
 * The notice a manager sees when a correction moved their score.
 *
 * Truth first: a platform whose whole proposition is verified sporting data cannot run a
 * leaderboard that knowingly reflects a superseded result, so a correction always changes the
 * score. What makes that tolerable is the explanation. Everything below already exists in the
 * correction record — old total, new total, reason, the list of affected teams — and has
 * simply never been surfaced. Rare and fully explained is a very different experience from
 * occasional and silent.
 *
 * Returns null when this manager's total did not move, so nobody is told about a change that
 * did not affect them.
 */
export function buildCorrectionNotice({
  correction,
  fantasyTeamId,
  matchLabel,
  rankBefore,
  rankAfter,
}: {
  correction: Pick<
    FantasyCorrection,
    'matchId' | 'oldTotals' | 'newTotals' | 'affectedFantasyTeamIds' | 'reason'
  >;
  fantasyTeamId: string;
  /** For example "Kampala United 2-1 City Stars". Falls back to the match id. */
  matchLabel?: string;
  rankBefore?: number;
  rankAfter?: number;
}): FantasyCorrectionNotice | null {
  const oldTotal = correction.oldTotals[fantasyTeamId];
  const newTotal = correction.newTotals[fantasyTeamId];
  if (typeof oldTotal !== 'number' || typeof newTotal !== 'number') return null;
  if (oldTotal === newTotal) return null;

  const others = correction.affectedFantasyTeamIds.length;
  const sentences = [
    `${matchLabel ?? correction.matchId} was corrected. ${correction.reason}`,
    others > 1
      ? `This affected ${others} managers.`
      : 'You were the only manager affected.',
  ];
  if (typeof rankBefore === 'number' && typeof rankAfter === 'number' && rankBefore !== rankAfter) {
    sentences.push(`Your overall rank moved from ${ordinal(rankBefore)} to ${ordinal(rankAfter)}.`);
  }

  return {
    headline: `Your round changed from ${oldTotal} to ${newTotal} points.`,
    detail: sentences.join(' '),
    oldTotal,
    newTotal,
    delta: newTotal - oldTotal,
    affectedManagerCount: others,
    reason: correction.reason,
    matchId: correction.matchId,
  };
}

function ordinal(value: number) {
  const remainderHundred = value % 100;
  if (remainderHundred >= 11 && remainderHundred <= 13) return `${value}th`;
  const remainderTen = value % 10;
  if (remainderTen === 1) return `${value}st`;
  if (remainderTen === 2) return `${value}nd`;
  if (remainderTen === 3) return `${value}rd`;
  return `${value}th`;
}
