import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { parseJsonBody } from '@/server/api/security';
import { requireMatchOpsSession } from '@/server/matchOps/session';
import { hasClockAnomaly } from '@/lib/matchOps/clock';
import { capturesACompletedMatch, reportRefusal } from '@/lib/matchOps/reportGate';
import { bindReportToEvents } from '@/lib/matchOps/digest';
import { reconcileBasketballBoxScore, reconstructMatchScore } from '@/kernel/formulas/score';
import { SPORT_DEFINITIONS } from '@/kernel/definitions/sportCatalogues';
import type { LiveMatchEvent, Match, MatchClockState, MatchExceptionCode } from '@/types';
import type { OfficialSportEvent } from '@/kernel/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  /**
   * Collected on the client BEFORE the reconstructed score is shown, and sent here for
   * comparison. See the comment on the mismatch below: this field is the only omission
   * detector field capture has.
   */
  declaredHomeScore: z.number().int().min(0).max(200),
  declaredAwayScore: z.number().int().min(0).max(200),
  attestationText: z.string().trim().min(10).max(400),
  /** What the device still holds. A non-empty queue is a blocking exception, not a warning. */
  unsyncedCount: z.number().int().min(0).max(10_000).default(0),
  abandoned: z.boolean().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const auth = await requireMatchOpsSession(request, matchId);
  if ('response' in auth) return auth.response;

  const parsed = await parseJsonBody(request, bodySchema, { maxBytes: 4_096 });
  if ('response' in parsed) return Response.json({ error: 'Invalid match report.' }, { status: 400 });
  const input = parsed.data;

  const [matchSnapshot, eventsSnapshot, clockSnapshot, lineupSnapshot] = await Promise.all([
    adminDb.collection('matches').doc(matchId).get(),
    adminDb.collection('liveMatchEvents').where('matchId', '==', matchId).get(),
    adminDb.collection('matchClockStates').doc(matchId).get(),
    adminDb.collection('matchLineupSnapshots').doc(matchId).get(),
  ]);
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;

  /**
   * A report has to be about a match that could have been played.
   *
   * Everything below this point is a CONSISTENCY check — does the declared score match the
   * reconstruction, are there sequence gaps, did a replaced device sync late. Consistency is
   * not evidence. An empty event stream reconciles perfectly with a declared 0-0, so a report
   * attested before kickoff passed every gate and was eligible for automatic finalization as an
   * official draw, on a fixture nobody had played.
   *
   * These two are lifecycle facts rather than quality signals, so they refuse rather than
   * attach an exception. There is no reading of "report a match that has not started" or
   * "report a match that was called off" that is a thing somebody meant to do, and recording
   * such a report as a claim to be reviewed would still put it in front of a League Admin as
   * though it were a result.
   */
  const refusal = reportRefusal({
    status: String(match.status),
    scheduledAt: String(match.scheduledAt),
    now: Date.now(),
  });
  if (refusal) return Response.json({ error: refusal }, { status: 409 });

  const allEvents = eventsSnapshot.docs.map((doc) => doc.data() as LiveMatchEvent);
  const active = allEvents.filter((event) => event.status === 'active');

  const sport = ['football', 'basketball', 'rugby'].includes(String(match.sport))
    ? (String(match.sport) as 'football' | 'basketball' | 'rugby')
    : 'football';
  const definition = SPORT_DEFINITIONS.find((entry) => entry.sportId === sport);

  const trace = definition
    ? reconstructMatchScore({
      sportDefinition: definition,
      events: active as unknown as OfficialSportEvent[],
      teams: { homeTeamId: match.homeTeamId, awayTeamId: match.awayTeamId },
    })
    : { home: 0, away: 0, status: 'unavailable' as const, issues: [], formulaVersion: '0' };

  const exceptions: MatchExceptionCode[] = [];

  /**
   * Basketball's box score has to add up.
   *
   * The reconstructed score comes from summing payload values, so it agrees with itself by
   * construction. What it cannot tell you is whether the points were attributed to the right
   * players: a basket credited to nobody, or to a player on the wrong team, produces the same
   * team total. Reconciling the per-athlete totals against the team score is the check that
   * catches it, and it only exists for basketball because football and rugby attribute one
   * scoring event to one athlete with a fixed weight.
   */
  if (sport === 'basketball') {
    const athleteTeamPoints: Record<string, number> = {};
    for (const event of active) {
      if (!event.athleteId) continue;
      const value = typeof event.payload?.value === 'number' ? event.payload.value : 0;
      athleteTeamPoints[event.teamId] = (athleteTeamPoints[event.teamId] ?? 0) + value;
    }
    const boxScore = reconcileBasketballBoxScore({
      athleteTeamPoints,
      teamScore: { [match.homeTeamId]: trace.home, [match.awayTeamId]: trace.away },
    });
    // A point that reached the team total without reaching a player is a real gap in the
    // record, so it blocks: a career stat built on it would be wrong and invisible.
    if (boxScore.status === 'inconsistent') exceptions.push('athlete_not_registered');
  }

  /**
   * The omission detector, and the reason the attestation screen asks for a score at all.
   *
   * A score reconstructed purely from captured events reconciles perfectly with itself by
   * construction. A goal the Field Manager never tapped is not an inconsistency: it is simply
   * absent, and every other gate passes. The old bilateral ceremony, for all its friction,
   * caught exactly this class of error, and asking one independent question is what replaces
   * it.
   *
   * A mismatch is not refused. The Field Manager may genuinely be unsure, and refusing would
   * teach them to type whatever the app already shows.
   */
  if (input.declaredHomeScore !== trace.home || input.declaredAwayScore !== trace.away) {
    exceptions.push('declared_score_mismatch');
  }
  if (input.unsyncedCount > 0) exceptions.push('unsynced_events_at_submit');

  const sequences = new Set(active.map((event) => event.clientSequence));
  const highest = Math.max(0, ...sequences);
  for (let sequence = 1; sequence <= highest; sequence += 1) {
    if (!sequences.has(sequence)) { exceptions.push('event_sequence_gap'); break; }
  }

  if (allEvents.some((event) => event.status === 'quarantined')) {
    exceptions.push('late_events_from_revoked_session');
  }
  if (input.abandoned) exceptions.push('match_abandoned');

  const clock = clockSnapshot.exists ? (clockSnapshot.data() as MatchClockState) : null;
  /**
   * The evidence that a match was played, rather than that a form was filled in.
   *
   * `full_time` is written by the clock route when the Field Manager ends the match, and it is
   * the one signal in the whole capture flow that is about the match having happened rather
   * than about the report agreeing with itself. A missing clock, a clock that never started and
   * a clock stopped at half time all mean the same thing here: whatever this report says, it is
   * not the record of a completed match, and it must not become official without a person
   * looking at it.
   *
   * Blocking rather than refusing, because there are real matches behind some of these — a
   * phone that died before full time, a session recovered by takeover — and those are exactly
   * what the League review queue is for.
   */
  if (!capturesACompletedMatch(clock)) exceptions.push('capture_incomplete');
  if (clock && hasClockAnomaly(clock)) exceptions.push('clock_anomaly');
  if (clock && clock.sessionGeneration > 1) exceptions.push('takeover_occurred');
  if (allEvents.some((event) => event.correctionReason)) exceptions.push('post_window_correction');

  const now = new Date().toISOString();
  const reportRef = adminDb.collection('matchReports').doc(matchId);
  const existing = await reportRef.get();
  const previousStatus = String(existing.data()?.status ?? '');
  /**
   * Re-attestation is permitted; re-reporting a settled match is not.
   *
   * `requires_re_attestation` is exactly the state a late event puts a report into, and refusing
   * it here would leave the Field Manager holding a match they can neither finalize nor correct.
   */
  if (existing.exists && !['submitted', 'ready_for_finalization', 'requires_re_attestation'].includes(previousStatus)) {
    return Response.json({ error: 'This match has already been reported.' }, { status: 409 });
  }

  /**
   * The exact set being attested to, bound into the report.
   *
   * Computed over EVERY event, not only the active ones: a superseded goal is part of what the
   * Field Manager confirmed, and a set where it is still active is a different record.
   */
  const binding = bindReportToEvents(
    allEvents.map((event) => ({
      eventId: event.eventId,
      eventType: event.eventType,
      teamId: event.teamId,
      athleteId: event.athleteId,
      gameClockMs: event.gameClockMs,
      status: event.status,
      payload: event.payload,
    })),
    Number(matchSnapshot.data()?.eventStreamVersion ?? allEvents.length),
  );

  // Attesting again over a changed set produces the next version rather than amending this one.
  const reportVersion = Number(existing.data()?.reportVersion ?? 0) + 1;

  await reportRef.set({
    id: matchId,
    matchId,
    leagueId: match.leagueId,
    assignmentId: auth.session.assignmentId,
    sessionId: auth.session.sessionId,
    attestedByMatchSessionId: auth.session.sessionId,
    reportVersion,
    eventDigest: binding.eventDigest,
    eventStreamVersion: binding.eventStreamVersion,
    source: 'field_capture',
    declaredHomeScore: input.declaredHomeScore,
    declaredAwayScore: input.declaredAwayScore,
    reconstructedHomeScore: trace.home,
    reconstructedAwayScore: trace.away,
    eventCount: binding.eventCount,
    // Over the active events only, so a superseded observation cannot change the hash of what
    // was actually attested to.
    payloadHash: createHash('sha256')
      .update(JSON.stringify(active.map((event) => event.eventId).sort()))
      .digest('hex'),
    ...(lineupSnapshot.exists ? { lineupSnapshotId: matchId } : {}),
    clockAdjustments: clock?.adjustments ?? [],
    attestedAt: now,
    attestationText: input.attestationText,
    exceptions,
    // Never `official` from here. A report is a claim; the finalizer decides.
    status: exceptions.some((code) => BLOCKING.has(code)) ? 'league_review' : 'submitted',
    resultVersion: 1,
    createdAt: now,
    updatedAt: now,
  }, { merge: true });

  const batch = adminDb.batch();
  for (const code of new Set(exceptions)) {
    const exceptionId = `${matchId}_${code}`;
    batch.set(adminDb.collection('matchOperationalExceptions').doc(exceptionId), {
      id: exceptionId,
      matchId,
      leagueId: match.leagueId,
      reportId: matchId,
      code,
      blocking: BLOCKING.has(code),
      detail: {
        declared: { home: input.declaredHomeScore, away: input.declaredAwayScore },
        reconstructed: { home: trace.home, away: trace.away },
        unsyncedCount: input.unsyncedCount,
      },
      status: 'open',
      createdAt: now,
      updatedAt: now,
    }, { merge: true });
  }
  batch.update(adminDb.collection('fieldManagerAssignments').doc(auth.session.assignmentId), {
    status: 'submitted',
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();

  return Response.json({
    ok: true,
    matchId,
    reconstructed: { home: trace.home, away: trace.away },
    exceptions,
    underReview: exceptions.some((code) => BLOCKING.has(code)),
  });
}

/** Exceptions that stop auto-finalization. The rest attach as quality signals. */
const BLOCKING = new Set<MatchExceptionCode>([
  'capture_incomplete',
  'declared_score_mismatch',
  'event_sequence_gap',
  'unsynced_events_at_submit',
  'late_events_from_revoked_session',
  'athlete_not_registered',
  'athlete_ineligible',
  'match_abandoned',
  'policy_violation',
]);
