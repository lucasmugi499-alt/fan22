import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { decideReschedule } from '@/lib/league/schedule';
import type { Match, Season } from '@/types';

export const runtime = 'nodejs';

/**
 * Moving a fixture, and keeping the fact that it moved.
 *
 * Deliberately not an edit to `scheduledAt`. A fixture that is silently overwritten leaves the
 * clubs, the athletes and anyone holding the old date with no way to know, and leaves the
 * league with no record of who moved it or why. Every reschedule writes a history entry beside
 * the change, and the reason is required rather than optional.
 *
 * ## What this must not touch
 *
 * The score, the events, the verification status and the bound capture policy. A reschedule is
 * an administrative fact about when a match will be played; re-deriving the capture policy
 * would retroactively change the standard the match must be recorded to, which is a different
 * and much larger decision than moving a kickoff.
 */
const bodySchema = z.object({
  scheduledAt: z.string().trim().min(4).max(40),
  venue: z.string().trim().min(2).max(180).optional(),
  reason: z.string().trim().min(4).max(500),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4_096,
    invalidBodyError: 'A new kickoff and a reason are required.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'fixture_reschedule', limit: 30, windowSeconds: 300, identity: () => [matchId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const matchRef = adminDb.collection('matches').doc(matchId);
  const matchSnapshot = await matchRef.get();
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;

  const permitted = await hasCapabilityOrPlatformGrant(
    actor.uid,
    { scopeType: 'league', scopeId: match.leagueId },
    'league.fixture.manage',
  );
  if (!permitted) {
    return Response.json({ error: 'Only this league can reschedule its fixtures.' }, { status: 403 });
  }

  const seasonSnapshot = await adminDb.collection('seasons').doc(match.seasonId).get();
  const season = seasonSnapshot.data() as Season | undefined;

  const decision = decideReschedule({
    status: String(match.status),
    currentScheduledAt: match.scheduledAt,
    currentVenue: match.venue,
    nextScheduledAt: new Date(data.scheduledAt).toISOString(),
    nextVenue: data.venue,
    reason: data.reason,
    seasonStart: season?.startDate,
    seasonEnd: season?.endDate,
    now: new Date().toISOString(),
  });
  if (!decision.ok) return Response.json({ error: decision.reason }, { status: 409 });

  const now = new Date().toISOString();
  const changeId = `${matchId}_${Date.parse(decision.toScheduledAt)}`;
  const batch = adminDb.batch();

  /*
   * Only the two administrative fields. Written explicitly rather than by spreading a patch,
   * so a future caller cannot widen what a reschedule is able to change.
   */
  batch.update(matchRef, {
    scheduledAt: decision.toScheduledAt,
    ...(decision.toVenue ? { venue: decision.toVenue } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(adminDb.collection('matchScheduleChanges').doc(changeId), {
    id: changeId,
    matchId,
    leagueId: match.leagueId,
    seasonId: match.seasonId,
    fromScheduledAt: decision.fromScheduledAt,
    toScheduledAt: decision.toScheduledAt,
    fromVenue: decision.fromVenue,
    toVenue: decision.toVenue,
    movedByHours: decision.movedByHours,
    reason: data.reason,
    changedByUserId: actor.uid,
    createdAt: now,
  });

  batch.set(adminDb.collection('adminAuditEvents').doc(), {
    action: 'league.fixture.rescheduled',
    actorUserId: actor.uid,
    targetCollection: 'matches',
    targetId: matchId,
    note: data.reason,
    before: { scheduledAt: decision.fromScheduledAt, venue: decision.fromVenue },
    after: { scheduledAt: decision.toScheduledAt, venue: decision.toVenue },
    createdAt: now,
  });

  await batch.commit();

  return Response.json({
    ok: true,
    matchId,
    fromScheduledAt: decision.fromScheduledAt,
    toScheduledAt: decision.toScheduledAt,
    movedByHours: decision.movedByHours,
  });
}
