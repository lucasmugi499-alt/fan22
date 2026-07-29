import type { MoneyCurrency, PaymentIntentStatus, PaymentWebhookEvent } from '@/types/money';

export type PaymentProviderName = PaymentWebhookEvent['provider'];

export type CollectionRequest = {
  paymentIntentId: string;
  amountMinor: number;
  currency: MoneyCurrency;
  customerPhone: string;
  callbackUrl: string;
  idempotencyKey: string;
  description: string;
};

export type DisbursementRequest = {
  payoutId: string;
  amountMinor: number;
  currency: MoneyCurrency;
  recipientPhone: string;
  callbackUrl: string;
  idempotencyKey: string;
};

export type ProviderOperation = {
  providerReference: string;
  status: PaymentIntentStatus;
  customerMessage: string;
  raw: Record<string, unknown>;
};

export type VerifiedProviderCallback = Omit<PaymentWebhookEvent, 'verifiedByStatusQuery'> & {
  verifiedByStatusQuery: true;
  raw: Record<string, unknown>;
};

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createCollection(input: CollectionRequest): Promise<ProviderOperation>;
  getCollectionStatus(providerReference: string): Promise<ProviderOperation>;
  createDisbursement(input: DisbursementRequest): Promise<ProviderOperation>;
  getDisbursementStatus(providerReference: string): Promise<ProviderOperation>;
  requestRefund?(providerReference: string, amountMinor: number): Promise<ProviderOperation>;
  verifyCallback(request: Request): Promise<VerifiedProviderCallback | null>;
}

export class PaymentProviderConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaymentProviderConfigurationError';
  }
}
