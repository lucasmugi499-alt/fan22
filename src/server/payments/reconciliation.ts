import { adminDb } from '@/lib/firebase/admin';
import type { MoneyCurrency, PaymentWebhookEvent } from '@/types/money';
import { paymentProviderFromEnvironment, type PaymentProviderName } from './providers';
import { recordProviderAttempt } from './providerAttempts';
import { processVerifiedPaymentEvent } from './settlement';

function providerAmount(raw: Record<string, unknown>, fallback: number) {
  const value = raw.amount;
  return typeof value === 'number' || typeof value === 'string' ? Number(value) : fallback;
}

function providerCurrency(raw: Record<string, unknown>, fallback: MoneyCurrency) {
  return (typeof raw.currency === 'string' ? raw.currency : fallback) as MoneyCurrency;
}

export async function reconcileProcessingPayments(limit = 100) {
  const snapshots = await adminDb.collection('paymentIntents')
    .where('status', 'in', ['payment_pending', 'payment_processing'])
    .orderBy('updatedAt', 'asc')
    .limit(limit)
    .get();
  const outcomes: Array<{ id: string; outcome: string }> = [];

  for (const snapshot of snapshots.docs) {
    const intent = snapshot.data();
    const provider = intent.provider as PaymentProviderName;
    try {
      const adapter = paymentProviderFromEnvironment(provider);
      const requestReference = intent.providerRequestReference
        ?? intent.providerReference
        ?? (
          typeof intent.idempotencyKey === 'string'
            ? adapter.recoverCollectionReference?.({
                paymentIntentId: snapshot.id,
                idempotencyKey: intent.idempotencyKey,
              })
            : undefined
        );
      if (typeof requestReference !== 'string') {
        await snapshot.ref.update({ updatedAt: new Date() });
        await recordProviderAttempt({
          paymentIntentId: snapshot.id,
          provider,
          operation: 'reconciliation',
          responseStatus: 'missing_request_reference',
        });
        outcomes.push({ id: snapshot.id, outcome: 'missing_request_reference' });
        continue;
      }
      if (!intent.providerRequestReference && !intent.providerReference) {
        await snapshot.ref.update({
          providerRequestReference: requestReference,
          updatedAt: new Date(),
        });
      }
      const operation = await adapter.getCollectionStatus(requestReference);
      await recordProviderAttempt({
        paymentIntentId: snapshot.id,
        provider,
        operation: 'reconciliation',
        result: operation,
        responseStatus: operation.status,
      });
      if (!['settled', 'failed'].includes(operation.status)) {
        await snapshot.ref.update({ updatedAt: new Date() });
        outcomes.push({ id: snapshot.id, outcome: operation.status });
        continue;
      }
      const event: PaymentWebhookEvent = {
        provider,
        eventId: `reconcile:${snapshot.id}:${operation.providerRequestReference}:${operation.status}`,
        paymentIntentId: snapshot.id,
        status: operation.status as 'settled' | 'failed',
        amountMinor: providerAmount(operation.raw, intent.totalAmountMinor),
        currency: providerCurrency(operation.raw, intent.currency),
        occurredAt: new Date().toISOString(),
        providerRequestReference: operation.providerRequestReference,
        providerFinancialReference: operation.providerFinancialReference,
        verifiedByStatusQuery: true,
      };
      const result = await processVerifiedPaymentEvent(event);
      outcomes.push({ id: snapshot.id, outcome: result.outcome });
    } catch (error) {
      await recordProviderAttempt({
        paymentIntentId: snapshot.id,
        provider,
        operation: 'reconciliation',
        responseStatus: 'exception',
        error,
      }).catch(() => undefined);
      outcomes.push({ id: snapshot.id, outcome: 'exception' });
    }
  }
  return outcomes;
}
