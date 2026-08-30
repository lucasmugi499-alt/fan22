import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { resolveConflictContext } from '@/server/conflict/resolveConflictContext';
import { finalizeResultCase } from '@/server/resultFinalizer';
import { activationFromEnvironment } from '@/server/finalizerActivation';
import { decideCaseAction, type ResultCase } from '@/server/results/resultCase';

export const runtime = 'nodejs';

/**
 * Every move on an adjudication, in one place.
 *
 * ## What a ruling does and does not do
 *
 * A `corrected` ruling records the decision and then calls `finalizeResultCase`, which builds
 * a candidate and hands it to the same `finalizeCandidate` field capture and league entry use.
 * Nothing here writes `matches.score`, `officialResultVersion` or a standings row. That is the
 * property the whole model exists to hold: a correction is a new SOURCE feeding one
 * finalization path, never a second path that can publish a result.
 *
 * ## Why the ruling is written before the finalizer runs
 *
 * The ruling is the league's decision and is true the moment they make it. Publishing it is a
 * separate act that can fail — the activation gate is off, a newer version already exists, the
 * transaction contends. Writing the decision only if publication succeeds would lose a real
 * ruling to a transient failure, and the case would show as still open to the person who had
 * already decided it. So the decision is recorded, and `resultingVersion` appears on the case
 * only once the official write actually landed.
 */

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('claim') }),
  z.object({ action: z.literal('escalate'), rationale: z.string().trim().min(10).max(2_000) }),
  z.object({
    action: z.literal('propose'),
    rationale: z.string().trim().min(10).max(2_000),
    correctedScore: z.object({
      home: z.number().int().min(0).max(500),
      away: z.number().int().min(0).max(500),
    }).optional(),
  }),
  z.object({
    action: z.literal('rule'),
    outcome: z.enum(['upheld', 'corrected']),
    rationale: z.string().trim().min(10).max(2_000),
    correctedScore: z.object({
      home: z.number().int().min(0).max(500),
      away: z.number().int().min(0).max(500),
    }).optional(),
  }),
  z.object({ action: z.literal('withdraw') }),
  z.object({
    action: z.literal('evidence'),
    evidence: z.object({
      collection: z.enum([
        'matchReports', 'resultSubmissions', 'liveMatchEvents', 'mediaRecords',
        'athleteStatIssues', 'teamMatchReports', 'matchOperationalExceptions',
      ]),
      documentId: z.string().trim().min(1).max(200),
      note: z.string().trim().max(400).optional(),
    }),
  }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 16_384,
    invalidBodyError: 'Say what you are doing to this case and why.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'result_case_action', limit: 40, windowSeconds: 300, identity: () => [caseId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const caseRef = adminDb.collection('resultCases').doc(caseId);
  const snapshot = await caseRef.get();
  if (!snapshot.exists) return Response.json({ error: 'Case not found.' }, { status: 404 });
  const record = { id: snapshot.id, ...snapshot.data() } as ResultCase;

  const [adjudicates, conflict] = await Promise.all([
    hasCapabilityOrPlatformGrant(
      actor.uid, { scopeType: 'league', scopeId: record.leagueId }, 'league.result.resolve',
    ),
    resolveConflictContext({
      principal: { principalType: 'user', userId: actor.uid },
      matchId: record.matchId,
    }),
  ]);

  const decision = decideCaseAction({
    action: data.action,
    status: record.status,
    actorUserId: actor.uid,
    openedByUserId: record.openedByUserId,
    adjudicates,
    conflicted: conflict.conflictWithMatch,
    outcome: data.action === 'rule' ? data.outcome : undefined,
  });
  if (!decision.ok) return Response.json({ error: decision.reason }, { status: decision.status });

  if (data.action === 'rule' && data.outcome === 'corrected' && !data.correctedScore) {
    return Response.json(
      { error: 'A corrected ruling has to say what the result should have been.' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  /*
   * The transition is a compare-and-set on the status the decision was made against. Two
   * adjudicators acting at the same moment must not both rule, and the loser must be told
   * rather than silently overwritten.
   */
  const applied = await adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(caseRef);
    if (current.data()?.status !== record.status) return false;

    if (data.action === 'evidence') {
      transaction.update(caseRef, {
        // Append-only. Evidence is never replaced, because a case that could lose an
        // inconvenient reference is not a record of anything.
        evidence: [...record.evidence, { ...data.evidence, addedByUserId: actor.uid, addedAt: now }],
        updatedAt: now,
      });
      return true;
    }

    transaction.update(caseRef, {
      status: decision.nextStatus,
      updatedAt: now,
      ...(data.action === 'propose' ? {
        proposedByUserId: actor.uid,
        proposedResolution: data.rationale,
        proposedCorrectedScore: data.correctedScore ?? null,
        proposedAt: now,
      } : {}),
      ...(data.action === 'escalate' ? {
        escalatedByUserId: actor.uid, escalationReason: data.rationale, escalatedAt: now,
      } : {}),
      ...(data.action === 'claim' ? { claimedByUserId: actor.uid, claimedAt: now } : {}),
      ...(data.action === 'rule' ? {
        ruling: {
          decidedByUserId: actor.uid,
          decidedAt: now,
          outcome: data.outcome,
          rationale: data.rationale,
          ...(data.correctedScore ? { correctedScore: data.correctedScore } : {}),
          // Recorded when a conflicted adjudicator prepared the reasoning this ratifies, so
          // provenance shows who prepared a resolution as well as who took responsibility.
          ...(record.status === 'proposed' && (record as { proposedByUserId?: string }).proposedByUserId
            ? { proposedByUserId: (record as { proposedByUserId?: string }).proposedByUserId }
            : {}),
        },
      } : {}),
    });
    return true;
  });

  if (!applied) {
    return Response.json(
      { error: 'This case moved while you were deciding. Reload it and look again.' },
      { status: 409 },
    );
  }

  // Only a correction publishes. An upheld ruling changes nothing, and running the finalizer
  // for it would write a new official version identical to the old one and bump every
  // downstream projection for a decision that the record already reflected.
  if (data.action === 'rule' && data.outcome === 'corrected') {
    const outcome = await finalizeResultCase(adminDb, caseId, activationFromEnvironment());
    return Response.json({ ok: true, status: decision.nextStatus, finalization: outcome });
  }

  return Response.json({ ok: true, status: decision.nextStatus });
}
