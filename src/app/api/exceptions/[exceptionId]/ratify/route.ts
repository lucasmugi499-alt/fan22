import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapability, hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { resolveConflictContext } from '@/server/conflict/resolveConflictContext';
import type { MatchOperationalException } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  decision: z.enum(['accept_proposal', 'override']),
  resolution: z.string().trim().max(2_000).optional(),
  note: z.string().trim().max(1_000).optional(),
});

/**
 * The decision itself, refused to anybody with a stake in it.
 *
 * `resolveActor` answers whether this person may act at all; this answers whether they should
 * act here. A League Admin holding `league.result.resolve` on a match involving the club they
 * coach passes the first check and fails this one, and that separation is why both exist:
 * authorization cannot see a coaching relationship, and conflict policy has no business
 * deciding who is an operator.
 *
 * Platform authority widens scope, never impartiality. A Platform operator who is affiliated
 * with either club is refused by the same conflict rule as a League operator. When a league
 * has no unconflicted admin, the escalation must go to another unconflicted Platform operator.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ exceptionId: string }> },
) {
  const { exceptionId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 8_192,
    invalidBodyError: 'Say what you decided.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'exception_ratify', limit: 30, windowSeconds: 300, identity: () => [exceptionId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const ref = adminDb.collection('matchOperationalExceptions').doc(exceptionId);
  const snapshot = await ref.get();
  if (!snapshot.exists) return Response.json({ error: 'Case not found.' }, { status: 404 });
  const exception = { id: snapshot.id, ...snapshot.data() } as MatchOperationalException;

  const permitted = await hasCapabilityOrPlatformGrant(
    actor.uid,
    { scopeType: 'league', scopeId: exception.leagueId },
    'league.result.resolve',
  );
  if (!permitted) return Response.json({ error: 'You do not adjudicate this league.' }, { status: 403 });

  if (exception.status === 'resolved' || exception.status === 'superseded') {
    return Response.json({ error: 'This case is closed.' }, { status: 409 });
  }

  const [conflict, isPlatform] = await Promise.all([
    resolveConflictContext({ principal: { principalType: 'user', userId: actor.uid }, matchId: exception.matchId }),
    hasCapability(actor.uid, { scopeType: 'platform', scopeId: 'global' }, 'platform.trust.decide'),
  ]);

  if (conflict.conflictWithMatch) {
    return Response.json({
      error: 'You are involved with one of these clubs. Record a proposal instead, and another unconflicted operator will decide.',
      conflictWithMatch: true,
      affiliatedTeamIds: conflict.affiliatedTeamIds,
    }, { status: 403 });
  }

  // Somebody has to have written a resolution. Ratifying an empty case would produce an
  // official record whose explanation is "an admin pressed a button".
  const resolution = data.decision === 'override' ? data.resolution : exception.proposedResolution;
  if (!resolution?.trim()) {
    return Response.json({ error: 'There is nothing to ratify. Record a resolution first.' }, { status: 409 });
  }

  await ref.update({
    status: 'resolved',
    ratifiedByUserId: actor.uid,
    ratifiedAt: new Date().toISOString(),
    ratifiedDecision: data.decision,
    resolution,
    ...(data.note ? { ratificationNote: data.note } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await adminDb.collection('adminAuditEvents').add({
    actorUserId: actor.uid,
    action: 'match_exception_ratified',
    targetCollection: 'matchOperationalExceptions',
    targetId: exceptionId,
    afterSummary: {
      decision: data.decision,
      // Recorded even when false, so the audit trail shows the check ran rather than leaving a
      // reader to infer it from an absence.
      ratifierConflicted: conflict.conflictWithMatch,
      viaPlatform: isPlatform,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ ok: true, exceptionId, status: 'resolved' });
}
