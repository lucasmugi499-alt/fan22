import type { PaymentIntentStatus } from '@/types/money';
import {
  PaymentProviderConfigurationError,
  type CollectionRequest,
  type CollectionReferenceRecovery,
  type DisbursementRequest,
  type PaymentProvider,
  type ProviderOperation,
  type VerifiedProviderCallback,
} from './PaymentProvider';

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new PaymentProviderConfigurationError(`${name} is required before Airtel Money sandbox use.`);
  return value;
}

function normalizeStatus(value: unknown): PaymentIntentStatus {
  if (value === 'TS' || value === 'SUCCESS' || value === 'SUCCESSFUL') return 'settled';
  if (value === 'TF' || value === 'FAILED') return 'failed';
  if (value === 'TIP' || value === 'PENDING') return 'payment_processing';
  return 'held_for_review';
}

function requireVerifiedContract() {
  if (process.env.GOALPLACE_AIRTEL_CONTRACT_STATUS !== 'verified') {
    throw new PaymentProviderConfigurationError(
      'Airtel Money remains contract_pending until official Uganda sandbox payloads and callback authentication are configured.',
    );
  }
}

/** Airtel is deliberately blocked until its account-specific Uganda contract is captured. */
export class AirtelMoneyProvider implements PaymentProvider {
  readonly name = 'airtel_money' as const;

  private async accessToken() {
    requireVerifiedContract();
    const response = await fetch(required('GOALPLACE_AIRTEL_TOKEN_URL'), {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${required('GOALPLACE_AIRTEL_CLIENT_ID')}:${required('GOALPLACE_AIRTEL_CLIENT_SECRET')}`).toString('base64')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ grant_type: 'client_credentials' }),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({})) as { access_token?: string };
    if (!response.ok || !payload.access_token) throw new Error('Airtel Money token request failed.');
    return payload.access_token;
  }

  private async post(endpointEnv: string, body: Record<string, unknown>) {
    const token = await this.accessToken();
    const response = await fetch(required(endpointEnv), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Country': required('GOALPLACE_AIRTEL_COUNTRY'),
        'X-Currency': 'UGX',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Airtel Money request failed with status ${response.status}.`);
    return payload;
  }

  async createCollection(input: CollectionRequest): Promise<ProviderOperation> {
    const payload = await this.post('GOALPLACE_AIRTEL_COLLECTION_URL', {
      reference: input.paymentIntentId,
      subscriber: { country: required('GOALPLACE_AIRTEL_COUNTRY'), currency: input.currency, msisdn: input.customerPhone },
      transaction: { amount: input.amountMinor, country: required('GOALPLACE_AIRTEL_COUNTRY'), currency: input.currency, id: input.paymentIntentId },
      callbackUrl: input.callbackUrl,
    });
    return {
      providerRequestReference: String(payload.reference ?? payload.transactionId ?? input.paymentIntentId),
      status: 'payment_processing',
      customerMessage: 'Approve the Airtel Money prompt on your phone.',
      raw: payload,
    };
  }

  recoverCollectionReference(input: CollectionReferenceRecovery) {
    return input.paymentIntentId;
  }

  async getCollectionStatus(providerReference: string): Promise<ProviderOperation> {
    const url = required('GOALPLACE_AIRTEL_COLLECTION_STATUS_URL').replace(':reference', encodeURIComponent(providerReference));
    const token = await this.accessToken();
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, 'X-Country': required('GOALPLACE_AIRTEL_COUNTRY'), 'X-Currency': 'UGX' }, cache: 'no-store' });
    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Airtel Money status request failed with status ${response.status}.`);
    return { providerRequestReference: providerReference, status: normalizeStatus(raw.status?.toString()), customerMessage: String(raw.message ?? raw.status ?? 'Airtel Money status received.'), raw };
  }

  async createDisbursement(input: DisbursementRequest): Promise<ProviderOperation> {
    const payload = await this.post('GOALPLACE_AIRTEL_DISBURSEMENT_URL', {
      reference: input.payoutId,
      beneficiary: { country: required('GOALPLACE_AIRTEL_COUNTRY'), currency: input.currency, msisdn: input.recipientPhone },
      transaction: { amount: input.amountMinor, country: required('GOALPLACE_AIRTEL_COUNTRY'), currency: input.currency, id: input.payoutId },
      callbackUrl: input.callbackUrl,
    });
    return { providerRequestReference: String(payload.reference ?? payload.transactionId ?? input.payoutId), status: 'payment_processing', customerMessage: 'Airtel Money is processing the payout.', raw: payload };
  }

  async getDisbursementStatus(providerReference: string): Promise<ProviderOperation> {
    const url = required('GOALPLACE_AIRTEL_DISBURSEMENT_STATUS_URL').replace(':reference', encodeURIComponent(providerReference));
    const token = await this.accessToken();
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, 'X-Country': required('GOALPLACE_AIRTEL_COUNTRY'), 'X-Currency': 'UGX' }, cache: 'no-store' });
    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Airtel Money status request failed with status ${response.status}.`);
    return { providerRequestReference: providerReference, status: normalizeStatus(raw.status?.toString()), customerMessage: String(raw.message ?? raw.status ?? 'Airtel Money status received.'), raw };
  }

  async verifyCallback(request: Request): Promise<VerifiedProviderCallback | null> {
    void request;
    requireVerifiedContract();
    throw new PaymentProviderConfigurationError(
      'The Airtel Uganda callback contract must be implemented from redacted official sandbox fixtures before callbacks are accepted.',
    );
  }
}
