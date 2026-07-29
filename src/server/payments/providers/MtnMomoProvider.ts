import { createHash } from 'node:crypto';
import type { PaymentIntentStatus } from '@/types/money';
import { adminDb } from '@/lib/firebase/admin';
import {
  PaymentProviderConfigurationError,
  type CollectionRequest,
  type CollectionReferenceRecovery,
  type DisbursementRequest,
  type PaymentProvider,
  type ProviderOperation,
  type VerifiedProviderCallback,
} from './PaymentProvider';

type MtnStatusPayload = {
  status?: string;
  amount?: string;
  currency?: string;
  financialTransactionId?: string;
  externalId?: string;
};

type TokenCacheEntry = {
  accessToken: string;
  subscriptionKey: string;
  expiresAt: number;
};

const tokenCache = new Map<'collection' | 'disbursement', TokenCacheEntry>();

export function mtnReferenceFor(idempotencyKey: string) {
  const hex = createHash('sha256').update(idempotencyKey).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new PaymentProviderConfigurationError(`${name} is required before MTN MoMo sandbox use.`);
  return value;
}

function normalizeStatus(status: string | undefined): PaymentIntentStatus {
  switch (status?.toUpperCase()) {
    case 'SUCCESSFUL': return 'settled';
    case 'PENDING': return 'payment_processing';
    case 'FAILED': return 'failed';
    default: return 'held_for_review';
  }
}

/** MTN's RequestToPay and Transfer APIs are asynchronous; callbacks are status-polled before settlement. */
export class MtnMomoProvider implements PaymentProvider {
  readonly name = 'mtn_momo' as const;
  private readonly baseUrl = required('GOALPLACE_MTN_MOMO_BASE_URL').replace(/\/$/, '');
  private readonly targetEnvironment = required('GOALPLACE_MTN_MOMO_TARGET_ENVIRONMENT');

