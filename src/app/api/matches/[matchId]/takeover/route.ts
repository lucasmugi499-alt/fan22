import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { hashSecret, mintPin, mintSessionToken } from '@/server/matchOps/session';
import { initialClockState } from '@/lib/matchOps/clock';
import type { Match, MatchClockState } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  // Mandatory. A takeover displaces the only person who was actually watching, and a reviewer
  // six weeks later needs to know whether that was a dead battery or a disagreement.
  reason: z.string().trim().min(5).max(300),
});

/**
 * League Operations seizes a live match from a Field Manager whose device has failed.
 *
 * ## The fence
 *
 * The failure this exists to prevent: the phone dies at 62', the League takes over at 63',
 * and at 71' the original phone comes back on a borrowed charger holding nineteen queued
 * events. Without a fence those land in the official stream underneath the takeover's events,
 * out of order, anchored to a clock that has been replaced. It is the single most likely way
 * field capture produces a corrupt match.
 *
 * So `sessionGeneration` increments, the prior session is revoked, and the new session is
 * issued at the new generation. Events arriving later from the old generation are quarantined
 * rather than dropped or merged: dropping loses real observations from the only person who
 * was there, and auto-merging trusts two contradictory clocks.
 *
 * The response returns a session token directly rather than a link and a PIN. The League Admin
 * has already authenticated as themselves to reach this route, so a second factor would be
 * ceremony, and the emergency is happening now.
 */
export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 2_048,
    invalidBodyError: 'A takeover needs a reason.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'match_takeover', limit: 5, windowSeconds: 300, identity: () => [matchId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const matchSnapshot = await adminDb.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;

  const permitted = await hasCapabilityOrPlatformGrant(
    actor.uid,
    { scopeType: 'league', scopeId: match.leagueId },
    'league.match.takeover',
  );
  if (!permitted) {
    return Response.json({ error: 'Only this league can take over a match.' }, { status: 403 });
  }

  const now = new Date();
  const sessionToken = mintSessionToken();

  try {
    const generation = await adminDb.runTransaction(async (transaction) => {
      const clockRef = adminDb.collection('matchClockStates').doc(matchId);
      const [clockSnapshot, priorSessions] = await Promise.all([
        transaction.get(clockRef),
        transaction.get(
          adminDb.collection('matchAccessSessions').where('matchId', '==', matchId),
        ),
      ]);

      const clock = clockSnapshot.exists
        ? ({ id: clockSnapshot.id, ...clockSnapshot.data() } as MatchClockState)
        : initialClockState(matchId, 1, now.toISOString());

      if (clock.state === 'full_time') {
        throw new Error('This match has already finished. Use post-match entry instead.');
      }

      const nextGeneration = clock.sessionGeneration + 1;

      // Every prior session for this match is revoked, not merely the one believed to be
      // active. A match that has already been taken over once can have more than one stale
      // device holding a token.
      for (const doc of priorSessions.docs) {
        if (doc.data().revokedAt) continue;
        transaction.update(doc.ref, {
          revokedAt: now.toISOString(),
          revocationReason: data.reason,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const assignmentId = `${matchId}_takeover_${nextGeneration}`;
      transaction.set(adminDb.collection('fieldManagerAssignments').doc(assignmentId), {
        id: assignmentId,
        matchId,
        leagueId: match.leagueId,
        seasonId: match.seasonId,
        // The League Admin themselves, recorded as the operator. No Field Manager contact
        // record is invented for somebody who already has an account.
        fieldManagerId: `user:${actor.uid}`,
        assignedByUserId: actor.uid,
        status: 'in_progress',
        accessStartsAt: now.toISOString(),
        accessExpiresAt: new Date(now.getTime() + 5 * 60 * 60_000).toISOString(),
        declaredAffiliations: [],
        neutralityRequired: false,
        createdAt: now.toISOString(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(adminDb.collection('matchAccessSessions').doc(`${assignmentId}_session`), {
        id: `${assignmentId}_session`,
        matchId,
        assignmentId,
        // Consumed at creation: there is no link to exchange, so no bootstrap secret is ever
        // valid for this session.
        bootstrapTokenHash: hashSecret(mintPin() + assignmentId),
        bootstrapConsumedAt: now.toISOString(),
        sessionTokenHash: hashSecret(sessionToken),
        pinHash: hashSecret(mintPin()),
        pinSalt: '',
        attempts: 0,
        sessionGeneration: nextGeneration,
        issuedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 5 * 60 * 60_000).toISOString(),
      });

      transaction.set(clockRef, {
        ...clock,
        sessionGeneration: nextGeneration,
        version: clock.version + 1,
        updatedAt: now.toISOString(),
      });

      const exceptionId = `${matchId}_takeover_occurred`;
      transaction.set(adminDb.collection('matchOperationalExceptions').doc(exceptionId), {
        id: exceptionId,
        matchId,
        leagueId: match.leagueId,
        code: 'takeover_occurred',
        // Non-blocking: a takeover is a legitimate operational act, and a match captured
        // through one is still a captured match. It lowers the quality tier, not the result.
        blocking: false,
        detail: { reason: data.reason, byUserId: actor.uid, generation: nextGeneration },
        status: 'open',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      }, { merge: true });

      return nextGeneration;
    });

    return Response.json({
      ok: true,
      sessionToken,
      sessionGeneration: generation,
      matchId,
      message: 'You are now running this match. The previous device can no longer record events.',
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'The takeover could not be completed.' },
      { status: 409 },
    );
  }
}
