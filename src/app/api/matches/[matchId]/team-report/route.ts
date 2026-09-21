import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapability } from '@/server/access/capabilities';
import { checkScorePlausibility } from '@/kernel/validators/scorePlausibility';
import type { Match } from '@/types';

export const runtime = 'nodejs';

/**
 * A club's own account of a match it played. Evidence, and only evidence.
 *
 * ## What this is not
 *
 * Not a result. Not a claim that becomes a result when the opponent agrees. Not a finalization
 * candidate under any condition. That is the whole of ADR-005's line on results:
 *
 *   Field Manager captures. League governs. Clubs report and dispute. GoalPlace finalizes.
 *
 * Two clubs agreeing was the V1 bilateral workflow that field capture replaced, and it is
 * precisely what a `teamMatchReports` document must never be able to recreate. Nothing reads
 * this collection to produce an official record. A result case may cite it, a League Admin
 * may weigh it, and the finalizer does not know it exists.
 *
 * ## Why it exists at all
 *
 * Because the club was there. When a field report is wrong, or a match had no Field Manager
 * and the league is entering the result afterwards, the club's account is the one source the
 * platform otherwise has no way to hear. Refusing it does not make the record more reliable;
 * it makes the record deaf.
 *
 * ## One per club per match, revisable
 *
 * Deterministic id, and a resubmission replaces the club's account rather than adding a
 * second one. What survives on the document is when it was last revised and how many times,
 * so a report that changed after the result went official is visibly a report that changed.
 */

const bodySchema = z.object({
  teamId: z.string().trim().min(1).max(180),
  declaredScore: z.object({
    home: z.number().int().min(0).max(500),
    away: z.number().int().min(0).max(500),
  }).optional(),
  notes: z.string().trim().min(10).max(4_000),
  /** Media the club uploaded through the evidence session flow, by storage path. */
  evidenceRefs: z.array(z.string().trim().min(1).max(400)).max(10).default([]),
});

export function teamReportId(matchId: string, teamId: string) {
  return `${matchId}__${teamId}`;
}

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 16_384,
    invalidBodyError: 'Say which club is reporting and what happened.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'team_report', limit: 10, windowSeconds: 300, identity: () => [matchId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const matchSnapshot = await adminDb.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;

  // The club must be IN this fixture. A capability on some other club grants nothing here,
  // and a club reporting on a match it did not play is not a witness.
  if (match.homeTeamId !== data.teamId && match.awayTeamId !== data.teamId) {
    return Response.json({ error: 'That club did not play this match.' }, { status: 403 });
  }
  if (!await hasCapability(actor.uid, { scopeType: 'team', scopeId: data.teamId }, 'team.result.report')) {
    return Response.json({ error: 'You do not report results for this club.' }, { status: 403 });
  }

  // Unplayed fixtures have no account to give. A report before kickoff is the same class of
  // thing as a field report before kickoff, and is refused for the same reason.
  if (match.status === 'scheduled' && Date.parse(String(match.scheduledAt)) > Date.now()) {
    return Response.json({ error: 'This match has not been played yet.' }, { status: 409 });
  }
  if (match.status === 'cancelled') {
    return Response.json({ error: 'This match was cancelled.' }, { status: 409 });
  }

  /*
   * A declared score that could not be this sport's is refused, not recorded. The club is
   * typing what it saw; a 2-3 on a basketball court is a slip, and a slip that becomes evidence
   * on a case is a slip that costs a League Admin time to rule out.
   */
  if (data.declaredScore) {
    const verdict = checkScorePlausibility(String(match.sport), data.declaredScore);
    if (!verdict.plausible) return Response.json({ error: verdict.reason }, { status: 400 });
  }

  const ref = adminDb.collection('teamMatchReports').doc(teamReportId(matchId, data.teamId));
  const now = new Date().toISOString();
  const revised = await adminDb.runTransaction(async (transaction) => {
    const existing = await transaction.get(ref);
    const revisions = Number(existing.data()?.revisions ?? 0) + 1;
    transaction.set(ref, {
      id: ref.id,
      matchId,
      teamId: data.teamId,
      leagueId: match.leagueId,
      seasonId: (match as { seasonId?: string }).seasonId ?? null,
      reportedByUserId: actor.uid,
      declaredScore: data.declaredScore ?? null,
      notes: data.notes,
      evidenceRefs: data.evidenceRefs,
      // Recorded so a report revised AFTER the result went official reads as one that changed.
      officialResultVersionAtReport: (match as { officialResultVersion?: number }).officialResultVersion ?? null,
      revisions,
      firstReportedAt: existing.exists ? existing.data()?.firstReportedAt ?? now : now,
      reportedAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return revisions;
  });

  return Response.json({ ok: true, reportId: ref.id, revisions: revised });
}
