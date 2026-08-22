/**
 * Who an athlete's money belongs to, kept separate from who the athlete is.
 *
 * An athlete on this platform is a managed profile: their team writes their name, position,
 * photo and roster status, because the team is the party that actually knows those facts and
 * the athlete should not need an account to exist in the sporting record.
 *
 * Payout identity is the one thing that model cannot extend to. If the same Team Admin who
 * creates "Martha Nansubuga" also names the account her supporters' money lands in, then
 * inventing an athlete is a way to get paid, and every fan contribution is only as
 * trustworthy as the least careful club official on the platform. So this file draws one
 * line and enforces it in code rather than in a policy document:
 *
 *   - A team or league may INVITE a payee to come forward. That is all they may do.
 *   - The athlete or their guardian SUBMITS the details, through their own portal.
 *   - Platform VERIFIES, and never the same person who submitted.
 *
 * Platform-assisted submission exists because the alternative is worse: an athlete with no
 * phone would otherwise be unable to be paid at all, and someone would end up entering the
 * details in their name with no record of having done so. It is allowed, it demands evidence,
 * and it still cannot be verified by whoever entered it.
 */

export type PayeeStatus =
  | 'not_started'
  | 'invited'
  | 'submitted'
  | 'verified'
  | 'rejected'
  | 'suspended';

/** The authority an actor is acting under, not the role they hold elsewhere. */
export type PayeeAuthority = 'team' | 'league' | 'platform' | 'athlete' | 'guardian';

export type PayeeAction = 'invite' | 'submit' | 'verify' | 'reject' | 'suspend' | 'reinstate';

/** How a submission arrived. Provenance is part of the record, not metadata. */
export type PayeeSubmissionSource = 'portal' | 'platform_assisted';

export type AthletePayeeRecord = {
  athleteId: string;
  status: PayeeStatus;
  /** Who submitted the current details, and how. Absent until a first submission. */
  submittedByUserId?: string;
  submittedVia?: PayeeSubmissionSource;
  submittedAt?: string;
  /** Evidence references required for a platform-assisted submission. */
  evidenceRefs?: string[];
  verifiedByUserId?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  /**
   * A hash of the payout details, never the details.
   *
   * Lets an audit entry prove the destination account changed between two points in time
   * without the audit trail itself becoming a place account numbers are stored.
   */
  detailsFingerprint?: string;
  invitedByUserId?: string;
  invitedAt?: string;
  createdAt: string;
  updatedAt: string;
};

/** Who may even attempt each action. The refusals below are the point of this table. */
const ALLOWED_AUTHORITIES: Record<PayeeAction, PayeeAuthority[]> = {
  // A club knows who its athletes are, so it may ask them to come forward — and nothing more.
  invite: ['team', 'league', 'platform'],
  // The people whose money it is. Platform appears here only for assisted submission.
  submit: ['athlete', 'guardian', 'platform'],
  // Verification is a platform act. A team verifying its own invitee is the fraud.
  verify: ['platform'],
  reject: ['platform'],
  suspend: ['platform'],
  reinstate: ['platform'],
};

const TRANSITIONS: Record<PayeeAction, { from: PayeeStatus[]; to: PayeeStatus }> = {
  invite: { from: ['not_started', 'rejected', 'suspended'], to: 'invited' },
  submit: { from: ['not_started', 'invited', 'rejected'], to: 'submitted' },
  verify: { from: ['submitted'], to: 'verified' },
  reject: { from: ['submitted'], to: 'rejected' },
  suspend: { from: ['verified'], to: 'suspended' },
  // Back to submitted, not to verified: a suspended payee is re-checked, not waved through.
  reinstate: { from: ['suspended'], to: 'submitted' },
};

export type PayeeDecision =
  | { ok: true; nextStatus: PayeeStatus }
  | { ok: false; reason: string };

export function decidePayeeTransition(input: {
  record: Pick<AthletePayeeRecord, 'status' | 'submittedByUserId'>;
  action: PayeeAction;
  authority: PayeeAuthority;
  actorUserId: string;
  /** Required when a platform operator submits on an athlete's behalf. */
  source?: PayeeSubmissionSource;
  evidenceRefs?: string[];
}): PayeeDecision {
  const allowed = ALLOWED_AUTHORITIES[input.action];
  if (!allowed) return { ok: false, reason: 'Unknown payee action.' };

  if (!allowed.includes(input.authority)) {
    // Worded so the refusal teaches the model rather than just denying.
    if ((input.authority === 'team' || input.authority === 'league') && input.action !== 'invite') {
      return {
        ok: false,
        reason: 'A team or league may invite a payee to come forward, but may not submit or verify payout details. Those belong to the athlete or guardian, and are verified by Platform.',
      };
    }
    return { ok: false, reason: `A ${input.authority} may not ${input.action} payout details.` };
  }

  const transition = TRANSITIONS[input.action];
  if (!transition.from.includes(input.record.status)) {
    return { ok: false, reason: `Cannot ${input.action} payout details that are ${input.record.status}.` };
  }

  if (input.action === 'submit') {
    const source = input.source ?? (input.authority === 'platform' ? 'platform_assisted' : 'portal');
    if (input.authority === 'platform' && source !== 'platform_assisted') {
      return { ok: false, reason: 'A platform operator can only submit as a recorded assisted submission.' };
    }
    if (source === 'platform_assisted' && !input.evidenceRefs?.length) {
      // Assisted submission is a real need; an unevidenced one is indistinguishable from
      // someone typing their own account number into an athlete's record.
      return {
        ok: false,
        reason: 'An assisted submission must carry evidence of the athlete or guardian’s instruction.',
      };
    }
    if (source === 'portal' && input.authority === 'platform') {
      return { ok: false, reason: 'A platform operator cannot submit as the athlete.' };
    }
  }

  if (input.action === 'verify') {
    // The two-person rule. Assisted submission is the case this exists for: the operator who
    // entered the details on an athlete's behalf must not also be the one who attests them.
    if (input.record.submittedByUserId && input.record.submittedByUserId === input.actorUserId) {
      return {
        ok: false,
        reason: 'Payout details must be verified by someone other than whoever submitted them.',
      };
    }
  }

  return { ok: true, nextStatus: transition.to };
}

/** Whether a payout instruction may be issued against this record at all. */
export function canReceivePayouts(record: Pick<AthletePayeeRecord, 'status'>) {
  return record.status === 'verified';
}

/**
 * What a non-payee actor is allowed to see.
 *
 * A Team Admin has a legitimate need to know whether an athlete can be paid — it tells them
 * whether to chase the athlete for details. It is never a reason to show them the account.
 */
export type RedactedPayee = {
  athleteId: string;
  status: PayeeStatus;
  canReceivePayouts: boolean;
  hasDetailsOnFile: boolean;
  updatedAt: string;
};

export function redactPayee(record: AthletePayeeRecord): RedactedPayee {
  return {
    athleteId: record.athleteId,
    status: record.status,
    canReceivePayouts: canReceivePayouts(record),
    hasDetailsOnFile: Boolean(record.detailsFingerprint),
    updatedAt: record.updatedAt,
  };
}

export function emptyPayeeRecord(athleteId: string, now: string): AthletePayeeRecord {
  return { athleteId, status: 'not_started', createdAt: now, updatedAt: now };
}
