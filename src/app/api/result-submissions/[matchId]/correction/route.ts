import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { checkCorrectionRequest } from '@/lib/resultSubmission';
import { finalizeSubmission } from '@/server/resultFinalizer';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapability } from '@/server/access/capabilities';
import type { AppRole, ResultSubmission } from '@/types';
import { activationFromEnvironment } from '@/server/finalizerActivation';
import { openResultCase } from '@/server/results/openResultCase';

export const runtime = 'nodejs';

const requestSchema = z.object({
  action: z.literal('request'),
  matchId: z.string().trim().min(1).max(180),
  actorUserId: z.string().trim().min(1).max(180),
  reason: z.string().trim().min(10).max(1500),
});

const approvalSchema = z.object({
  action: z.literal('approve').optional(),
  matchId: z.string().trim().min(1).max(180),
  actorUserId: z.string().trim().min(1).max(180),
  homeScore: z.number().int().min(0).max(999),
  awayScore: z.number().int().min(0).max(999),
  reason: z.string().trim().min(10).max(1500),
});
const bodySchema = z.union([requestSchema, approvalSchema]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  // A correction supersedes an official sporting record; repeated attempts are bounded.
  const guarded = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'A corrected score and reason are required.',
    rateLimit: { bucket: 'result_correction', limit: 15, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;
  const actor = guarded.actor;
  const parsed = { data: guarded.data };
  const input = parsed.data;
  const { matchId } = await params;
  if (input.matchId !== matchId || input.actorUserId !== actor.uid) {
    return Response.json({ error: 'Correction attribution is invalid.' }, { status: 403 });
  }

  const submissionRef = adminDb.collection('resultSubmissions').doc(matchId);
  try {
    if (input.action === 'request') {
      /**
       * The legacy address, opening a case in the unified model.
       *
       * This used to write correction fields onto `resultSubmissions/{matchId}` — which is why
       * a result that became official through V2 field capture could not be corrected at all:
       * there is no such document for it, so the platform's own primary intake produced results
       * the product had no way to challenge.
       *
       * Two correction systems would have been the same disease with more code, so this is a
       * door into the same room rather than a second room. Older bundles keep working and land
       * on a `resultCase` exactly as a current client does.
       *
       * The one thing a legacy caller loses is the stale-page check: it cannot name the version
       * it is challenging, so the opener defaults to the match's current one.
       */
      const opened = await openResultCase({
        db: adminDb,
        matchId,
        actorUid: actor.uid,
        reason: input.reason,
      });
      if (!opened.ok) return Response.json({ error: opened.error }, { status: opened.status });
      return Response.json({ ok: true, requested: true, caseId: opened.caseId });
    }

    let version = 0;
    await adminDb.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(submissionRef);
      if (!snapshot.exists) throw new Error('Result submission not found.');
      const submission = { id: snapshot.id, ...snapshot.data() } as ResultSubmission;
      // Approving a correction rewrites an official sporting result, so the platform side
      // has to hold the platform operating grant rather than merely carry the role.
      const isPlatform = await hasCapability(
        actor.uid,
        { scopeType: 'platform', scopeId: 'global' },
        'platform.admin.manage',
      );
      // The league's result-resolution capability on this exact league, not membership.
      const isLeagueAdmin = await hasCapability(
        actor.uid,
        { scopeType: 'league', scopeId: submission.leagueId },
        'league.result.resolve',
      );
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
    const outcome = await finalizeSubmission(adminDb, matchId, activationFromEnvironment());
    if (outcome.action === 'blocked') {
      // A correction is the intended way out of a reconciliation block, so it can land on
      // one: the corrected score may still contradict the recorded events. Saying
      // "skipped" here would describe a governed, recorded outcome as a no-op.
      throw new Error(
        'The corrected result still contradicts the recorded scoring events, so it was not '
        + 'made official. The league review case has been updated.',
      );
    }
    if (outcome.action !== 'finalized') throw new Error(`Correction was recorded but finalization was skipped: ${outcome.reason}.`);
    return Response.json({ ok: true, version });
  } catch (error) {
    console.error('Result correction failed', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Result correction failed.' }, { status: 409 });
  }
}
