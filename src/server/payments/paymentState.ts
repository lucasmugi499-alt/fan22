import type { PaymentIntentStatus } from '@/types/money';

export type PaymentTransitionDecision = 'apply' | 'duplicate' | 'reject';

const TRANSITIONS: Record<PaymentIntentStatus, PaymentIntentStatus[]> = {
  created: ['payment_pending', 'cancelled'],
  payment_pending: ['payment_processing', 'settled', 'failed', 'held_for_review', 'cancelled'],
  payment_processing: ['settled', 'failed', 'held_for_review', 'cancelled'],
  held_for_review: ['payment_processing', 'settled', 'failed', 'cancelled'],
  failed: [],
  cancelled: [],
  settled: [],
  chargeback: [],
};

/** A terminal settlement cannot be overwritten by an ordinary late callback. */
export function paymentTransition(
  current: PaymentIntentStatus,
  next: PaymentIntentStatus,
  verifiedByStatusQuery = false,
): PaymentTransitionDecision {
  if (current === next) return 'duplicate';
  if (current === 'settled' || current === 'cancelled' || current === 'chargeback') return 'reject';
  // A late verified provider status can recover a previously reported failure. It may not
  // do so from an unsigned delivery notification.
  if (current === 'failed' && next === 'settled') return verifiedByStatusQuery ? 'apply' : 'reject';
  return TRANSITIONS[current].includes(next) ? 'apply' : 'reject';
}

export function isTerminalPaymentStatus(status: PaymentIntentStatus) {
  return ['settled', 'failed', 'cancelled', 'chargeback'].includes(status);
}
