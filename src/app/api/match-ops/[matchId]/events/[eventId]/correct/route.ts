import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody } from '@/server/api/security';
import { requireMatchOpsSession } from '@/server/matchOps/session';
import { isWithinUndoWindow } from '@/lib/matchOps/intake';
import type { LiveMatchEvent } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  clientEventId: z.string().trim().min(8).max(120),
  clientSequence: z.number().int().min(1).max(100_000),
  eventType: z.string().trim().min(3).max(80),
  teamId: z.string().trim().min(1).max(180),
  athleteId: z.string().trim().min(1).max(180).nullable(),
  period: z.enum(['1', '2', 'ET1', 'ET2']),
  gameClockMs: z.number().int().min(0).max(4 * 60 * 60_000),
  deviceTime: z.string().trim().max(40),
  payload: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().trim().max(300).optional(),
});

/**
 * Correct an event that has already been recorded.
 *
 * Appends, never mutates, and never deletes. The original keeps its status, its sequence
 * number and its place; a new event supersedes it. Most mistakes die inside the eight-second
 * undo window and need no explanation. After that the Field Manager is revising something
 * they had already accepted, which is a different act: it needs a reason, and it raises a
 * non-blocking flag so the reviewer knows the record was revised rather than simply captured.
 *
 * Deletion is not offered at any point. It would put a hole in `clientSequence`, and the
 * server reads a hole as "an event was captured and never arrived", so every corrected goal
 * would raise a phantom reconciliation case on a match that was recorded correctly.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ matchId: string; eventId: string }> },
) {
  const { matchId, eventId } = await params;
  const auth = await requireMatchOpsSession(request, matchId);
  if ('response' in auth) return auth.response;

  const parsed = await parseJsonBody(request, bodySchema, { maxBytes: 8_192 });
  if ('response' in parsed) return Response.json({ error: 'Invalid correction.' }, { status: 400 });
  const input = parsed.data;

  const originalRef = adminDb.collection('liveMatchEvents').doc(eventId);
  const original = await originalRef.get();
  if (!original.exists) return Response.json({ error: 'That event was not found.' }, { status: 404 });
  const existing = original.data() as LiveMatchEvent;
  if (existing.matchId !== matchId) return Response.json({ error: 'That event belongs to another match.' }, { status: 404 });
  if (existing.status === 'superseded') {
    return Response.json({ error: 'That event has already been corrected.' }, { status: 409 });
  }

  const now = new Date();
  const withinWindow = isWithinUndoWindow(existing.createdAtServer, now);
  if (!withinWindow && !input.reason?.trim()) {
    return Response.json(
      { error: 'Tell us what changed. Corrections after the undo window need a reason.' },
      { status: 400 },
    );
  }

  const correctionRef = adminDb.collection('liveMatchEvents').doc(`${matchId}_${input.clientEventId}`);
  const matchRef = adminDb.collection('matches').doc(matchId);
  const reportRef = adminDb.collection('matchReports').doc(matchId);

  /**
   * One transaction, because a correction changes what the report is a report OF.
   *
   * This ran as a batch that appended the correction and superseded the original, and stopped
   * there. Generic event intake does two more things — it advances `eventStreamVersion` and
   * it invalidates an already-attested report — and this path did neither, even though it is
   * the path that exists specifically for changing an event after the fact.
   *
   * So the sequence that broke it was: attest at 17:00, correct a goal at 17:04. The report
   * still read `ready_for_finalization`, still carried the digest of the events as they were
   * at 17:00, and the finalizer would take it. A report is a claim that a particular set of
   * events was the match; changing that set does not amend the claim, it retires it.
   *
   * The original is re-read inside the transaction rather than trusted from the check above,
   * so two corrections racing on the same event cannot both win.
   */
  const outcome = await adminDb.runTransaction(async (transaction) => {
    const current = await transaction.get(originalRef);
    if (!current.exists) return 'not_found' as const;
    const currentData = current.data() as LiveMatchEvent;
    if (currentData.matchId !== matchId) return 'not_found' as const;
    if (currentData.status === 'superseded') return 'already_corrected' as const;

    const report = await transaction.get(reportRef);
    const reportStatus = String(report.data()?.status ?? '');

    transaction.set(correctionRef, {
    eventId: correctionRef.id,
    matchId,
    leagueId: existing.leagueId,
    seasonId: existing.seasonId,
    sport: existing.sport,
    eventType: input.eventType,
    period: input.period,
    gameClockMs: input.gameClockMs,
    teamId: input.teamId,
    athleteId: input.athleteId,
    payload: input.payload ?? {},
    source: auth.session.sessionGeneration > 1 ? 'league_emergency_takeover' : 'field_manager',
    assignmentId: auth.session.assignmentId,
    sessionId: auth.session.sessionId,
    sessionGeneration: auth.session.sessionGeneration,
    clientEventId: input.clientEventId,
    clientSequence: input.clientSequence,
    deviceTime: input.deviceTime,
    createdAtServer: now.toISOString(),
    supersedesEventId: eventId,
    ...(input.reason?.trim() ? { correctionReason: input.reason.trim() } : {}),
      status: 'active',
    });
    transaction.update(originalRef, { status: 'superseded' });

    // The stream moved, so anything bound to its previous length is bound to a different match.
    transaction.set(matchRef, { eventStreamVersion: FieldValue.increment(1) }, { merge: true });

    if (['submitted', 'ready_for_finalization'].includes(reportStatus)) {
      transaction.update(reportRef, {
        status: 'requires_re_attestation',
        reAttestationReason: 'An event was corrected after this report was attested.',
        updatedAt: now.toISOString(),
      });
    }

    if (!withinWindow) {
      const exceptionId = `${matchId}_post_window_correction`;
      transaction.set(adminDb.collection('matchOperationalExceptions').doc(exceptionId), {
        id: exceptionId,
        matchId,
        leagueId: currentData.leagueId,
        code: 'post_window_correction',
        // Non-blocking. A Field Manager who notices a mistake ten minutes later and fixes it is
        // producing a better record, not a worse one. It lowers confidence; it does not refuse.
        blocking: false,
        detail: { correctedEventId: eventId, reason: input.reason },
        status: 'open',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }, { merge: true });
    }

    return { reAttestationRequired: ['submitted', 'ready_for_finalization'].includes(reportStatus) };
  });

  if (outcome === 'not_found') {
    return Response.json({ error: 'That event was not found.' }, { status: 404 });
  }
  if (outcome === 'already_corrected') {
    return Response.json({ error: 'That event has already been corrected.' }, { status: 409 });
  }

  return Response.json({
    ok: true,
    supersededEventId: eventId,
    correctionEventId: correctionRef.id,
    withinUndoWindow: withinWindow,
    // Told, because the Field Manager has to attest again and would otherwise believe the
    // match was already reported.
    reAttestationRequired: outcome.reAttestationRequired,
  });
}
