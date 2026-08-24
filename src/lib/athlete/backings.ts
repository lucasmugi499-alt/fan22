import type { Allocation } from '@/types/money';

/**
 * What an athlete's supporters have given them, and what has actually cleared.
 *
 * These are two different numbers and they always will be, so the projection reports both
 * rather than reconciling them into one. Money arrives when a supporter pays, and it becomes
 * payable only once the allocation has passed review and the athlete has a verified payee
 * identity. Collapsing that into a single figure would either overstate what the athlete can
 * receive or understate what their supporters gave.
 *
 * ## No balance, ever
 *
 * GoalPlace does not operate a stored-value wallet. There is no account holding an athlete's
 * money, and only a signed idempotent PSP webhook settles anything, so a mutable `balance`
 * field would be a second source of truth about money that could disagree with the ledger.
 * Every number here is derived on read from settled allocations; nothing is stored, and
 * nothing here is writable.
 */

export type BackingsProjection = {
  /** How many distinct supporters have backed this athlete. */
  totalSupporters: number;
  /** The sum of what supporters gave. Not what the athlete can receive. */
  backingRecordedMinor: number;
  /** The sum that has cleared review and can be paid out. Gated on a verified payee. */
  availableForPayoutMinor: number;
  /** Already paid. Reported separately so "available" never silently includes it. */
  paidOutMinor: number;
  currency: string;
  payoutStatus:
    | 'awaiting_verified_payee'
    | 'awaiting_review'
    | 'ready_for_payout'
    | 'payout_scheduled'
    | 'nothing_yet';
};

/** Allocations that count as money the athlete's supporters actually gave. */
const RECORDED_STATUSES: Allocation['status'][] = [
  'pending_review',
  'held_for_review',
  'eligible_for_payout',
  'payout_scheduled',
  'paid',
];

/** Allocations that have cleared review and are genuinely payable. */
const PAYABLE_STATUSES: Allocation['status'][] = ['eligible_for_payout'];

export function projectAthleteBackings(input: {
  allocations: Allocation[];
  /** Distinct contributor ids, where the caller can resolve them. */
  supporterIds?: string[];
  hasVerifiedPayee: boolean;
  currency?: string;
}): BackingsProjection {
  const { allocations, hasVerifiedPayee } = input;

  // Reversed allocations are excluded from every total rather than netted off. A refund is
  // not negative backing; it is backing that did not happen, and showing it as a deduction
  // would tell an athlete their supporters took money back.
  const live = allocations.filter((allocation) => allocation.status !== 'reversed');

  const sum = (statuses: Allocation['status'][]) => live
    .filter((allocation) => statuses.includes(allocation.status))
    .reduce((total, allocation) => total + allocation.amountMinor, 0);

  const backingRecordedMinor = sum(RECORDED_STATUSES);
  const paidOutMinor = sum(['paid']);
  const scheduledMinor = sum(['payout_scheduled']);
  const clearedMinor = sum(PAYABLE_STATUSES);

  // Gated on the payee, not merely labelled with a warning. An athlete with no verified
  // payout identity has nothing available, because there is nowhere for it to go.
  const availableForPayoutMinor = hasVerifiedPayee ? clearedMinor : 0;

  const payoutStatus: BackingsProjection['payoutStatus'] = backingRecordedMinor === 0
    ? 'nothing_yet'
    : !hasVerifiedPayee
      ? 'awaiting_verified_payee'
      : scheduledMinor > 0
        ? 'payout_scheduled'
        : clearedMinor > 0
          ? 'ready_for_payout'
          : 'awaiting_review';

  return {
    totalSupporters: new Set(input.supporterIds ?? live.map((allocation) => allocation.contributionId)).size,
    backingRecordedMinor,
    availableForPayoutMinor,
    paidOutMinor,
    currency: input.currency ?? live[0]?.currency ?? 'UGX',
    payoutStatus,
  };
}
