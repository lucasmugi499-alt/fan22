import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { decideCancel } from '@/lib/league/schedule';
import type { Match } from '@/types';

export const runtime = 'nodejs';

/**
 * Recording that a fixture will not be played.
 *
 * The sibling of `reschedule`, and kept to the same discipline: a required reason, a history
 * entry beside the change, an audit event, and only the administrative fields touched. See
 * `decideCancel` for why this exists at all — the status model had `cancelled` and nothing
 * could produce it.
 *
 * ## What this must not touch
 *
 * The score, the events, the verification status. `decideCancel` refuses any match that is not
 * plainly `scheduled`, so this route can never be a second door to the official record.
 */
const bodySchema = z.object({
  reason: z.string().trim().min(4).max(500),
}).strict();

export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 2_048,
    invalidBodyError: 'A reason is required.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'fixture_cancel', limit: 30, windowSeconds: 300, identity: () => [matchId] },
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
    return Response.json({ error: 'Only this league can call off its fixtures.' }, { status: 403 });
  }

  const decision = decideCancel({
    status: String(match.status),
    currentScheduledAt: match.scheduledAt,
    reason: data.reason,
  });
  if (!decision.ok) return Response.json({ error: decision.reason }, { status: 409 });

  const now = new Date().toISOString();
  const changeId = `${matchId}_cancelled_${Date.parse(now)}`;
  const batch = adminDb.batch();

  // Only the status. Written explicitly, for the same reason reschedule writes only two fields.
  batch.update(matchRef, {
    status: 'cancelled',
    updatedAt: FieldValue.serverTimestamp(),
  });

  batch.set(adminDb.collection('matchScheduleChanges').doc(changeId), {
    id: changeId,
    matchId,
    leagueId: match.leagueId,
    seasonId: match.seasonId,
    kind: 'cancelled',
    fromScheduledAt: decision.fromScheduledAt,
    toScheduledAt: null,
    reason: data.reason,
    changedByUserId: actor.uid,
    createdAt: now,
  });

  batch.set(adminDb.collection('adminAuditEvents').doc(), {
    action: 'league.fixture.cancelled',
    actorUserId: actor.uid,
    targetCollection: 'matches',
    targetId: matchId,
    note: data.reason,
    before: { status: match.status, scheduledAt: decision.fromScheduledAt },
    after: { status: 'cancelled' },
    createdAt: now,
  });

  await batch.commit();

  return Response.json({ ok: true, matchId, status: 'cancelled' });
}
