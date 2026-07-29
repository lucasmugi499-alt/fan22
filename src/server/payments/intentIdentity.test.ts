import { describe, expect, it } from 'vitest';
import { checkoutRequestMatches, paymentIntentIdFor } from './intentIdentity';

const request = {
  supporterUserId: 'fan_001',
  purpose: 'verified_support_need',
  recipientType: 'athlete',
  recipientId: 'athlete_001',
  supportNeedId: 'need_001',
  supportAmountMinor: 25_000,
  provider: 'airtel_money',
};

describe('payment intent identity', () => {
  it('hashes the complete checkout key instead of colliding on a shared prefix', () => {
    const prefix = 'support:fan_001:athlete_001:';
    expect(paymentIntentIdFor(`${prefix}session-a`))
      .not.toBe(paymentIntentIdFor(`${prefix}session-b`));
  });

  it('binds an idempotent checkout to the selected provider', () => {
    expect(checkoutRequestMatches(request, { ...request })).toBe(true);
    expect(checkoutRequestMatches(request, { ...request, provider: 'mtn_momo' })).toBe(false);
  });
});
