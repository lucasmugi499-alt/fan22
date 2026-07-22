import {
  Match,
  ResultResolution,
  ResultSubmission,
  ResultSubmissionActor,
  ResultSubmissionStatus,
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
  // Settled, awaiting promotion onto the match. System only — this is the trust boundary.
  { from: 'confirmed', to: 'official', actors: ['system'] },
  // A league admin may pull a confirmed result back for review before it is finalized.
  { from: 'confirmed', to: 'disputed', actors: ['league_admin'] },
  // Adjudication: upheld as submitted, or corrected to a different score.
  { from: 'disputed', to: 'confirmed', actors: ['league_admin'] },
  { from: 'disputed', to: 'rejected', actors: ['league_admin'] },
];

export const TERMINAL_STATUSES: ResultSubmissionStatus[] = ['official', 'rejected', 'withdrawn'];

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
    | 'correction_requires_score';
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
