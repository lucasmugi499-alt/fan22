import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { checkCorrectionRequest } from '@/lib/resultSubmission';
import { finalizeSubmission } from '@/server/resultFinalizer';
import type { AppRole, ResultSubmission } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  matchId: z.string().min(1),
  actorUserId: z.string().min(1),
  homeScore: z.number().int().min(0).max(999),
  awayScore: z.number().int().min(0).max(999),
  reason: z.string().trim().min(10).max(1500),
});

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization');
  return authorization?.startsWith('Bearer ') ? authorization.slice(7) : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const token = bearerToken(request);
  const actor = token ? await adminAuth.verifyIdToken(token).catch(() => null) : null;
  if (!actor) return Response.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'A corrected score and reason are required.' }, { status: 400 });
  const input = parsed.data;
  const { matchId } = await params;
  if (input.matchId !== matchId || input.actorUserId !== actor.uid) {
    return Response.json({ error: 'Correction attribution is invalid.' }, { status: 403 });
  }

  const submissionRef = adminDb.collection('resultSubmissions').doc(matchId);
  try {
    let version = 0;
    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(submissionRef);
      if (!snapshot.exists) throw new Error('Result submission not found.');
      const submission = { id: snapshot.id, ...snapshot.data() } as ResultSubmission;
      const leagueSnapshot = await transaction.get(adminDb.collection('leagues').doc(submission.leagueId));
      const role = typeof actor.role === 'string' ? actor.role as AppRole : 'fan';
      const isPlatform = role === 'platform_admin' || role === 'super_admin';
      const isLeagueAdmin = Array.isArray(leagueSnapshot.data()?.adminUserIds) &&
        leagueSnapshot.data()!.adminUserIds.includes(actor.uid);
      if (!isPlatform && !isLeagueAdmin) throw new Error('Only the owning League Admin can approve a correction.');
      const decision = checkCorrectionRequest({
        submission,
        reason: input.reason,
        approvedByPlatformAdmin: isPlatform,
        now: new Date().toISOString(),
      });
      if (!decision.ok) throw new Error(decision.message);

      version = submission.resultVersion + 1;
      const archivedRef = submissionRef.collection('versions').doc(String(submission.resultVersion));
      const archivedSnapshot = await transaction.get(archivedRef);
      if (!archivedSnapshot.exists) {
        transaction.create(archivedRef, {
          ...snapshot.data(),
          status: 'superseded',
          supersededAt: FieldValue.serverTimestamp(),
          supersededByVersion: version,
        });
      }
      transaction.update(submissionRef, {
        homeScore: input.homeScore,
        awayScore: input.awayScore,
        correctedHomeScore: FieldValue.delete(),
        correctedAwayScore: FieldValue.delete(),
        status: 'confirmed',
        revision: submission.revision + 1,
        resultVersion: version,
        correctionReason: input.reason,
        correctionApprovedBy: actor.uid,
        resolvedByUserId: actor.uid,
        resolution: 'league_corrected',
        finalDecisionNote: input.reason,
        finalizationKey: FieldValue.delete(),
        finalizedAt: FieldValue.delete(),
      });
      const eventRef = submissionRef.collection('events').doc();
      transaction.create(eventRef, {
        submissionId: matchId,
        from: 'official',
        to: 'confirmed',
        actor: isPlatform ? 'platform_admin' : 'league_admin',
        actorUserId: actor.uid,
        note: `Correction version ${version} approved: ${input.reason}`,
        createdAt: FieldValue.serverTimestamp(),
      });
    });
    const outcome = await finalizeSubmission(adminDb, matchId);
    if (outcome.action !== 'finalized') throw new Error(`Correction was recorded but finalization was skipped: ${outcome.reason}.`);
    return Response.json({ ok: true, version });
  } catch (error) {
    console.error('Result correction failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Result correction failed.' }, { status: 409 });
  }
}
