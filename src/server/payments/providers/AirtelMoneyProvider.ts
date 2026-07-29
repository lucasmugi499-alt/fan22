import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PaymentIntentStatus } from '@/types/money';
import {
  PaymentProviderConfigurationError,
  type CollectionRequest,
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

function isEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function normalizeStatus(value: unknown): PaymentIntentStatus {
  if (value === 'TS' || value === 'SUCCESS' || value === 'SUCCESSFUL') return 'settled';
  if (value === 'TF' || value === 'FAILED') return 'failed';
  if (value === 'TIP' || value === 'PENDING') return 'payment_processing';
  return 'held_for_review';
}

/**
 * Airtel's final field names and callback signing policy are partner-contract specific.
 * This adapter intentionally requires the onboarding supplied endpoint configuration and
 * validates the registered HMAC secret before its normalized event reaches the ledger.
 */
export class AirtelMoneyProvider implements PaymentProvider {
  readonly name = 'airtel_money' as const;

  private async accessToken() {
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
      providerReference: String(payload.reference ?? payload.transactionId ?? input.paymentIntentId),
      status: 'payment_processing',
      customerMessage: 'Approve the Airtel Money prompt on your phone.',
      raw: payload,
    };
  }

  async getCollectionStatus(providerReference: string): Promise<ProviderOperation> {
    const url = required('GOALPLACE_AIRTEL_COLLECTION_STATUS_URL').replace(':reference', encodeURIComponent(providerReference));
    const token = await this.accessToken();
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, 'X-Country': required('GOALPLACE_AIRTEL_COUNTRY'), 'X-Currency': 'UGX' }, cache: 'no-store' });
    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Airtel Money status request failed with status ${response.status}.`);
    return { providerReference, status: normalizeStatus(raw.status?.toString()), customerMessage: String(raw.message ?? raw.status ?? 'Airtel Money status received.'), raw };
  }

  async createDisbursement(input: DisbursementRequest): Promise<ProviderOperation> {
    const payload = await this.post('GOALPLACE_AIRTEL_DISBURSEMENT_URL', {
      reference: input.payoutId,
      beneficiary: { country: required('GOALPLACE_AIRTEL_COUNTRY'), currency: input.currency, msisdn: input.recipientPhone },
      transaction: { amount: input.amountMinor, country: required('GOALPLACE_AIRTEL_COUNTRY'), currency: input.currency, id: input.payoutId },
      callbackUrl: input.callbackUrl,
    });
    return { providerReference: String(payload.reference ?? payload.transactionId ?? input.payoutId), status: 'payment_processing', customerMessage: 'Airtel Money is processing the payout.', raw: payload };
  }

  async getDisbursementStatus(providerReference: string): Promise<ProviderOperation> {
    const url = required('GOALPLACE_AIRTEL_DISBURSEMENT_STATUS_URL').replace(':reference', encodeURIComponent(providerReference));
    const token = await this.accessToken();
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, 'X-Country': required('GOALPLACE_AIRTEL_COUNTRY'), 'X-Currency': 'UGX' }, cache: 'no-store' });
    const raw = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) throw new Error(`Airtel Money status request failed with status ${response.status}.`);
    return { providerReference, status: normalizeStatus(raw.status?.toString()), customerMessage: String(raw.message ?? raw.status ?? 'Airtel Money status received.'), raw };
  }

  async verifyCallback(request: Request): Promise<VerifiedProviderCallback | null> {
    const rawBody = await request.text();
    const supplied = request.headers.get('x-goalplace-airtel-signature');
    const expected = createHmac('sha256', required('GOALPLACE_AIRTEL_CALLBACK_SECRET')).update(rawBody).digest('hex');
    if (!supplied || !isEqual(supplied, expected)) return null;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }
    const paymentIntentId = String(payload.reference ?? payload.transactionId ?? '');
    if (!paymentIntentId) return null;
    const status = await this.getCollectionStatus(paymentIntentId);
    return {
      provider: this.name,
      eventId: `airtel:${paymentIntentId}:${status.providerReference}:${status.status}`,
      paymentIntentId,
      status: status.status === 'settled' ? 'settled' : status.status === 'failed' ? 'failed' : 'held_for_review',
      amountMinor: Number(payload.amount ?? 0),
      currency: 'UGX',
      occurredAt: new Date().toISOString(),
      providerReference: status.providerReference,
      verifiedByStatusQuery: true,
      raw: status.raw,
    };
  }
}
