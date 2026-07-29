import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { PaymentProviderName, ProviderOperation } from './providers';

const SENSITIVE_KEY = /authorization|token|secret|password|api.?key|msisdn|phone|payer|payee|subscriber|beneficiary/i;

export function redactProviderPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactProviderPayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactProviderPayload(item),
    ]),
  );
}

export async function recordProviderAttempt(input: {
  paymentIntentId: string;
  provider: PaymentProviderName;
  operation: 'collection_create' | 'collection_status' | 'callback_verify' | 'reconciliation';
  attemptCount?: number;
  result?: ProviderOperation;
  responseStatus: string;
  error?: unknown;
}) {
  const ref = adminDb.collection('paymentProviderAttempts').doc();
  await ref.set({
    id: ref.id,
    paymentIntentId: input.paymentIntentId,
    provider: input.provider,
    operation: input.operation,
    providerRequestReference: input.result?.providerRequestReference ?? null,
    providerFinancialReference: input.result?.providerFinancialReference ?? null,
    responseStatus: input.responseStatus,
    redactedProviderResponse: input.result
      ? redactProviderPayload(input.result.raw)
      : input.error instanceof Error
        ? { error: input.error.message }
        : null,
    attemptCount: input.attemptCount ?? 1,
    createdAt: FieldValue.serverTimestamp(),
  });
}