  private async token(product: 'collection' | 'disbursement') {
    const cached = tokenCache.get(product);
    if (cached && cached.expiresAt > Date.now() + 30_000) {
      return { token: cached.accessToken, subscriptionKey: cached.subscriptionKey };
    }
    const user = required(`GOALPLACE_MTN_MOMO_${product.toUpperCase()}_API_USER`);
    const key = required(`GOALPLACE_MTN_MOMO_${product.toUpperCase()}_API_KEY`);
    const subscriptionKey = required(`GOALPLACE_MTN_MOMO_${product.toUpperCase()}_SUBSCRIPTION_KEY`);
    const response = await fetch(`${this.baseUrl}/${product}/token/`, {
      method: 'POST',
      headers: {
        authorization: `Basic ${Buffer.from(`${user}:${key}`).toString('base64')}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({})) as {
      access_token?: string;
      expires_in?: number;
    };
    if (!response.ok || !payload.access_token) throw new Error('MTN MoMo token request failed.');
    tokenCache.set(product, {
      accessToken: payload.access_token,
      subscriptionKey,
      expiresAt: Date.now() + Math.max(60, payload.expires_in ?? 3600) * 1000,
    });
    return { token: payload.access_token, subscriptionKey };
  }

  private async initiate(
    product: 'collection' | 'disbursement',
    path: string,
    input: CollectionRequest | DisbursementRequest,
    partyKey: 'payer' | 'payee',
  ) {
    const reference = mtnReferenceFor(input.idempotencyKey);
    const { token, subscriptionKey } = await this.token(product);
    const isCollection = partyKey === 'payer';
    const phone = isCollection
      ? (input as CollectionRequest).customerPhone
      : (input as DisbursementRequest).recipientPhone;
    const externalId = isCollection
      ? (input as CollectionRequest).paymentIntentId
      : (input as DisbursementRequest).payoutId;
    const description = isCollection ? (input as CollectionRequest).description : 'GoalPlace256 payout';
    const response = await fetch(`${this.baseUrl}/${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'X-Reference-Id': reference,
        'X-Target-Environment': this.targetEnvironment,
        'X-Callback-Url': input.callbackUrl,
      },
      body: JSON.stringify({
        amount: String(input.amountMinor),
        currency: input.currency,
        externalId,
        [partyKey]: { partyIdType: 'MSISDN', partyId: phone },
        payerMessage: description,
        payeeNote: description,
      }),
      cache: 'no-store',
    });
    if (!response.ok && response.status !== 202) {
      throw new Error(`MTN MoMo ${product} request failed with status ${response.status}.`);
    }
    return {
      providerRequestReference: reference,
      status: 'payment_processing' as const,
      customerMessage: isCollection ? 'Approve the MTN MoMo prompt on your phone.' : 'MTN MoMo is processing the payout.',
      raw: { acceptedStatus: response.status, reference },
    };
  }

  async createCollection(input: CollectionRequest): Promise<ProviderOperation> {
    return this.initiate('collection', 'collection/v1_0/requesttopay', input, 'payer');
  }

  recoverCollectionReference(input: CollectionReferenceRecovery) {
    return mtnReferenceFor(input.idempotencyKey);
  }

  async getCollectionStatus(providerReference: string): Promise<ProviderOperation> {
    return this.status('collection', `collection/v1_0/requesttopay/${providerReference}`, providerReference);
  }

  async createDisbursement(input: DisbursementRequest): Promise<ProviderOperation> {
    return this.initiate('disbursement', 'disbursement/v1_0/transfer', input, 'payee');
  }

  async getDisbursementStatus(providerReference: string): Promise<ProviderOperation> {
    return this.status('disbursement', `disbursement/v1_0/transfer/${providerReference}`, providerReference);
  }

  private async status(product: 'collection' | 'disbursement', path: string, reference: string): Promise<ProviderOperation> {
    const { token, subscriptionKey } = await this.token(product);
    const response = await fetch(`${this.baseUrl}/${path}`, {
      headers: {
        authorization: `Bearer ${token}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'X-Target-Environment': this.targetEnvironment,
      },
      cache: 'no-store',
    });
    const raw = await response.json().catch(() => ({})) as MtnStatusPayload;
    if (!response.ok) throw new Error(`MTN MoMo status request failed with status ${response.status}.`);
    return {
      providerRequestReference: reference,
      providerFinancialReference: raw.financialTransactionId,
      status: normalizeStatus(raw.status),
      customerMessage: raw.status ?? 'MTN MoMo status received.',
      raw: raw as Record<string, unknown>,
    };
  }

  async verifyCallback(request: Request): Promise<VerifiedProviderCallback | null> {
    const payload = await request.json().catch(() => null) as MtnStatusPayload | null;
    if (!payload?.externalId) return null;
    // MTN callbacks are delivery notifications, not settlement proof. Confirm via GET before release.
    const intent = await adminDb.collection('paymentIntents').doc(payload.externalId).get();
    const providerRequestReference = intent.data()?.providerRequestReference ?? intent.data()?.providerReference;
    if (
      !intent.exists ||
      intent.data()?.provider !== this.name ||
      typeof providerRequestReference !== 'string'
    ) return null;
    const status = await this.getCollectionStatus(providerRequestReference);
    const raw = status.raw as MtnStatusPayload;
    return {
      provider: this.name,
      eventId: `${payload.externalId}:${status.providerRequestReference}:${status.status}`,
      paymentIntentId: payload.externalId,
      status: status.status === 'settled' ? 'settled' : status.status === 'failed' ? 'failed' : 'held_for_review',
      amountMinor: Number(raw.amount ?? payload.amount ?? 0),
      currency: (raw.currency ?? required('GOALPLACE_MTN_MOMO_CURRENCY')) as 'UGX' | 'EUR',
      occurredAt: new Date().toISOString(),
      providerRequestReference: status.providerRequestReference,
      providerFinancialReference: status.providerFinancialReference,
      verifiedByStatusQuery: true,
      raw: status.raw,
    };
  }
}

export function resetMtnTokenCacheForTests() {
  tokenCache.clear();
}
