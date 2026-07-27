import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import type { AppRole, SupportNeed } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  supportNeedId: z.string().min(1),
  actorUserId: z.string().min(1),
  note: z.string().trim().min(10).max(1500),
});

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ supportNeedId: string }> },
) {
  const token = bearerToken(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (!actor) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Completion evidence review is incomplete.' }, { status: 400 });
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
