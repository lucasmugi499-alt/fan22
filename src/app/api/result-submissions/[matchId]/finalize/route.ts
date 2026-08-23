import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { canRequestTrustedFinalization } from '@/lib/resultSubmission';
import { finalizeSubmission } from '@/server/resultFinalizer';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { jsonError, requireAuthenticatedMutation } from '@/server/api/security';
import type { ResultSubmission } from '@/types';
import { activationFromEnvironment } from '@/server/finalizerActivation';

export const runtime = 'nodejs';

/**
 * Manual trusted finalization.
 *
 * This route used to hand-roll its own authentication: a private bearer helper and a bare
 * `verifyIdToken(token)` with no revocation check, no App Check, no rate limit and no active
 * principal check. It was a weaker ingress into the most expensive operation the platform
 * performs — a suspended operator's unexpired token still worked here, and nothing stopped a
 * compromised session hammering an idempotent-but-costly officialization path. Idempotent
 * means no duplicate official data; it does not mean free.
 *
 * It now goes through the same mutation boundary as every other write. The body is empty by
 * design — the match is in the path — but it travels through the shared wrapper so the
 * wrapper's guarantees apply.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const guarded = await requireAuthenticatedMutation(request, z.object({}).strict(), {
    maxBytes: 1024,
    invalidBodyError: 'Finalization takes no request body.',
    // Deliberately tight. Finalization reads a submission, plans events and opens a
    // transaction; repeating it is expensive whether or not it changes anything.
    rateLimit: { bucket: 'result_finalization', limit: 20, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;
  const { actor } = guarded;

  try {
    const { matchId } = await params;
    const snapshot = await adminDb.collection('resultSubmissions').doc(matchId).get();
    if (!snapshot.exists) return jsonError('Result submission not found.', 404);

    const submission = { id: snapshot.id, ...snapshot.data() } as ResultSubmission;

    /**
     * Either the person who settled this result, or someone holding the capability to
     * resolve results for its league.
     *
     * The second half replaces the role check that used to live inside
     * `canRequestTrustedFinalization`. A platform operator reaches it through the
     * platform-global grant rather than by being exempt from the question.
     */
    const settledByActor = canRequestTrustedFinalization(submission, { uid: actor.uid });
    const authorized = settledByActor || await hasCapabilityOrPlatformGrant(
      actor.uid,
      { scopeType: 'league', scopeId: String(submission.leagueId ?? '') },
      'league.result.resolve',
    );
    if (!authorized) {
      return jsonError('You did not settle this result submission.', 403);
    }

    if (submission.status === 'official') {
      return Response.json({ action: 'skipped', reason: 'already_finalized' });
    }
    if (submission.status !== 'confirmed') {
      return jsonError('This result is not ready for finalization.', 409);
    }

    return Response.json(await finalizeSubmission(adminDb, matchId, activationFromEnvironment()));
  } catch (error) {
    console.error('Trusted result finalization failed', error);
    return jsonError('GoalPlace256 could not finalize this result.', 500);
  }
}
