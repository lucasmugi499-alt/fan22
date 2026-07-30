import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { contributionQuote, requiresEnhancedReview } from '@/lib/money';
import { paymentProviderFromEnvironment, providerCallbackUrl, PaymentProviderConfigurationError } from '@/server/payments/providers';
import { recordProviderAttempt } from '@/server/payments/providerAttempts';
import { checkoutRequestMatches, paymentIntentIdFor } from '@/server/payments/intentIdentity';
import { parseJsonBody, requireAuthenticatedUser } from '@/server/api/security';

export const runtime = 'nodejs';

const intentSchema = z.object({
  supporterUserId: z.string().min(1),
  purpose: z.enum(['direct_athlete_support', 'verified_support_need', 'team_development', 'league_development', 'sponsor_grant']),
  recipientType: z.enum(['athlete', 'team', 'league', 'programme']),
  recipientId: z.string().min(1),
  supportNeedId: z.string().min(1).optional(),
  campaignId: z.string().min(1).optional(),
  supportAmountMinor: z.number().int().positive(),
  message: z.string().max(240).optional(),
  customerPhone: z.string().regex(/^256\d{9}$/, 'Use an Uganda number in 2567XXXXXXXX format.').optional(),
  provider: z.enum(['airtel_money', 'mtn_momo']),
  idempotencyKey: z.string().min(12).max(160),
});

function recipientCollection(type: 'athlete' | 'team' | 'league' | 'programme') {
  return { athlete: 'athletes', team: 'teams', league: 'leagues', programme: 'programmes' }[type];
}

function isLinkedRecipient(recipient: FirebaseFirestore.DocumentData, recipientType: string, uid: string) {
  return recipient.userId === uid ||
    (recipientType === 'team' && Array.isArray(recipient.adminUserIds) && recipient.adminUserIds.includes(uid)) ||
    (recipientType === 'league' && Array.isArray(recipient.adminUserIds) && recipient.adminUserIds.includes(uid));
}

