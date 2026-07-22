import {
  FinalizationSource,
  Match,
  MatchStatus,
  ResultResolution,
  ResultSubmission,
  ResultSubmissionActor,
  ResultSubmissionStatus,
  VerificationStatus,
} from '@/types';

/**
 * The result submission state machine.
 *
 * Team admins report results here; they never write to `matches`. A settled submission is
 * promoted onto the official match record by a trusted server-side finalizer, which is the
 * only actor that may produce `official`. Everything in this module is pure so the whole
 * transition matrix is testable without Firestore.
 *
 *   (new) ──submitting team──▶ pending_confirmation
 *                                 │
 *          opponent confirms ─────┼────▶ confirmed ──system──▶ official
 *          opponent disputes ─────┤          ▲  │
 *                                 │          │  └──league admin──▶ disputed
 *          submitter withdraws ───┼──▶ withdrawn │
 *                                 │              │
 *                                 └──▶ disputed ─┘ (league admin upholds or corrects)
 *                                          │
 *                                          └──league admin──▶ rejected
 *
 * `official`, `rejected` and `withdrawn` are terminal. A rejected or withdrawn match may
 * receive a fresh submission at the next `revision`.
 */

type Transition = {
  from: ResultSubmissionStatus;
  to: ResultSubmissionStatus;
  actors: ResultSubmissionActor[];
};

const TRANSITIONS: Transition[] = [
  // The opponent answers the claim.
  { from: 'pending_confirmation', to: 'confirmed', actors: ['opponent_team', 'league_admin'] },
  { from: 'pending_confirmation', to: 'disputed', actors: ['opponent_team', 'league_admin'] },
  // The submitter can retract a mistyped score while it is still unanswered.
  { from: 'pending_confirmation', to: 'withdrawn', actors: ['submitting_team'] },
  // 72h with no answer. Escalation only — silence is never consent.
  { from: 'pending_confirmation', to: 'confirmation_overdue', actors: ['system'] },
  // A late opponent response still counts, and still carries mutual provenance.
  { from: 'confirmation_overdue', to: 'confirmed', actors: ['opponent_team', 'league_admin'] },
  { from: 'confirmation_overdue', to: 'disputed', actors: ['opponent_team', 'league_admin'] },
  // Extending the deadline puts the clock back rather than deciding anything.
  { from: 'confirmation_overdue', to: 'pending_confirmation', actors: ['league_admin'] },
  { from: 'confirmation_overdue', to: 'rejected', actors: ['league_admin'] },
  // Settled, awaiting promotion onto the match. System only — this is the trust boundary.
  { from: 'confirmed', to: 'official', actors: ['system'] },
  // A league admin may pull a confirmed result back for review before it is finalized.
  { from: 'confirmed', to: 'disputed', actors: ['league_admin'] },
  // Adjudication: upheld as submitted, or corrected to a different score.
  { from: 'disputed', to: 'confirmed', actors: ['league_admin'] },
  { from: 'disputed', to: 'rejected', actors: ['league_admin'] },
  // A correction supersedes an official result. Only the finalizer performs the swap, once
  // the replacement version has been approved.
  { from: 'official', to: 'superseded', actors: ['system'] },
];

/**
 * `official` is NOT terminal: referee corrections, eligibility rulings and abandoned
 * matches are ordinary sports operations, and a pilot cannot depend on super-admin database
 * surgery for them. It is replaceable only by a new version, via `system`.
 */
export const TERMINAL_STATUSES: ResultSubmissionStatus[] = [
  'rejected',
  'withdrawn',
  'superseded',
];

/** How long an opponent has to answer before the claim escalates to the league. */
export const CONFIRMATION_WINDOW_HOURS = 72;

/** Hours after submission at which the opponent is reminded. */
export const REMINDER_SCHEDULE_HOURS = [24, 48];

