import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { enforceRateLimit, clientIpFrom, parseJsonBody } from '@/server/api/security';
import {
  hashSecret,
  lockoutState,
  mintSessionToken,
  recordFailedAttempt,
  secretMatches,
} from '@/server/matchOps/session';
import type { FieldManagerAssignment, MatchAccessSession } from '@/types';

export const runtime = 'nodejs';

/**
 * The only anonymous mutation endpoint on the platform, and treated accordingly.
 *
 * A Field Manager arrives holding two secrets that travelled by different routes: a bootstrap
 * secret in the link, and a PIN spoken aloud or sent in a second message. Neither alone is
 * enough. That split is what makes a forwarded WhatsApp message insufficient to capture
 * somebody else's match.
 *
 * ## Failing identically
 *
 * Every rejection returns the same status and the same sentence. Whether the assignment does
 * not exist, the window has not opened, the PIN was wrong, the assignment was revoked, or the
 * match has already been submitted, the caller learns nothing. A 404 for an unknown secret
 * and a 401 for a wrong PIN would turn this endpoint into a device for confirming that a
 * given link is real, which is the first step of using one you should not have.
 *
 * ## Rate limiting per assignment
 *
 * Lockout counts against the assignment, not the caller's IP. A stadium shares one hotspot,
 * so per-IP limiting punishes the wrong party and is evaded by a phone switching to mobile
 * data. A per-IP ceiling is still applied on top, as a blunt instrument against someone
 * enumerating secrets across many assignments.
 */

const bodySchema = z.object({
  bootstrapSecret: z.string().trim().min(16).max(200),
  pin: z.string().trim().regex(/^\d{4,8}$/),
  deviceFingerprint: z.string().trim().max(200).optional(),
});

/** The single response for every failure. Nothing here varies with the reason. */
function refuse() {
  return Response.json(
    { error: 'That link or PIN is not valid. Check the message your league sent you.' },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, bodySchema, { maxBytes: 1_024 });
  if ('response' in parsed) return refuse();
  const { bootstrapSecret, pin, deviceFingerprint } = parsed.data;

  /**
   * A global ceiling before anything is read.
   *
   * This runs before the assignment is even looked up, so somebody enumerating secrets is
   * stopped without being told whether any of them existed, and without costing a Firestore
   * read per guess.
   */
  const ipLimited = await enforceRateLimit({
    bucket: 'match_ops_auth_ip',
    identity: [clientIpFrom(request)],
    limit: 30,
    windowSeconds: 300,
  });
  if (ipLimited) return refuse();

  const now = new Date();
  const bootstrapTokenHash = hashSecret(bootstrapSecret);
  const matches = await adminDb
    .collection('matchAccessSessions')
    .where('bootstrapTokenHash', '==', bootstrapTokenHash)
    .limit(1)
    .get();

  const snapshot = matches.docs[0];
  if (!snapshot) return refuse();
  const session = { id: snapshot.id, ...snapshot.data() } as MatchAccessSession;

  // Per assignment, which is the limit that actually protects the PIN.
  const assignmentLimited = await enforceRateLimit({
    bucket: 'match_ops_auth_assignment',
    identity: [session.assignmentId],
    limit: 10,
    windowSeconds: 300,
  });
  if (assignmentLimited) return refuse();

  if (lockoutState(session, now).locked) return refuse();
  if (session.revokedAt) return refuse();
  if (Date.parse(session.expiresAt) <= now.getTime()) return refuse();
  // A bootstrap secret is single-use. Once exchanged it cannot mint a second session, so a
  // forwarded link is useless after the Field Manager has used it.
  if (session.bootstrapConsumedAt) return refuse();

  const assignmentSnapshot = await adminDb
    .collection('fieldManagerAssignments')
    .doc(session.assignmentId)
    .get();
  if (!assignmentSnapshot.exists) return refuse();
  const assignment = { id: assignmentSnapshot.id, ...assignmentSnapshot.data() } as FieldManagerAssignment;

  if (assignment.status === 'cancelled' || assignment.status === 'submitted') return refuse();
  if (Date.parse(assignment.accessStartsAt) > now.getTime()) return refuse();
  if (Date.parse(assignment.accessExpiresAt) <= now.getTime()) return refuse();

  if (!secretMatches(pin, session.pinHash, session.pinSalt)) {
    const { locked } = await recordFailedAttempt(session.id, session.attempts ?? 0, now);
    if (locked) {
      // A security event, because five wrong PINs on a real assignment is either a confused
      // Field Manager or somebody working through a guess space, and the league wants to know
      // which before kickoff rather than after.
      await adminDb.collection('securityEvents').add({
        type: 'match_ops_pin_lockout',
        assignmentId: session.assignmentId,
        matchId: session.matchId,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
    return refuse();
  }

  const sessionToken = mintSessionToken();
  await adminDb.collection('matchAccessSessions').doc(session.id).update({
    // Consumed, not deleted: the record of which link produced this session is part of the
    // audit trail for everything captured under it.
    bootstrapConsumedAt: now.toISOString(),
    sessionTokenHash: hashSecret(sessionToken),
    attempts: 0,
    lockedUntil: FieldValue.delete(),
    ...(deviceFingerprint ? { deviceFingerprintHash: hashSecret(deviceFingerprint) } : {}),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await adminDb.collection('fieldManagerAssignments').doc(session.assignmentId).update({
    status: assignment.status === 'assigned' ? 'accepted' : assignment.status,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return Response.json({
    ok: true,
    // Returned once and never stored in plaintext anywhere.
    sessionToken,
    matchId: session.matchId,
    expiresAt: session.expiresAt,
  });
}
