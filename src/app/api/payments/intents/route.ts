import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { contributionQuote, requiresEnhancedReview } from '@/lib/money';

export const runtime = 'nodejs';

const intentSchema = z.object({
  supporterUserId: z.string().min(1),
  purpose: z.enum([
    'direct_athlete_support',
    'verified_support_need',
    'team_development',
    'league_development',
    'sponsor_grant',
  ]),
  recipientType: z.enum(['athlete', 'team', 'league', 'programme']),
  recipientId: z.string().min(1),
  supportNeedId: z.string().min(1).optional(),
  supportAmountMinor: z.number().int().positive(),
  message: z.string().max(240).optional(),
  idempotencyKey: z.string().min(12).max(160),
});

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function POST(request: Request) {
  if (process.env.GOALPLACE_PAYMENTS_MODE !== 'sandbox' || !process.env.GOALPLACE_PAYMENT_PROVIDER) {
    return Response.json({
      error: 'Real payments are disabled until a licensed PSP and legal approval are configured.',
    }, { status: 503 });
  }
  const token = bearerToken(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (!actor) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  if (actor.email_verified !== true) {
    return Response.json({ error: 'Verify your email address before supporting a recipient.' }, { status: 403 });
  }
  const parsed = intentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid contribution request.' }, { status: 400 });
  const input = parsed.data;
  if (input.supporterUserId !== actor.uid) {
    return Response.json({ error: 'The supporter must be the signed-in account.' }, { status: 403 });
  }

  try {
    const actorRole = typeof actor.role === 'string' ? actor.role : 'fan';
    const isPlatform = actorRole === 'platform_admin' || actorRole === 'super_admin';
    const directPurposeRecipient: Partial<Record<typeof input.purpose, typeof input.recipientType>> = {
      direct_athlete_support: 'athlete',
      team_development: 'team',
      league_development: 'league',
    };
    const requiredRecipientType = directPurposeRecipient[input.purpose];
    if (requiredRecipientType && input.recipientType !== requiredRecipientType) {
      return Response.json({ error: 'Contribution purpose and recipient type do not match.' }, { status: 409 });
    }
    if (input.purpose === 'verified_support_need' && !input.supportNeedId) {
      return Response.json({ error: 'A verified support need is required for this contribution.' }, { status: 409 });
    }
    if (input.purpose !== 'verified_support_need' && input.supportNeedId) {
      return Response.json({ error: 'Support-need contributions must use the verified support need purpose.' }, { status: 409 });
    }
    if (input.purpose === 'sponsor_grant' && !isPlatform) {
      return Response.json({ error: 'Sponsor grants require Platform review.' }, { status: 403 });
    }

    let verifiedRecipientType = input.recipientType;
    if (input.supportNeedId) {
      const need = await adminDb.collection('supportNeeds').doc(input.supportNeedId).get();
      const data = need.data();
      if (
        !need.exists ||
        data?.status !== 'open' ||
        data?.verificationStatus !== 'verified' ||
        data?.approvalStatus !== 'league_approved'
      ) {
        return Response.json({ error: 'This support need is not open and verified.' }, { status: 409 });
      }
      const expectedRecipientId = data.athleteId ?? data.teamId ?? data.leagueId;
      if (expectedRecipientId !== input.recipientId) {
        return Response.json({ error: 'Support recipient does not match the verified need.' }, { status: 409 });
      }
      verifiedRecipientType = data.athleteId ? 'athlete' : data.teamId ? 'team' : 'league';
      if (verifiedRecipientType !== input.recipientType) {
        return Response.json({ error: 'Support recipient type does not match the verified need.' }, { status: 409 });
      }
    }

    const recipientCollection = {
      athlete: 'athletes',
      team: 'teams',
      league: 'leagues',
      programme: 'programmes',
    }[verifiedRecipientType];
    const recipient = await adminDb.collection(recipientCollection).doc(input.recipientId).get();
    if (!recipient.exists) {
      return Response.json({ error: 'The selected support recipient is not verified on GoalPlace256.' }, { status: 404 });
    }

    const quote = contributionQuote(input.supportAmountMinor);
    const moneyFields = {
      supportAmountMinor: quote.supportAmountMinor,
      platformFeeMinor: quote.platformFeeMinor,
      providerFeeMinor: quote.providerFeeMinor,
      totalAmountMinor: quote.totalAmountMinor,
      currency: quote.currency,
    };
    const intentId = `pi_${Buffer.from(input.idempotencyKey).toString('base64url').slice(0, 48)}`;
    const intentRef = adminDb.collection('paymentIntents').doc(intentId);
    const contributionRef = adminDb.collection('contributions').doc(intentId);
    const complianceRef = adminDb.collection('complianceCases').doc(`payment_${intentId}`);
    const riskTier = requiresEnhancedReview(input.supportAmountMinor);

    const persistedStatus = await adminDb.runTransaction(async (transaction) => {
      const existing = await transaction.get(intentRef);
      if (existing.exists) {
        const previous = existing.data()!;
        const sameRequest = [
          'supporterUserId',
          'purpose',
          'recipientType',
          'recipientId',
          'supportNeedId',
          'supportAmountMinor',
        ].every((field) => (previous[field] ?? null) === (input[field as keyof typeof input] ?? null));
        if (!sameRequest) {
          throw new Error('This idempotency key was already used for a different contribution.');
        }
        return previous.status as string;
      }
      const status = riskTier === 'high_value' ? 'held_for_review' : 'payment_pending';
      transaction.create(intentRef, {
        id: intentId,
        ...input,
        ...moneyFields,
        provider: process.env.GOALPLACE_PAYMENT_PROVIDER,
        status,
        riskTier,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.create(contributionRef, {
        id: intentId,
        paymentIntentId: intentId,
        ...input,
        ...moneyFields,
        status,
        createdAt: FieldValue.serverTimestamp(),
      });
      if (riskTier === 'enhanced' || riskTier === 'high_value') {
        transaction.create(complianceRef, {
          id: complianceRef.id,
          relatedEntityType: 'payment_intent',
          relatedEntityId: intentId,
          riskTier,
          reason: riskTier === 'high_value'
            ? 'High-value contribution requires enhanced due diligence and source/purpose review.'
            : 'Enhanced contribution requires evidence and payout review.',
          status: 'open',
          createdAt: FieldValue.serverTimestamp(),
        });
      }
      return status;
    });

    return Response.json({
      id: intentId,
      status: persistedStatus,
      provider: process.env.GOALPLACE_PAYMENT_PROVIDER,
      quote,
    });
  } catch (error) {
    console.error('Payment intent creation failed', error);
    return Response.json({ error: 'The payment provider request could not be prepared.' }, { status: 500 });
  }
}
