import { describe, expect, it } from 'vitest';
import { SandboxPaymentProvider } from './SandboxPaymentProvider';

describe('SandboxPaymentProvider', () => {
  it('creates a pending provider-owned collection request without settling money', async () => {
    const provider = new SandboxPaymentProvider();
    const operation = await provider.createCollection({
      paymentIntentId: 'pi_001',
      amountMinor: 105_000,
      currency: 'UGX',
      customerPhone: '256700000000',
      callbackUrl: 'https://example.test/api/payments/webhooks/provider',
      idempotencyKey: 'checkout_001',
      description: 'GoalPlace256 support',
    });
    expect(operation.status).toBe('payment_pending');
    expect(operation.providerRequestReference).toBe('sandbox_collection_pi_001');
  });
});
