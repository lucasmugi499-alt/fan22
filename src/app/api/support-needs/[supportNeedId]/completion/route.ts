import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import type { AppRole, SupportNeed } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  supportNeedId: z.string().trim().min(1).max(180),
  actorUserId: z.string().trim().min(1).max(180),
  note: z.string().trim().min(10).max(1500),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ supportNeedId: string }> },
) {
  const guarded = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'Completion evidence review is incomplete.',
    rateLimit: { bucket: 'support_completion', limit: 20, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;
  const actor = guarded.actor;
  const parsed = { data: guarded.data };
  const input = parsed.data;
  const { supportNeedId } = await params;
  if (input.supportNeedId !== supportNeedId || input.actorUserId !== actor.uid) {
    return Response.json({ error: 'Completion attribution is invalid.' }, { status: 403 });
  }

  const needRef = adminDb.collection('supportNeeds').doc(supportNeedId);
  try {
    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(needRef);
      if (!snapshot.exists) throw new Error('Support need not found.');
      const need = { id: snapshot.id, ...snapshot.data() } as SupportNeed;
      const leagueSnapshot = await transaction.get(adminDb.collection('leagues').doc(need.leagueId));
      const role = typeof actor.role === 'string' ? actor.role as AppRole : 'fan';
      const isPlatform = role === 'platform_admin' || role === 'super_admin';
      const isLeagueAdmin = Array.isArray(leagueSnapshot.data()?.adminUserIds) &&
        leagueSnapshot.data()!.adminUserIds.includes(actor.uid);
      if (!isPlatform && !isLeagueAdmin) {
        throw new Error('Only the owning League Admin can verify completion.');
      }
      if (need.createdByUserId === actor.uid || need.teamVerifiedByUserId === actor.uid) {
        throw new Error('Completion requires an independent reviewer.');
      }
      if (need.status !== 'funded') throw new Error('Only a fully funded need can be completed.');
      if (need.approvalStatus !== 'league_approved' || need.verificationStatus !== 'verified') {
        throw new Error('The need is not approved for completion.');
      }
      if (!need.recipientUpdates?.some((update) => Boolean(update.evidenceUrl))) {
        throw new Error('The recipient must submit completion evidence first.');
      }
      const allocations = await transaction.get(
        adminDb.collection('allocations').where('supportNeedId', '==', supportNeedId),
      );
      const paidAmount = allocations.docs
        .filter((allocation) => allocation.data().status === 'paid')
        .reduce((sum, allocation) => sum + (allocation.data().amountMinor ?? 0), 0);
      if (paidAmount < need.targetAmount) {
        throw new Error('Completion requires a recorded recipient payout or approved vendor payment.');
      }

      transaction.update(needRef, {
        status: 'completed',
        updatedAt: FieldValue.serverTimestamp(),
      });
      const completionRef = adminDb.collection('supportNeedCompletions').doc();
      transaction.create(completionRef, {
        id: completionRef.id,
        supportNeedId,
        athleteId: need.athleteId ?? null,
        teamId: need.teamId ?? null,
        leagueId: need.leagueId,
        verifiedByUserId: actor.uid,
        note: input.note,
        evidenceRefs: need.recipientUpdates
          .map((update) => update.evidenceUrl)
          .filter(Boolean),
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    return Response.json({ ok: true, status: 'completed' });
  } catch (error) {
    console.error('Support need completion failed', error);
    return Response.json({
      error: error instanceof Error ? error.message : 'Support need completion failed.',
    }, { status: 409 });
  }
}