export async function POST(request: Request) {
  if (process.env.GOALPLACE_PAYMENTS_MODE !== 'sandbox') {
    return Response.json({ error: 'Payments remain sandbox-only until legal and PSP launch gates are complete.' }, { status: 503 });
  }
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const actor = auth.actor;
  if (actor.email_verified !== true) return Response.json({ error: 'Verify your email address before supporting a recipient.' }, { status: 403 });
  const parsed = await parseJsonBody(request, intentSchema, { maxBytes: 12 * 1024 });
  if ('response' in parsed) return Response.json({ error: 'Invalid contribution request.' }, { status: parsed.response.status });
  const input = parsed.data;
  if (input.supporterUserId !== actor.uid) return Response.json({ error: 'The supporter must be the signed-in account.' }, { status: 403 });

  try {
    const provider = paymentProviderFromEnvironment(input.provider);
    const actorRole = typeof actor.role === 'string' ? actor.role : 'fan';
    const isPlatform = actorRole === 'platform_admin' || actorRole === 'super_admin';
    const requiredRecipients: Partial<Record<typeof input.purpose, typeof input.recipientType>> = {
      direct_athlete_support: 'athlete',
      team_development: 'team',
      league_development: 'league',
    };
    const requiredRecipient = requiredRecipients[input.purpose];
    if (requiredRecipient && input.recipientType !== requiredRecipient) {
      return Response.json({ error: 'Contribution purpose and recipient type do not match.' }, { status: 409 });
    }
    if (input.purpose === 'verified_support_need' !== Boolean(input.supportNeedId)) {
      return Response.json({ error: 'Only verified support needs may be linked to support-need contributions.' }, { status: 409 });
    }
    if (input.purpose === 'sponsor_grant' && !isPlatform) return Response.json({ error: 'Sponsor grants require Platform review.' }, { status: 403 });
    if ((input.purpose === 'sponsor_grant') !== Boolean(input.campaignId)) {
      return Response.json({ error: 'Sponsor grants must be attributed to one approved campaign.' }, { status: 409 });
    }
    if (provider.name !== 'sandbox' && !input.customerPhone) {
      return Response.json({ error: 'A mobile-money number is required for this provider prompt.' }, { status: 400 });
    }

    let supportNeed: FirebaseFirestore.DocumentData | undefined;
    let effectiveRecipientType = input.recipientType;
    if (input.supportNeedId) {
      const supportNeedSnapshot = await adminDb.collection('supportNeeds').doc(input.supportNeedId).get();
      supportNeed = supportNeedSnapshot.data();
      if (!supportNeedSnapshot.exists || !supportNeed || supportNeed.status !== 'open' || supportNeed.verificationStatus !== 'verified' || supportNeed.approvalStatus !== 'league_approved') {
        return Response.json({ error: 'This support need is not open and verified.' }, { status: 409 });
      }
      const expectedRecipientId = supportNeed.athleteId ?? supportNeed.teamId ?? supportNeed.leagueId;
      effectiveRecipientType = supportNeed.athleteId ? 'athlete' : supportNeed.teamId ? 'team' : 'league';
      if (expectedRecipientId !== input.recipientId || effectiveRecipientType !== input.recipientType) {
        return Response.json({ error: 'Support recipient does not match the verified need.' }, { status: 409 });
      }
    }

    const recipientSnapshot = await adminDb.collection(recipientCollection(effectiveRecipientType)).doc(input.recipientId).get();
    if (!recipientSnapshot.exists) return Response.json({ error: 'The selected support recipient was not found.' }, { status: 404 });
    const recipient = recipientSnapshot.data()!;
    if (isLinkedRecipient(recipient, effectiveRecipientType, actor.uid)) {
      return Response.json({ error: 'You cannot support a recipient account you control. Contact support for an exception review.' }, { status: 409 });
    }
    const eligibility = await adminDb.collection('recipientEligibility').doc(`${effectiveRecipientType}_${input.recipientId}`).get();
    const eligibilityData = eligibility.data();
    if (!eligibilityData || eligibilityData.status !== 'eligible' || eligibilityData.verified !== true || eligibilityData.supportEnabled !== true || eligibilityData.complianceHold === true || eligibilityData.payoutDestinationStatus !== 'verified' || (eligibilityData.recipientIsMinor === true && eligibilityData.guardianConsentVerified !== true)) {
      return Response.json({ error: 'This recipient is not yet eligible to receive support.' }, { status: 409 });
    }
    if (supportNeed && (supportNeed.payoutDestinationStatus !== 'verified' || (supportNeed.recipientIsMinor === true && supportNeed.guardianConsentVerified !== true))) {
      return Response.json({ error: 'This support need is waiting for payout-destination or guardian verification.' }, { status: 409 });
    }

    const quote = contributionQuote(input.supportAmountMinor);
    if (
      provider.name === 'mtn_momo'
      && (process.env.GOALPLACE_MTN_MOMO_CURRENCY ?? 'EUR') !== quote.currency
    ) {
      return Response.json({
        error: 'This MTN sandbox profile uses a different test currency. It is isolated from UGX reporting until a Uganda UGX sandbox profile is configured.',
      }, { status: 503 });
    }
    const intentId = paymentIntentIdFor(input.idempotencyKey);
    const intentRef = adminDb.collection('paymentIntents').doc(intentId);
    const contributionRef = adminDb.collection('contributions').doc(intentId);
    const reservationRef = adminDb.collection('supportReservations').doc(intentId);
    const supportNeedRef = input.supportNeedId
      ? adminDb.collection('supportNeeds').doc(input.supportNeedId)
      : null;
    const complianceRef = adminDb.collection('complianceCases').doc(`payment_${intentId}`);
    const riskTier = requiresEnhancedReview(input.supportAmountMinor);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60_000);

    const persisted = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(intentRef);
      if (existing.exists) {
        const previous = existing.data()!;
        const sameRequest = checkoutRequestMatches(previous, input);
        if (!sameRequest) throw new Error('This checkout session was already used for a different contribution.');
        return {
          created: false,
          status: previous.status as string,
          providerRequestReference: (previous.providerRequestReference ?? previous.providerReference) as string | undefined,
          shouldCreateProviderRequest:
            previous.status === 'payment_pending'
            && !previous.providerRequestReference
            && !previous.providerReference,
        };
      }
      if (supportNeedRef && input.supportNeedId) {
        const currentNeedSnapshot = await transaction.get(supportNeedRef);
        const currentNeed = currentNeedSnapshot.data();
        if (!currentNeedSnapshot.exists || !currentNeed || currentNeed.status !== 'open' || currentNeed.verificationStatus !== 'verified' || currentNeed.approvalStatus !== 'league_approved') {
          throw new Error('This support need changed before the contribution could be reserved.');
        }
        const activeReservations = await transaction.get(
          adminDb.collection('supportReservations')
            .where('supportNeedId', '==', input.supportNeedId)
            .where('status', '==', 'active'),
        );
        let reserved = 0;
        for (const reservation of activeReservations.docs) {
          const data = reservation.data();
          const until = data.expiresAt?.toDate?.() as Date | undefined;
          if (until && until <= now) transaction.update(reservation.ref, { status: 'expired', updatedAt: FieldValue.serverTimestamp() });
          else reserved += data.amountMinor ?? 0;
        }
        const remaining = currentNeed.targetAmount - currentNeed.raisedAmount - reserved;
        if (input.supportAmountMinor > remaining) throw new Error(`Only UGX ${Math.max(0, remaining).toLocaleString()} remains for this verified need.`);
        transaction.create(reservationRef, {
          id: reservationRef.id,
          supportNeedId: input.supportNeedId,
          paymentIntentId: intentId,
          supporterUserId: actor.uid,
          amountMinor: input.supportAmountMinor,
          currency: 'UGX',
          status: 'active',
          expiresAt: Timestamp.fromDate(expiresAt),
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      const status = riskTier === 'high_value' ? 'held_for_review' : 'payment_pending';
      const { customerPhone, ...storedInput } = input;
      void customerPhone;
      transaction.create(intentRef, {
        id: intentId,
        ...storedInput,
        ...quote,
        provider: provider.name,
        status,
        riskTier,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(contributionRef, {
        id: intentId,
        paymentIntentId: intentId,
        ...storedInput,
        ...quote,
        status,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (riskTier === 'enhanced' || riskTier === 'high_value') {
        transaction.create(complianceRef, {
          id: complianceRef.id,
          relatedEntityType: 'payment_intent',
          relatedEntityId: intentId,
          riskTier,
          reason: riskTier === 'high_value' ? 'High-value contribution requires enhanced due diligence and source/purpose review.' : 'Enhanced contribution requires evidence and payout review.',
          status: 'open',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return {
        created: true,
        status,
        providerRequestReference: undefined,
        shouldCreateProviderRequest: status === 'payment_pending',
      };
    });

    if (!persisted.shouldCreateProviderRequest || persisted.status === 'held_for_review') {
      return Response.json({
        id: intentId,
        status: persisted.status,
        provider: provider.name,
        providerRequestReference: persisted.providerRequestReference,
        quote,
      });
    }
    try {
      const operation = await provider.createCollection({
        paymentIntentId: intentId,
        amountMinor: quote.totalAmountMinor,
        currency: quote.currency,
        customerPhone: input.customerPhone ?? '256700000000',
        callbackUrl: providerCallbackUrl(provider.name),
        idempotencyKey: input.idempotencyKey,
        description: `GoalPlace256 support ${intentId}`,
      });
      await adminDb.runTransaction(async (transaction) => {
        transaction.update(intentRef, {
          status: operation.status,
          providerRequestReference: operation.providerRequestReference,
          providerFinancialReference: operation.providerFinancialReference ?? null,
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(contributionRef, { status: operation.status });
      });
      await recordProviderAttempt({
        paymentIntentId: intentId,
        provider: provider.name,
        operation: 'collection_create',
        result: operation,
        responseStatus: operation.status,
      }).catch((auditError) => {
        console.error('Provider request succeeded but attempt audit failed', auditError);
      });
      return Response.json({
        id: intentId,
        status: operation.status,
        provider: provider.name,
        providerRequestReference: operation.providerRequestReference,
        providerFinancialReference: operation.providerFinancialReference,
        quote,
        nextStep: operation.customerMessage,
      });
    } catch (error) {
      await adminDb.runTransaction(async (transaction) => {
        transaction.update(intentRef, {
          status: 'payment_pending',
          lastProviderErrorAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(contributionRef, { status: 'payment_pending' });
      });
      await recordProviderAttempt({
        paymentIntentId: intentId,
        provider: provider.name,
        operation: 'collection_create',
        responseStatus: 'failed',
        error,
      }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    console.error('Payment intent creation failed', error);
    const message = error instanceof Error ? error.message : 'The payment provider request could not be prepared.';
    return Response.json({ error: message }, { status: error instanceof PaymentProviderConfigurationError ? 503 : 409 });
  }
}
