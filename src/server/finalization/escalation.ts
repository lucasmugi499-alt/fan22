/**
 * Escalation must not silently strand a match.
 *
 * Platform Competition Integrity is one team serving every league. Unbounded, it becomes the
 * platform's slowest path while standings quietly go wrong: a fixture with no defensible
 * result sits in a queue, the table shows the other results as if it were complete, and
 * nobody looking at the table can tell.
 *
 * So the deadline changes what the public sees, not who decides. After it passes the match
 * stays unofficial and the standings say so, visibly. Nothing auto-resolves: a timeout never
 * decides in favour of either team, never hands the decision back to the conflicted admin who
 * escalated it, and never quietly officialises. A match with no defensible result stays a
 * match with no result.
 */

import { isCapturePolicy } from '../../lib/capturePolicy';

export const ESCALATION_DEADLINE_DAYS = 7;

/**
 * How many days after kickoff an unreported match raises a case.
 *
 * Shorter where field capture is required, because in that competition somebody was assigned
 * and did not report, which is a question worth asking the same week. Longer elsewhere, where
 * a league entering results at the weekend is ordinary rather than a signal.
 */
export const STALENESS_DAYS = { fieldRequired: 3, otherwise: 7 } as const;

export type StandingsTreatment = 'counted' | 'provisional';

/**
 * Whether an unresolved case has passed its deadline, and what a reader should be told.
 *
 * Deliberately returns a treatment rather than a boolean. "Overdue" is an operational fact
 * about a queue; "provisional" is what a person reading a league table needs to know, and the
 * two are different sentences for different audiences.
 */
export function escalationState(input: {
  status: string;
  escalatedAt?: string;
  now: Date;
  deadlineDays?: number;
}): { overdue: boolean; standings: StandingsTreatment; daysWaiting: number } {
  if (input.status === 'resolved' || input.status === 'superseded' || !input.escalatedAt) {
    return { overdue: false, standings: 'counted', daysWaiting: 0 };
  }

  const escalated = Date.parse(input.escalatedAt);
  if (Number.isNaN(escalated)) return { overdue: false, standings: 'counted', daysWaiting: 0 };

  const daysWaiting = Math.floor((input.now.getTime() - escalated) / 86_400_000);
  const overdue = daysWaiting >= (input.deadlineDays ?? ESCALATION_DEADLINE_DAYS);

  return {
    overdue,
    // An escalated match is not counted as a settled result even before the deadline: the
    // deadline governs when it becomes visibly provisional to a reader, not when it stops
    // being decided.
    standings: overdue ? 'provisional' : 'counted',
    daysWaiting,
  };
}

/** Fixtures past kickoff with no report at all, which is how standings quietly go wrong. */
export function isUnreportedAndStale(input: {
  scheduledAt: string;
  status: string;
  verificationStatus: string;
  hasReport: boolean;
  hasResultSubmission: boolean;
  hasOfficialResult: boolean;
  effectiveCapturePolicy?: string;
  capturePolicyBoundAt?: string;
  now: Date;
}) {
  if (!input.capturePolicyBoundAt) return false;
  if (!isCapturePolicy(input.effectiveCapturePolicy)) return false;
  const policyBoundAt = Date.parse(input.capturePolicyBoundAt);
  const kickoff = Date.parse(input.scheduledAt);
  if (Number.isNaN(policyBoundAt) || Number.isNaN(kickoff) || policyBoundAt > kickoff) return false;
  if (input.status !== 'scheduled' && input.status !== 'completed') return false;
  if (input.verificationStatus !== 'pending') return false;
  if (input.hasReport || input.hasResultSubmission || input.hasOfficialResult) return false;
  const days = Math.floor((input.now.getTime() - kickoff) / 86_400_000);
  const threshold = input.effectiveCapturePolicy === 'FIELD_REQUIRED'
    ? STALENESS_DAYS.fieldRequired
    : STALENESS_DAYS.otherwise;
  return days >= threshold;
}
