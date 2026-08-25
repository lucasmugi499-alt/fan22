import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { resolveConflictContext } from '@/server/conflict/resolveConflictContext';
import type { MatchOperationalException } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  resolution: z.string().trim().min(10).max(2_000),
  evidenceRefs: z.array(z.string().trim().max(400)).max(10).default([]),
});

/**
 * A conflicted League Admin may prepare a decision. They may not make it.
 *
 * Escalation must not leave the person who knows the competition sitting idle while Platform
 * reconstructs context they do not have. So the work stays distributed and the decision stays
 * neutral: whoever is closest writes the reasoning and the evidence, and somebody unconflicted
 * ratifies or overrides it. Both halves are recorded, so the provenance shows who prepared a
 * resolution as well as who took responsibility for it.
 *
 * Available to a conflicted admin by design. This is the one route in the exception workflow
 * that does not care about conflict, and that is the point of having two.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ exceptionId: string }> },
) {
  const { exceptionId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 16_384,
    invalidBodyError: 'Say what should happen and why.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'exception_propose', limit: 30, windowSeconds: 300, identity: () => [exceptionId] },
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

  // Recorded on the case whether or not it is conflicting, because a reviewer six weeks later
  // is owed the state that was true when the proposal was written, not the state now.
  const conflict = await resolveConflictContext({
    principal: { principalType: 'user', userId: actor.uid },
    matchId: exception.matchId,
  });

  await ref.update({
    status: 'proposed',
    proposedByUserId: actor.uid,
    proposedResolution: data.resolution,
    proposedAt: new Date().toISOString(),
    proposedEvidenceRefs: data.evidenceRefs,
    conflictContext: {
      conflictWithMatch: conflict.conflictWithMatch,
      affiliatedTeamIds: conflict.affiliatedTeamIds,
      relationships: conflict.relationships,
      basis: conflict.basis,
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({
    ok: true,
    exceptionId,
    conflicted: conflict.conflictWithMatch,
    message: conflict.conflictWithMatch
      ? 'Proposal recorded. Another admin in your league, or Platform, will decide.'
      : 'Proposal recorded.',
  });
}
