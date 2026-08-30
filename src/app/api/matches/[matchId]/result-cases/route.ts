import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation, requireAuthenticatedUser } from '@/server/api/security';
import { openResultCase } from '@/server/results/openResultCase';

export const runtime = 'nodejs';

/**
 * Open an adjudication of a match's official result, whatever produced it.
 *
 * The route this replaces was `/api/result-submissions/{matchId}/correction`, which loaded
 * `resultSubmissions/{matchId}`. A result that became official through V2 field capture has no
 * such document, so the platform's own primary intake path produced results that could not be
 * corrected through the product at all.
 *
 * This one starts from the MATCH and its `officialResultVersion`, which every source produces,
 * so the question "was this result right" is asked the same way regardless of how the result
 * arrived.
 */

const openSchema = z.object({
  /**
   * Which official version is being challenged, sent by the client rather than read here.
   *
   * That is the point: a client on a stale page names a version the match has moved past, and
   * `decideOpenCase` refuses instead of opening a case about a result that no longer exists.
   */
  subjectVersion: z.number().int().positive(),
  reason: z.string().trim().min(10).max(2_000),
  evidence: z.array(z.object({
    collection: z.enum([
      'matchReports', 'resultSubmissions', 'liveMatchEvents', 'mediaRecords',
      'athleteStatIssues', 'teamMatchReports', 'matchOperationalExceptions',
    ]),
    documentId: z.string().trim().min(1).max(200),
    note: z.string().trim().max(400).optional(),
  })).max(20).default([]),
});

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const mutation = await requireAuthenticatedMutation(request, openSchema, {
    maxBytes: 16_384,
    invalidBodyError: 'Say which version you are challenging and why.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'result_case_open', limit: 10, windowSeconds: 300, identity: () => [matchId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const result = await openResultCase({
    db: adminDb,
    matchId,
    actorUid: actor.uid,
    subjectVersion: data.subjectVersion,
    reason: data.reason,
    evidence: data.evidence,
  });
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  return Response.json({ ok: true, caseId: result.caseId, status: 'open' });
}

/** Every adjudication this match has had, oldest first, so the history reads in order. */
export async function GET(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;

  const cases = await adminDb.collection('resultCases').where('matchId', '==', matchId).get();
  return Response.json({
    cases: cases.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((left, right) => String(left.id).localeCompare(String(right.id))),
  }, { headers: { 'cache-control': 'private, no-store' } });
}
