import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { decideRosterAction, patchIsRosterSafe } from '@/lib/league/roster';
import type { Athlete } from '@/types';

export const runtime = 'nodejs';

/**
 * Roster operations, governed.
 *
 * The League Admin owns registration — who is on a club's roster, what number they wear, what
 * position they are registered in, whether they may be selected. They do not own performance,
 * and this route is where that boundary is enforced rather than merely stated: the decision
 * module returns an allowlisted patch, and the patch is checked again here before it is
 * written. A performance field cannot reach Firestore through this path even if a future
 * action tried to return one.
 */
const bodySchema = z.object({
  athleteId: z.string().trim().min(1).max(180),
  action: z.enum(['set_number', 'set_position', 'transfer', 'suspend', 'reinstate', 'deactivate']),
  squadNumber: z.number().int().min(1).max(99).optional(),
  registeredPosition: z.string().trim().min(2).max(80).optional(),
  toTeamId: z.string().trim().min(1).max(180).optional(),
  reason: z.string().trim().max(500).optional(),
}).strict();

export async function POST(request: Request) {
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4_096,
    invalidBodyError: 'A valid roster operation is required.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'league_roster', limit: 60, windowSeconds: 300 },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const athleteRef = adminDb.collection('athletes').doc(data.athleteId);
  const athleteSnapshot = await athleteRef.get();
  if (!athleteSnapshot.exists) return Response.json({ error: 'Athlete not found.' }, { status: 404 });
  const athlete = { id: athleteSnapshot.id, ...athleteSnapshot.data() } as Athlete;

  const permitted = await hasCapabilityOrPlatformGrant(
    actor.uid,
    { scopeType: 'league', scopeId: String(athlete.leagueId) },
    'league.roster.manage',
  );
  if (!permitted) {
    return Response.json({ error: 'Only this league can manage its rosters.' }, { status: 403 });
  }

  /*
   * The squad and the league's clubs are read so the decision can refuse a duplicate number or
   * a transfer that would leave the competition. Bounded: a club roster and a league's club
   * list are both small.
   */
  const [squadSnapshot, teamsSnapshot] = await Promise.all([
    adminDb.collection('athletes').where('teamId', '==', athlete.teamId).limit(120).get(),
    adminDb.collection('teams').where('leagueId', '==', athlete.leagueId).limit(200).get(),
  ]);

  const decision = decideRosterAction({
    action: data.action,
    athlete: {
      athleteId: athlete.id,
      legalName: String(athlete.legalName ?? athlete.id),
      teamId: String(athlete.teamId),
      leagueId: String(athlete.leagueId),
      rosterStatus: (athlete as { rosterStatus?: 'active' | 'suspended' | 'inactive' }).rosterStatus,
      squadNumber: (athlete as { squadNumber?: number }).squadNumber,
    },
    squadNumber: data.squadNumber,
    registeredPosition: data.registeredPosition,
    toTeamId: data.toTeamId,
    reason: data.reason,
    squad: squadSnapshot.docs.map((doc) => ({
      athleteId: doc.id,
      squadNumber: doc.data().squadNumber as number | undefined,
    })),
    leagueTeamIds: teamsSnapshot.docs.map((doc) => doc.id),
  });
  if (!decision.ok) return Response.json({ error: decision.reason }, { status: 409 });

  // Checked again at the boundary. The decision module is trusted; the write path verifies.
  if (!patchIsRosterSafe(decision.patch)) {
    return Response.json({ error: 'That operation tried to write a field a roster cannot change.' }, { status: 500 });
  }

  const now = new Date().toISOString();
  const batch = adminDb.batch();
  batch.update(athleteRef, {
    ...decision.patch,
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUserId: actor.uid,
  });
  batch.set(adminDb.collection('adminAuditEvents').doc(), {
    action: decision.auditAction,
    actorUserId: actor.uid,
    targetCollection: 'athletes',
    targetId: athlete.id,
    note: data.reason ?? '',
    before: {
      teamId: athlete.teamId,
      squadNumber: (athlete as { squadNumber?: number }).squadNumber ?? null,
      rosterStatus: (athlete as { rosterStatus?: string }).rosterStatus ?? 'active',
      registeredPosition: athlete.registeredPosition ?? null,
    },
    after: decision.patch,
    createdAt: now,
  });
  await batch.commit();

  return Response.json({ ok: true, athleteId: athlete.id, summary: decision.summary });
}
