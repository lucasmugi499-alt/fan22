import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { checkTransition } from '@/lib/resultSubmission';
import { checkScorePlausibility } from '@/kernel/validators/scorePlausibility';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { platformAuditEvent, refuse, secureLeagueCommand } from '@/server/platform/commands/securePlatformCommand';
import type { ResultSubmission, ResultSubmissionStatus } from '@/types';

export const runtime = 'nodejs';

/**
 * A league settling a V1 result claim — upheld, corrected, or rejected.
 *
 * ## Why this route exists
 *
 * The V1 claim-and-confirm workflow is retired (ADR-004) and no club can open a new claim.
 * But the claims that were open when it was retired are still open, and the only way to
 * settle one was a Firestore transaction run in the League Admin's browser, permitted by a
 * rule for anyone holding league authority, with no command, no reason and no audit event.
 * The finalizer then made whatever it wrote official. That was a second door to the official
 * record, standing beside the one the platform actually governs.
 *
 * This is the same decision — the same transition rules, the same fields — made where every
 * other league decision is made: under `secureLeagueCommand`, against `league.result.resolve`
 * on the claim's own league, with a reason that is written beside the change. The browser
 * rule is closed; this is the door.
 *
 * ## What it does not do
 *
 * Write a score onto the match. A corrected score lands in the claim's `corrected*` fields
 * exactly as before, and the finalizer — the only writer of official state — still decides
 * whether it becomes the record.
 */
const bodySchema = z.object({
  decision: z.enum(['uphold', 'correct', 'reject']),
  correctedScore: z.object({ home: z.number().int().min(0).max(999), away: z.number().int().min(0).max(999) }).optional(),
  reason: z.string().trim().min(4).max(1000),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4_096,
    invalidBodyError: 'A decision and a reason are required.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'result_adjudicate', limit: 30, windowSeconds: 300, identity: () => [matchId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const submissionRef = adminDb.collection('resultSubmissions').doc(matchId);
  const submissionSnapshot = await submissionRef.get();
  if (!submissionSnapshot.exists) return Response.json({ error: 'Result submission not found.' }, { status: 404 });
  const submission = { id: submissionSnapshot.id, ...submissionSnapshot.data() } as ResultSubmission;

  const guarded = await secureLeagueCommand({
    actor,
    command: 'league.result.adjudicate',
    leagueId: submission.leagueId,
    requiredCapability: 'league.result.resolve',
    requireReason: true,
    reason: data.reason,
    handler: async ({ requestId, reason }) => {
      if (data.decision === 'correct' && !data.correctedScore) {
        refuse('Enter the corrected score for both teams.', 400);
      }
      if (data.correctedScore) {
        const matchSnapshot = await adminDb.collection('matches').doc(matchId).get();
        const verdict = checkScorePlausibility(String(matchSnapshot.data()?.sport ?? ''), data.correctedScore);
        if (!verdict.plausible) refuse(verdict.reason, 400);
      }

      const to: ResultSubmissionStatus = data.decision === 'reject' ? 'rejected' : 'confirmed';
      const resolution = data.decision === 'correct'
        ? 'league_corrected'
        : submission.status === 'confirmation_overdue'
          ? 'league_confirmed_unresponsive'
          : 'league_upheld';

      const now = new Date().toISOString();
      await adminDb.runTransaction(async (transaction) => {
        const fresh = await transaction.get(submissionRef);
        const current = { id: fresh.id, ...fresh.data() } as ResultSubmission;
        const decision = checkTransition({
          submission: current,
          to,
          actor: 'league_admin',
          resolution,
          correctedScore: data.correctedScore,
        });
        if (!decision.ok) refuse(decision.message, 409);

        transaction.update(submissionRef, {
          status: to,
          resolvedByUserId: actor.uid,
          resolvedAt: now,
          ...(to === 'confirmed' ? { resolution } : {}),
          ...(data.correctedScore
            ? { correctedHomeScore: data.correctedScore.home, correctedAwayScore: data.correctedScore.away }
            : {}),
          finalDecisionNote: reason,
        });
        transaction.set(submissionRef.collection('events').doc(), {
          submissionId: matchId,
          from: current.status,
          to,
          actor: 'league_admin',
          actorUserId: actor.uid,
          note: reason,
          createdAt: now,
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
          actor,
          requestId,
          action: 'league.result.adjudicated',
          targetCollection: 'resultSubmissions',
          targetId: matchId,
          note: reason,
          beforeSummary: { status: current.status },
          afterSummary: { status: to, resolution: to === 'confirmed' ? resolution : null, correctedScore: data.correctedScore ?? null },
        }));
      });

      return Response.json({ ok: true, matchId, status: to, resolution: to === 'confirmed' ? resolution : null, requestId });
    },
  });
  return 'response' in guarded ? guarded.response : guarded.result;
}
