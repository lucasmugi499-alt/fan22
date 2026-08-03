import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  buildContributionSettlement,
  buildHeldContributionSettlement,
  cappedPointsAward,
  kampalaPeriod,
} from '@/lib/money';
import type { PaymentIntentStatus, PaymentWebhookEvent } from '@/types/money';
import { paymentTransition } from './paymentState';

type SettlementResult = {
  outcome: 'applied' | 'duplicate' | 'rejected';
  status: PaymentIntentStatus;
};

function paymentStatus(event: PaymentWebhookEvent): PaymentIntentStatus {
  return event.status;
}

/**
 * Applies a provider-verified status exactly once. Provider adapters own authentication
 * and status polling; this function owns all ledger, allocation, reservation, and points
 * side effects so no provider can fork the accounting model.
 */
export async function processVerifiedPaymentEvent(event: PaymentWebhookEvent): Promise<SettlementResult> {
  const eventRef = adminDb.collection('paymentWebhookEvents').doc(`${event.provider}:${event.eventId}`);
  const intentRef = adminDb.collection('paymentIntents').doc(event.paymentIntentId);
  const contributionRef = adminDb.collection('contributions').doc(event.paymentIntentId);
  const reservationRef = adminDb.collection('supportReservations').doc(event.paymentIntentId);
  const occurredAt = new Date(event.occurredAt);
  const period = kampalaPeriod(occurredAt);

  return adminDb.runTransaction(async (transaction) => {
    if ((await transaction.get(eventRef)).exists) {
      // A replayed webhook must report the payment's real current state. Reporting a fixed
      // 'payment_pending' told callers a settled, failed or cancelled payment was still in
      // flight, which is the one answer that is never true for an already-processed event.
      const settledIntent = await transaction.get(intentRef);
      const storedStatus = settledIntent.data()?.status;
      return {
        outcome: 'duplicate',
        status: (typeof storedStatus === 'string' ? storedStatus : paymentStatus(event)) as PaymentIntentStatus,
      };
    }
    const [intentSnapshot, contributionSnapshot, reservationSnapshot] = await Promise.all([
      transaction.get(intentRef),
      transaction.get(contributionRef),
      transaction.get(reservationRef),
    ]);
    if (!intentSnapshot.exists || !contributionSnapshot.exists) throw new Error('Payment intent not found.');
    const intent = intentSnapshot.data()!;
    const contribution = contributionSnapshot.data()!;
    const nextStatus = paymentStatus(event);
    if (intent.provider !== event.provider) throw new Error('Provider does not match the payment intent.');
    if (intent.currency !== event.currency || intent.totalAmountMinor !== event.amountMinor) {
      throw new Error('Provider amount does not match the payment intent.');
    }
    const decision = paymentTransition(intent.status as PaymentIntentStatus, nextStatus, event.verifiedByStatusQuery === true);
    if (decision === 'duplicate' || decision === 'reject') {
      transaction.create(eventRef, {
        ...event,
        receivedAt: FieldValue.serverTimestamp(),
        outcome: decision,
      });
      return { outcome: decision === 'duplicate' ? 'duplicate' : 'rejected', status: intent.status as PaymentIntentStatus };
    }

    if (nextStatus !== 'settled') {
      transaction.create(eventRef, {
        ...event,
        receivedAt: FieldValue.serverTimestamp(),
        outcome: decision,
      });
      transaction.update(intentRef, { status: nextStatus, updatedAt: FieldValue.serverTimestamp() });
      transaction.update(contributionRef, { status: nextStatus });
      if (reservationSnapshot.exists && ['failed', 'cancelled'].includes(nextStatus)) {
        transaction.update(reservationRef, { status: 'released', updatedAt: FieldValue.serverTimestamp() });
      }
      return { outcome: 'applied', status: nextStatus };
    }

    let need: FirebaseFirestore.DocumentData | undefined;
    let needRef: FirebaseFirestore.DocumentReference | undefined;
    let raisedAmount: number | undefined;
    let excessSupport = false;
    let holdReason = 'Provider settlement arrived after the support reservation expired or capacity was no longer available.';
    let points = 0;
    if (contribution.supportNeedId) {
      needRef = adminDb.collection('supportNeeds').doc(contribution.supportNeedId);
      const needSnapshot = await transaction.get(needRef);
      need = needSnapshot.data();
      if (!needSnapshot.exists || !need) {
        excessSupport = true;
        holdReason = 'Provider settlement arrived after the support need was removed or became unavailable.';
      }
      const nextRaisedAmount = need ? (need.raisedAmount ?? 0) + intent.supportAmountMinor : 0;
      if (need && nextRaisedAmount > need.targetAmount) {
        excessSupport = true;
        holdReason = 'Provider settlement would overfund the verified support need.';
      }
      if (need && (!reservationSnapshot.exists || reservationSnapshot.data()?.status !== 'active')) {
        excessSupport = true;
        holdReason = 'Provider settlement arrived after the support reservation expired or capacity was no longer available.';
      }
      if (!excessSupport) {
        raisedAmount = nextRaisedAmount;
        const pointEvents = await transaction.get(
          adminDb.collection('pointsEvents')
            .where('userId', '==', intent.supporterUserId)
            .where('status', '==', 'confirmed')
            .where('createdAt', '>=', Timestamp.fromDate(period.weekStart)),
        );
        let dailyTotal = 0;
        let weeklyTotal = 0;
        for (const snapshot of pointEvents.docs) {
          const data = snapshot.data();
          weeklyTotal += data.points ?? 0;
          const createdAt = data.createdAt?.toDate?.() as Date | undefined;
          if (createdAt && createdAt >= period.dayStart) dailyTotal += data.points ?? 0;
        }
        points = cappedPointsAward('verified_need_supported', dailyTotal, weeklyTotal);
      }
    }
    const journal = excessSupport
      ? buildHeldContributionSettlement({
          transactionId: `ledger_${event.paymentIntentId}`,
          contributionId: event.paymentIntentId,
          supportAmountMinor: intent.supportAmountMinor,
          platformFeeMinor: intent.platformFeeMinor,
          createdAt: event.occurredAt,
        })
      : buildContributionSettlement({
          transactionId: `ledger_${event.paymentIntentId}`,
          contributionId: event.paymentIntentId,
          supportAmountMinor: intent.supportAmountMinor,
          platformFeeMinor: intent.platformFeeMinor,
          createdAt: event.occurredAt,
        });
    transaction.create(adminDb.collection('ledgerTransactions').doc(journal.transaction.id), {
      ...journal.transaction,
      createdAt: Timestamp.fromDate(occurredAt),
    });
    for (const entry of journal.entries) {
      transaction.create(adminDb.collection('ledgerEntries').doc(entry.id), {
        ...entry,
        createdAt: Timestamp.fromDate(occurredAt),
      });
    }
    transaction.update(intentRef, {
      status: 'settled',
      providerRequestReference: event.providerRequestReference,
      providerFinancialReference: event.providerFinancialReference ?? null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(contributionRef, {
      status: excessSupport ? 'held_for_review' : 'allocated',
      settledAt: Timestamp.fromDate(occurredAt),
    });
    if (reservationSnapshot.exists) {
      transaction.update(reservationRef, {
        status: excessSupport ? 'held_for_review' : 'settled',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    if (!excessSupport && needRef && need && raisedAmount !== undefined) {
      transaction.update(needRef, {
        raisedAmount,
        status: raisedAmount === need.targetAmount ? 'funded' : need.status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (!excessSupport) {
        const pointsRef = adminDb.collection('pointsEvents').doc(`support_${event.paymentIntentId}`);
        transaction.create(pointsRef, {
          id: pointsRef.id,
          userId: intent.supporterUserId,
          actionType: 'verified_need_supported',
          relatedEntityId: contribution.supportNeedId,
          points,
          idempotencyKey: `verified_need_supported:${event.paymentIntentId}`,
          status: points > 0 ? 'confirmed' : 'cap_rejected',
          periodDate: period.dateKey,
          periodWeek: period.weekKey,
          createdAt: FieldValue.serverTimestamp(),
        });
        if (points > 0) {
          transaction.update(adminDb.collection('users').doc(intent.supporterUserId), { points: FieldValue.increment(points) });
        }
      }
    }
    transaction.create(eventRef, {
      ...event,
      receivedAt: FieldValue.serverTimestamp(),
      outcome: decision,
    });
    const allocationRef = adminDb.collection('allocations').doc(`allocation_${event.paymentIntentId}`);
    transaction.create(allocationRef, {
      id: allocationRef.id,
      contributionId: event.paymentIntentId,
      recipientType: contribution.recipientType,
      recipientId: contribution.recipientId,
      supportNeedId: contribution.supportNeedId ?? null,
      campaignId: contribution.campaignId ?? null,
      amountMinor: intent.supportAmountMinor,
      currency: intent.currency,
      destinationType: need?.preferredPayoutDestination ?? null,
      status: excessSupport
        ? 'held_for_review'
        : need?.payoutDestinationStatus === 'verified'
          ? 'eligible_for_payout'
          : 'pending_review',
      createdAt: FieldValue.serverTimestamp(),
    });
    if (excessSupport) {
      const complianceRef = adminDb.collection('complianceCases').doc(`excess_${event.paymentIntentId}`);
      transaction.create(complianceRef, {
        id: complianceRef.id,
        relatedEntityType: 'contribution',
        relatedEntityId: event.paymentIntentId,
        riskTier: 'enhanced',
        reason: holdReason,
        status: 'open',
        resolutionOptions: ['refund', 'supporter_redirection'],
        createdAt: FieldValue.serverTimestamp(),
      });
      const refundRef = adminDb.collection('refunds').doc(`excess_${event.paymentIntentId}`);
      transaction.create(refundRef, {
        id: refundRef.id,
        contributionId: event.paymentIntentId,
        amountMinor: intent.totalAmountMinor,
        currency: intent.currency,
        reason: 'invalid_campaign',
        status: 'requested',
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return { outcome: 'applied', status: 'settled' };
  });
}