/** Statuses from which a match may receive a brand new submission. */
const REPLACEABLE_STATUSES: ResultSubmissionStatus[] = ['rejected', 'withdrawn'];

export function isTerminal(status: ResultSubmissionStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

export function allowedTransitionsFrom(status: ResultSubmissionStatus): Transition[] {
  return TRANSITIONS.filter((transition) => transition.from === status);
}

export function actorsAllowedTo(
  from: ResultSubmissionStatus,
  to: ResultSubmissionStatus
): ResultSubmissionActor[] {
  return TRANSITIONS.find((t) => t.from === from && t.to === to)?.actors ?? [];
}

export function canTransition(
  from: ResultSubmissionStatus,
  to: ResultSubmissionStatus,
  actor: ResultSubmissionActor
): boolean {
  return actorsAllowedTo(from, to).includes(actor);
}

/**
 * Which role a user is acting as for a given submission. Returns null when the user has no
 * standing at all, which callers must treat as a refusal rather than a default.
 */
export function resolveActor(
  submission: Pick<ResultSubmission, 'submittedByTeamId' | 'opponentTeamId'>,
  context: {
    teamIdsAdministered: string[];
    isLeagueAdminForLeague: boolean;
  }
): ResultSubmissionActor | null {
  // League adjudication outranks team membership: an admin who also runs one of the teams
  // must not be able to confirm their own submission by wearing the other hat.
  if (context.teamIdsAdministered.includes(submission.submittedByTeamId)) return 'submitting_team';
  if (context.teamIdsAdministered.includes(submission.opponentTeamId)) return 'opponent_team';
  if (context.isLeagueAdminForLeague) return 'league_admin';
  return null;
}

export type TransitionRefusal = {
  ok: false;
  reason:
    | 'terminal'
    | 'illegal_transition'
    | 'actor_not_permitted'
    | 'self_confirmation'
    | 'correction_requires_score'
    | 'official_requires_correction'
    | 'not_marked_final'
    | 'correction_requires_reason';
  message: string;
};

export type TransitionApproval = { ok: true };

export type TransitionCheck = TransitionApproval | TransitionRefusal;

/**
 * Full guard for a proposed transition, including the rules that the transition table
 * alone cannot express.
 */
export function checkTransition(input: {
  submission: Pick<ResultSubmission, 'status' | 'submittedByTeamId' | 'opponentTeamId'>;
  to: ResultSubmissionStatus;
  actor: ResultSubmissionActor;
  /** Required when a league admin resolves a dispute by correcting the score. */
  resolution?: ResultResolution;
  correctedScore?: { home: number; away: number };
}): TransitionCheck {
  const { submission, to, actor, resolution, correctedScore } = input;
  const from = submission.status;

  if (isTerminal(from)) {
    return {
      ok: false,
      reason: 'terminal',
      message: `A ${from} submission cannot change. Create a new submission instead.`,
    };
  }

  // An official result may only be displaced by an approved correction, never edited.
  if (from === 'official' && !(to === 'superseded' && actor === 'system')) {
    return {
      ok: false,
      reason: 'official_requires_correction',
      message: 'An official result can only be replaced by an approved correction version.',
    };
  }

  if (allowedTransitionsFrom(from).every((transition) => transition.to !== to)) {
    return {
      ok: false,
      reason: 'illegal_transition',
      message: `${from} cannot move to ${to}.`,
    };
  }

  if (!canTransition(from, to, actor)) {
    return {
      ok: false,
      reason: 'actor_not_permitted',
      message: `A ${actor} may not move a submission from ${from} to ${to}.`,
    };
  }

  // The two-sided check is the entire point of the workflow: the team that reported a
  // result may never be the team that confirms it.
  if (to === 'confirmed' && actor === 'submitting_team') {
    return {
      ok: false,
      reason: 'self_confirmation',
      message: 'The submitting team cannot confirm its own result.',
    };
  }

  if (resolution === 'league_corrected' && !correctedScore) {
    return {
      ok: false,
      reason: 'correction_requires_score',
      message: 'A corrected resolution must carry the corrected score.',
    };
  }

  return { ok: true };
}

/** The score that should reach the official record: an adjudicated one, else as submitted. */
export function finalScore(submission: ResultSubmission): { home: number; away: number } {
  return {
    home: submission.correctedHomeScore ?? submission.homeScore,
    away: submission.correctedAwayScore ?? submission.awayScore,
  };
}

/**
 * Whether a match may accept a brand new submission. Combined with using `matchId` as the
 * document id, this is what prevents a second team admin opening a competing claim: the
 * create simply collides, and they are routed to respond to the existing one.
 */
export function canAcceptNewSubmission(existing?: Pick<ResultSubmission, 'status'>): boolean {
  if (!existing) return true;
  return REPLACEABLE_STATUSES.includes(existing.status);
}

/** A match is eligible for a result once it has been played and is not already official. */
export function canSubmitResultFor(match: Pick<Match, 'status' | 'verificationStatus'>): boolean {
  return (
    (match.status === 'completed' || match.status === 'live') &&
    match.verificationStatus !== 'verified'
  );
}

/**
 * The verification status the match should carry for a given submission state, so the
 * public match record always reflects where the result actually stands.
 */
export function matchVerificationFor(status: ResultSubmissionStatus) {
  switch (status) {
    case 'official':
      return 'verified' as const;
    case 'disputed':
      return 'disputed' as const;
    case 'rejected':
      return 'rejected' as const;
    default:
      return 'pending' as const;
  }
}

// ---------------------------------------------------------------------------
// Confirmation window
// ---------------------------------------------------------------------------

export function confirmationDeadlineFrom(submittedAt: string): string {
  return new Date(new Date(submittedAt).getTime() + CONFIRMATION_WINDOW_HOURS * 3_600_000)
    .toISOString();
}

/** Reminder timestamps that should have been sent by `now`, for the sweep to reconcile. */
export function dueReminders(submittedAt: string, now: string): number[] {
  const elapsedHours = (new Date(now).getTime() - new Date(submittedAt).getTime()) / 3_600_000;
  return REMINDER_SCHEDULE_HOURS.filter((hours) => elapsedHours >= hours);
}

/**
 * Whether the confirmation window has elapsed. Passing the deadline escalates to the
 * league; it never confirms anything. Silence is not consent.
 */
export function isConfirmationOverdue(
  submission: Pick<ResultSubmission, 'status' | 'confirmationDeadline'>,
  now: string
): boolean {
  return (
    submission.status === 'pending_confirmation' &&
    new Date(now).getTime() >= new Date(submission.confirmationDeadline).getTime()
  );
}

/**
 * Provenance for a settlement. A league admin confirming after silence is recorded
 * distinctly from a genuine mutual confirmation — the public result may read "Official",
 * the audit trail must show how it got there.
 */
export function finalizationSourceFor(input: {
  previousStatus: ResultSubmissionStatus;
  actor: ResultSubmissionActor;
}): FinalizationSource {
  if (input.actor === 'opponent_team') return 'mutual_confirmation';
  if (input.previousStatus === 'confirmation_overdue') {
    return 'league_admin_nonresponse_confirmation';
  }
  if (input.previousStatus === 'disputed') return 'league_admin_dispute_resolution';
  return 'league_admin_nonresponse_confirmation';
}

// ---------------------------------------------------------------------------
// Finalization
// ---------------------------------------------------------------------------

export function finalizationKeyFor(
  submission: Pick<ResultSubmission, 'id' | 'matchId' | 'resultVersion'>
): string {
  return `${submission.matchId}:${submission.id}:${submission.resultVersion}`;
}

export type FinalizationPlan = {
  finalizationKey: string;
  match: {
    status: MatchStatus;
    verificationStatus: VerificationStatus;
    score: { home: number; away: number };
  };
  submission: {
    status: 'official';
    finalizationSource: FinalizationSource;
    finalizedAt: string;
  };
  /** Set when this result replaces an earlier official version. */
  supersedes?: string;
};

export type FinalizationDecision =
  | { action: 'finalize'; plan: FinalizationPlan }
  | { action: 'noop'; reason: 'already_finalized' | 'not_finalizable' | 'mismatched_parents' };

/**
 * Decides what the finalizer should write, as a pure function so the whole thing is
 * testable without Firestore. The Cloud Function applies this inside one transaction and
 * does nothing else.
 *
 * Idempotency is by `finalizationKey`: an onWrite retry, a duplicate trigger, or the hourly
 * reconciliation sweep re-running all resolve to a no-op rather than applying a result
 * twice.
 */
export function planFinalization(input: {
  submission: ResultSubmission;
  match: Pick<Match, 'id' | 'leagueId' | 'seasonId' | 'homeTeamId' | 'awayTeamId'>;
  processedKeys: string[];
  now: string;
}): FinalizationDecision {
  const { submission, match, processedKeys, now } = input;

  if (submission.status !== 'confirmed') {
    return { action: 'noop', reason: 'not_finalizable' };
  }

  // Never finalize a submission onto a match it does not belong to.
  if (
    submission.matchId !== match.id ||
    submission.leagueId !== match.leagueId ||
    submission.seasonId !== match.seasonId
  ) {
    return { action: 'noop', reason: 'mismatched_parents' };
  }

  const finalizationKey = finalizationKeyFor(submission);
  if (submission.finalizedAt || processedKeys.includes(finalizationKey)) {
    return { action: 'noop', reason: 'already_finalized' };
  }

  const score = finalScore(submission);

  return {
    action: 'finalize',
    plan: {
      finalizationKey,
      match: {
        // Submitting from a live match advances the lifecycle automatically rather than
        // depending on someone to flip it by hand.
        status: 'completed',
        verificationStatus: 'verified',
        score,
      },
      submission: {
        status: 'official',
        finalizationSource:
          submission.finalizationSource ??
          finalizationSourceFor({ previousStatus: 'confirmed', actor: 'league_admin' }),
        finalizedAt: now,
      },
      supersedes: submission.supersedesSubmissionId,
    },
  };
}

/**
 * Whether a correction may be raised against an official result without platform sign-off.
 * Inside the grace window a league admin may correct their own league; after it, a
 * platform admin must approve, so late edits to a settled table are always escalated.
 */
export const CORRECTION_SELF_SERVICE_HOURS = 72;

export function correctionRequiresPlatformApproval(
  finalizedAt: string,
  now: string
): boolean {
  const elapsed = (new Date(now).getTime() - new Date(finalizedAt).getTime()) / 3_600_000;
  return elapsed > CORRECTION_SELF_SERVICE_HOURS;
}

export function checkCorrectionRequest(input: {
  submission: Pick<ResultSubmission, 'status' | 'finalizedAt'>;
  reason?: string;
  approvedByPlatformAdmin: boolean;
  now: string;
}): TransitionCheck {
  const { submission, reason, approvedByPlatformAdmin, now } = input;

  if (submission.status !== 'official') {
    return {
      ok: false,
      reason: 'illegal_transition',
      message: 'Only an official result can be corrected.',
    };
  }

  if (!reason || !reason.trim()) {
    return {
      ok: false,
      reason: 'correction_requires_reason',
      message: 'A correction must record why the official result is being replaced.',
    };
  }

  if (
    submission.finalizedAt &&
    correctionRequiresPlatformApproval(submission.finalizedAt, now) &&
    !approvedByPlatformAdmin
  ) {
    return {
      ok: false,
      reason: 'actor_not_permitted',
      message: `Corrections more than ${CORRECTION_SELF_SERVICE_HOURS}h after finalization need platform approval.`,
    };
  }

  return { ok: true };
}
