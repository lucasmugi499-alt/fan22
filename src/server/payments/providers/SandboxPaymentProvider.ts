import type { PaymentProvider, CollectionRequest, DisbursementRequest, ProviderOperation, VerifiedProviderCallback } from './PaymentProvider';

/** Deterministic local/staging PSP substitute. It never moves funds. */
export class SandboxPaymentProvider implements PaymentProvider {
  readonly name = 'sandbox' as const;

  async createCollection(input: CollectionRequest): Promise<ProviderOperation> {
    return {
      providerRequestReference: `sandbox_collection_${input.paymentIntentId}`,
      status: 'payment_pending',
      customerMessage: 'Sandbox payment request created. No money has moved.',
      raw: { mode: 'sandbox', paymentIntentId: input.paymentIntentId },
    };
  }

  async getCollectionStatus(providerReference: string): Promise<ProviderOperation> {
    return { providerRequestReference: providerReference, status: 'payment_pending', customerMessage: 'Sandbox payment is pending.', raw: { mode: 'sandbox' } };
  }

  async createDisbursement(input: DisbursementRequest): Promise<ProviderOperation> {
    return {
      providerRequestReference: `sandbox_payout_${input.payoutId}`,
      status: 'payment_pending',
      customerMessage: 'Sandbox payout request created. No money has moved.',
      raw: { mode: 'sandbox', payoutId: input.payoutId },
    };
  }

  async getDisbursementStatus(providerReference: string): Promise<ProviderOperation> {
    return { providerRequestReference: providerReference, status: 'payment_pending', customerMessage: 'Sandbox payout is pending.', raw: { mode: 'sandbox' } };
  }

  async verifyCallback(request: Request): Promise<VerifiedProviderCallback | null> {
    void request;
    return null;
  }
}
