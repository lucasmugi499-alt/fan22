import { createHash } from 'node:crypto';

const CHECKOUT_FIELDS = [
  'supporterUserId',
  'purpose',
  'recipientType',
  'recipientId',
  'supportNeedId',
  'campaignId',
  'supportAmountMinor',
  'provider',
] as const;

export function paymentIntentIdFor(idempotencyKey: string) {
  return `pi_${createHash('sha256').update(idempotencyKey).digest('base64url').slice(0, 48)}`;
}

export function checkoutRequestMatches(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
) {
  return CHECKOUT_FIELDS.every((field) => (previous[field] ?? null) === (next[field] ?? null));
}
