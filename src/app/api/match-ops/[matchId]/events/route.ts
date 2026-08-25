import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody } from '@/server/api/security';
import { requireMatchOpsSession } from '@/server/matchOps/session';
import { planEventIntake } from '@/lib/matchOps/intake';
import type { LiveMatchEvent, Match } from '@/types';

export const runtime = 'nodejs';

const eventSchema = z.object({
  clientEventId: z.string().trim().min(8).max(120),
  clientSequence: z.number().int().min(1).max(100_000),
  eventType: z.string().trim().min(3).max(80),
  teamId: z.string().trim().min(1).max(180),
  athleteId: z.string().trim().min(1).max(180).nullable(),
  period: z.enum(['1', '2', 'ET1', 'ET2']),
  gameClockMs: z.number().int().min(0).max(4 * 60 * 60_000),
  deviceTime: z.string().trim().max(40),
  payload: z.record(z.string(), z.unknown()).optional(),
  supersedesEventId: z.string().trim().max(200).optional(),
  correctionReason: z.string().trim().max(300).optional(),
});

// Batched, because a Field Manager who has been offline for forty minutes replays everything
// at once and one request per event over a returning connection is how a sync fails halfway.
const bodySchema = z.object({ events: z.array(eventSchema).min(1).max(200) });

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await requireMatchOpsSession(request, matchId);
  if ('response' in auth) return auth.response;

  const parsed = await parseJsonBody(request, bodySchema, { maxBytes: 256 * 1024 });
  if ('response' in parsed) return Response.json({ error: 'Invalid event batch.' }, { status: 400 });

  const [matchSnapshot, clockSnapshot, existingSnapshot] = await Promise.all([
    adminDb.collection('matches').doc(matchId).get(),
    adminDb.collection('matchClockStates').doc(matchId).get(),
    adminDb.collection('liveMatchEvents').where('matchId', '==', matchId).get(),
  ]);
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = matchSnapshot.data() as Match;

  const currentGeneration = Number(clockSnapshot.data()?.sessionGeneration ?? auth.session.sessionGeneration);
  const existing = existingSnapshot.docs.map((doc) => doc.data() as LiveMatchEvent);

  const verdict = planEventIntake({
    incoming: parsed.data.events,
    existing,
    submittedGeneration: auth.session.sessionGeneration,
    currentGeneration,
  });

  const now = new Date().toISOString();
  const batch = adminDb.batch();
  for (const { event, status } of verdict.accepted) {
    // Keyed by clientEventId, so the same observation posted twice writes the same document
    // rather than a second one. Idempotency is a property of the key, not of a check.
    const ref = adminDb.collection('liveMatchEvents').doc(`${matchId}_${event.clientEventId}`);
    batch.set(ref, {
      eventId: ref.id,
      matchId,
      leagueId: match.leagueId,
      seasonId: match.seasonId,
      sport: match.sport,
      eventType: event.eventType,
      period: event.period,
      gameClockMs: event.gameClockMs,
      teamId: event.teamId,
      athleteId: event.athleteId,
      payload: event.payload ?? {},
      /**
       * A takeover session never writes `field_manager`. The source is what the provenance
       * chain and the data-quality tier read, and labelling League Operations as the observer
       * would make a match captured from an office indistinguishable from one captured on the
       * touchline.
       */
      source: auth.session.sessionGeneration > 1 ? 'league_emergency_takeover' : 'field_manager',
      assignmentId: auth.session.assignmentId,
      sessionId: auth.session.sessionId,
      sessionGeneration: auth.session.sessionGeneration,
      clientEventId: event.clientEventId,
      clientSequence: event.clientSequence,
      deviceTime: event.deviceTime,
      createdAtServer: now,
      ...(event.supersedesEventId ? { supersedesEventId: event.supersedesEventId } : {}),
      ...(event.correctionReason ? { correctionReason: event.correctionReason } : {}),
      status,
    }, { merge: false });

    // A superseding event marks its predecessor rather than removing it. The original keeps
    // its sequence number and its place, so the record shows what was observed, that it was
    // corrected, and in what order.
    if (event.supersedesEventId) {
      batch.set(
        adminDb.collection('liveMatchEvents').doc(event.supersedesEventId),
        { status: 'superseded', updatedAtServer: FieldValue.serverTimestamp() },
        { merge: true },
      );
    }
  }
  await batch.commit();

  if (verdict.quarantined) {
    // The League decides: admit, discard, or merge with a correction. Nothing is auto-merged,
    // because two contradictory clocks cannot both be right and the server cannot tell which.
    const exceptionId = `${matchId}_late_events_from_revoked_session`;
    await adminDb.collection('matchOperationalExceptions').doc(exceptionId).set({
      id: exceptionId,
      matchId,
      leagueId: match.leagueId,
      code: 'late_events_from_revoked_session',
      blocking: true,
      detail: {
        submittedGeneration: auth.session.sessionGeneration,
        currentGeneration,
        eventCount: verdict.accepted.length,
      },
      status: 'open',
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  }

  return Response.json({
    ok: true,
    recorded: verdict.accepted.map((entry) => entry.event.clientEventId),
    duplicates: verdict.duplicates,
    missingSequences: verdict.missingSequences,
    quarantined: verdict.quarantined,
  });
}
