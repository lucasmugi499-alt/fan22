import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { buildContributionSettlement, cappedPointsAward, kampalaPeriod } from '@/lib/money';
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
    if ((await transaction.get(eventRef)).exists) return { outcome: 'duplicate', status: 'payment_pending' };
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

    const journal = buildContributionSettlement({
      transactionId: `ledger_${event.paymentIntentId}`,
      contributionId: event.paymentIntentId,
      supportAmountMinor: intent.supportAmountMinor,
      platformFeeMinor: intent.platformFeeMinor,
      createdAt: event.occurredAt,
    });
    let need: FirebaseFirestore.DocumentData | undefined;
    let needRef: FirebaseFirestore.DocumentReference | undefined;
    let raisedAmount: number | undefined;
    let points = 0;
    if (contribution.supportNeedId) {
      needRef = adminDb.collection('supportNeeds').doc(contribution.supportNeedId);
      const needSnapshot = await transaction.get(needRef);
      need = needSnapshot.data();
      if (!needSnapshot.exists || !need) throw new Error('Support need is no longer available.');
      const nextRaisedAmount = (need.raisedAmount ?? 0) + intent.supportAmountMinor;
      raisedAmount = nextRaisedAmount;
      if (nextRaisedAmount > need.targetAmount) throw new Error('Settled support exceeds the approved support-need target.');
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
      providerReference: event.providerReference,
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(contributionRef, {
      status: 'allocated',
      settledAt: Timestamp.fromDate(occurredAt),
    });
    if (reservationSnapshot.exists) {
      transaction.update(reservationRef, { status: 'settled', updatedAt: FieldValue.serverTimestamp() });
    }
    if (needRef && need && raisedAmount !== undefined) {
      transaction.update(needRef, {
        raisedAmount,
        status: raisedAmount === need.targetAmount ? 'funded' : need.status,
        updatedAt: FieldValue.serverTimestamp(),
      });
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
      amountMinor: intent.supportAmountMinor,
      currency: intent.currency,
      destinationType: need?.preferredPayoutDestination ?? null,
      status: need?.payoutDestinationStatus === 'verified' ? 'eligible_for_payout' : 'pending_review',
      createdAt: FieldValue.serverTimestamp(),
    });
    return { outcome: 'applied', status: 'settled' };
  });
}
