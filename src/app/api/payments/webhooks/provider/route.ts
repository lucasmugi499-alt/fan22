import { createHmac, timingSafeEqual } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import {
  buildContributionSettlement,
  cappedPointsAward,
} from '@/lib/money';

export const runtime = 'nodejs';

const eventSchema = z.object({
  eventId: z.string().min(1),
  paymentIntentId: z.string().min(1),
  status: z.enum(['settled', 'failed', 'held_for_review']),
  amountMinor: z.number().int().positive(),
  currency: z.literal('UGX'),
  occurredAt: z.string().datetime(),
  providerReference: z.string().min(1),
});

function validSignature(rawBody: string, supplied: string | null) {
  const secret = process.env.GOALPLACE_PAYMENT_WEBHOOK_SECRET;
  if (!secret || !supplied) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > 64 * 1024) {
    return Response.json({ error: 'Webhook payload is too large.' }, { status: 413 });
  }
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, 'utf8') > 64 * 1024) {
    return Response.json({ error: 'Webhook payload is too large.' }, { status: 413 });
  }
  if (!validSignature(rawBody, request.headers.get('x-goalplace-signature'))) {
    return Response.json({ error: 'Invalid webhook signature.' }, { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: 'Invalid webhook JSON.' }, { status: 400 });
  }
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success) return Response.json({ error: 'Invalid webhook event.' }, { status: 400 });
  const event = parsed.data;
  if (Math.abs(Date.now() - new Date(event.occurredAt).getTime()) > 5 * 60 * 1000) {
    return Response.json({ error: 'Webhook timestamp is outside the accepted window.' }, { status: 400 });
  }

  try {
    const eventRef = adminDb.collection('paymentWebhookEvents').doc(event.eventId);
    const intentRef = adminDb.collection('paymentIntents').doc(event.paymentIntentId);
    const contributionRef = adminDb.collection('contributions').doc(event.paymentIntentId);
    await adminDb.runTransaction(async (transaction) => {
      if ((await transaction.get(eventRef)).exists) return;
      const intentSnapshot = await transaction.get(intentRef);
      const contributionSnapshot = await transaction.get(contributionRef);
      if (!intentSnapshot.exists || !contributionSnapshot.exists) throw new Error('Payment intent not found.');
      const intent = intentSnapshot.data()!;
      const contribution = contributionSnapshot.data()!;
      if (intent.currency !== event.currency || intent.totalAmountMinor !== event.amountMinor) {
        throw new Error('Webhook amount does not match the payment intent.');
      }
      let needRef: FirebaseFirestore.DocumentReference | undefined;
      let need: FirebaseFirestore.DocumentData | undefined;
      let pointsAward = 0;
      if (event.status === 'settled' && contribution.supportNeedId) {
        needRef = adminDb.collection('supportNeeds').doc(contribution.supportNeedId);
        const needSnapshot = await transaction.get(needRef);
        need = needSnapshot.data();
        const occurredAt = new Date(event.occurredAt);
        const weekStart = new Date(occurredAt);
        weekStart.setUTCDate(occurredAt.getUTCDate() - occurredAt.getUTCDay());
        weekStart.setUTCHours(0, 0, 0, 0);
        const dayStart = new Date(occurredAt);
        dayStart.setUTCHours(0, 0, 0, 0);
        const pointEvents = await transaction.get(
          adminDb.collection('pointsEvents')
            .where('userId', '==', intent.supporterUserId)
            .where('status', '==', 'confirmed')
            .where('createdAt', '>=', Timestamp.fromDate(weekStart)),
        );
        let dailyTotal = 0;
        let weeklyTotal = 0;
        for (const pointEvent of pointEvents.docs) {
          const data = pointEvent.data();
          const createdAt = data.createdAt?.toDate?.() as Date | undefined;
          weeklyTotal += data.points ?? 0;
          if (createdAt && createdAt >= dayStart) dailyTotal += data.points ?? 0;
        }
        pointsAward = cappedPointsAward(
          'verified_need_supported',
          dailyTotal,
          weeklyTotal,
        );
      }
      transaction.create(eventRef, {
        ...event,
        receivedAt: FieldValue.serverTimestamp(),
      });
      if (event.status !== 'settled') {
        transaction.update(intentRef, { status: event.status, updatedAt: FieldValue.serverTimestamp() });
        transaction.update(contributionRef, { status: event.status });
        return;
      }
      if (intent.status === 'settled') return;
      const now = event.occurredAt;
      const journal = buildContributionSettlement({
        transactionId: `ledger_${event.paymentIntentId}`,
        contributionId: event.paymentIntentId,
        supportAmountMinor: intent.supportAmountMinor,
        platformFeeMinor: intent.platformFeeMinor,
        createdAt: now,
      });
      transaction.create(adminDb.collection('ledgerTransactions').doc(journal.transaction.id), {
        ...journal.transaction,
        createdAt: Timestamp.fromDate(new Date(now)),
      });
      for (const entry of journal.entries) {
        transaction.create(adminDb.collection('ledgerEntries').doc(entry.id), {
          ...entry,
          createdAt: Timestamp.fromDate(new Date(now)),
        });
      }
      transaction.update(intentRef, {
        status: 'settled',
        providerReference: event.providerReference,
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.update(contributionRef, {
        status: 'allocated',
        settledAt: Timestamp.fromDate(new Date(now)),
      });
      if (contribution.supportNeedId) {
        if (needRef && need) {
          const raisedAmount = Math.min(need.targetAmount, (need.raisedAmount ?? 0) + intent.supportAmountMinor);
          transaction.update(needRef, {
            raisedAmount,
            status: raisedAmount >= need.targetAmount ? 'funded' : need.status,
            updatedAt: FieldValue.serverTimestamp(),
          });
        }
        if (pointsAward > 0) {
          const pointsRef = adminDb.collection('pointsEvents').doc(`support_${event.paymentIntentId}`);
          transaction.create(pointsRef, {
            id: pointsRef.id,
            userId: intent.supporterUserId,
            actionType: 'verified_need_supported',
            relatedEntityId: contribution.supportNeedId,
            points: pointsAward,
            idempotencyKey: `verified_need_supported:${event.paymentIntentId}`,
            status: 'confirmed',
            createdAt: FieldValue.serverTimestamp(),
          });
        }
      }
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
        status: need?.payoutDestinationStatus === 'verified'
          ? 'eligible_for_payout'
          : 'pending_review',
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Payment webhook processing failed', error);
    return Response.json({ error: 'Webhook processing failed.' }, { status: 500 });
  }
}
