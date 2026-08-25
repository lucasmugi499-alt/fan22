import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import { activeAffiliationsForUser } from '@/server/conflict/resolveConflictContext';
import { hashSecret, mintBootstrapSecret, mintPin } from '@/server/matchOps/session';
import type { Match } from '@/types';

export const runtime = 'nodejs';

const bodySchema = z.object({
  fieldManagerId: z.string().trim().max(180).optional(),
  displayName: z.string().trim().min(2).max(80),
  phone: z.string().trim().min(6).max(24),
  /** Clubs this observer is involved with. Recorded either way; see below. */
  declaredAffiliations: z.array(z.string().trim().min(1).max(180)).max(10).default([]),
  /** Optional link to a platform account, so a declared conflict can be looked up. */
  userId: z.string().trim().max(180).optional(),
});

/**
 * Assign a Field Manager and mint their two secrets.
 *
 * The secrets are returned once, here, and never again. Only hashes are stored, so a league
 * that loses the message has to reissue rather than retrieve: a system that can show you the
 * PIN again is a system where a database dump is a set of live match credentials.
 *
 * The access window opens two hours before kickoff and closes five after. Outside it the link
 * is inert, which bounds the damage from a forwarded message to the afternoon of the match.
 */
export async function POST(request: Request, { params }: { params: Promise<{ matchId: string }> }) {
  const { matchId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4_096,
    invalidBodyError: 'A Field Manager needs a name and a phone number.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'field_manager_assignment', limit: 20, windowSeconds: 300, identity: () => [matchId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const matchSnapshot = await adminDb.collection('matches').doc(matchId).get();
  if (!matchSnapshot.exists) return Response.json({ error: 'Match not found.' }, { status: 404 });
  const match = { id: matchSnapshot.id, ...matchSnapshot.data() } as Match;

  const permitted = await hasCapabilityOrPlatformGrant(
    actor.uid,
    { scopeType: 'league', scopeId: match.leagueId },
    'league.field_manager.manage',
  );
  if (!permitted) {
    return Response.json({ error: 'Only this league can assign a Field Manager.' }, { status: 403 });
  }

  const season = await adminDb.collection('seasons').doc(match.seasonId).get();
  const neutralityRequired = Boolean(season.data()?.neutralFieldManagerRequired);

  /**
   * Declared affiliations, from the assignment and from anything already on record.
   *
   * An affiliated Field Manager is not automatically disqualified. In grassroots reality the
   * only person present with a working phone may be an assistant coach, and a rule that
   * refused them would mean the match goes unrecorded rather than recorded with a caveat.
   *
   * What is not permitted is hiding it. The affiliation is stored on the assignment, carried
   * into the report's provenance, and lowers the data-quality tier, so a capture by an
   * involved observer is labelled rather than indistinguishable from a neutral one.
   */
  const recorded = data.userId ? await activeAffiliationsForUser(data.userId) : [];
  const affiliations = [...new Set([
    ...data.declaredAffiliations,
    ...recorded.map((affiliation) => affiliation.teamId),
  ])];
  const conflicting = affiliations.filter((teamId) => teamId === match.homeTeamId || teamId === match.awayTeamId);

  if (neutralityRequired && conflicting.length) {
    return Response.json({
      error: 'This competition requires a neutral Field Manager, and this person is involved with one of these clubs.',
      conflictingTeamIds: conflicting,
    }, { status: 409 });
  }

  const kickoff = Date.parse(match.scheduledAt);
  if (Number.isNaN(kickoff)) {
    return Response.json({ error: 'This fixture has no valid kickoff time.' }, { status: 409 });
  }

  const now = new Date();
  const assignmentRef = adminDb.collection('fieldManagerAssignments').doc(`${matchId}_assignment`);
  const fieldManagerRef = data.fieldManagerId
    ? adminDb.collection('fieldManagers').doc(data.fieldManagerId)
    : adminDb.collection('fieldManagers').doc();

  const bootstrapSecret = mintBootstrapSecret();
  const pin = mintPin();
  const pinSalt = mintBootstrapSecret().slice(0, 16);

  const accessStartsAt = new Date(kickoff - 2 * 60 * 60_000).toISOString();
  const accessExpiresAt = new Date(kickoff + 5 * 60 * 60_000).toISOString();

  const batch = adminDb.batch();
  batch.set(fieldManagerRef, {
    id: fieldManagerRef.id,
    leagueId: match.leagueId,
    displayName: data.displayName,
    phone: data.phone,
    createdByUserId: actor.uid,
    createdAt: now.toISOString(),
    status: 'active',
  }, { merge: true });

  batch.set(assignmentRef, {
    id: assignmentRef.id,
    matchId,
    leagueId: match.leagueId,
    seasonId: match.seasonId,
    fieldManagerId: fieldManagerRef.id,
    assignedByUserId: actor.uid,
    status: 'assigned',
    accessStartsAt,
    accessExpiresAt,
    declaredAffiliations: affiliations,
    neutralityRequired,
    createdAt: now.toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  batch.set(adminDb.collection('matchAccessSessions').doc(`${assignmentRef.id}_session`), {
    id: `${assignmentRef.id}_session`,
    matchId,
    assignmentId: assignmentRef.id,
    // Hashes only. Never the plaintext link, never the plaintext PIN, never the token.
    bootstrapTokenHash: hashSecret(bootstrapSecret),
    pinHash: hashSecret(pin, pinSalt),
    pinSalt,
    attempts: 0,
    sessionGeneration: 1,
    issuedAt: now.toISOString(),
    expiresAt: accessExpiresAt,
  }, { merge: false });

  if (conflicting.length) {
    const exceptionId = `${matchId}_affiliated_observer`;
    batch.set(adminDb.collection('matchOperationalExceptions').doc(exceptionId), {
      id: exceptionId,
      matchId,
      leagueId: match.leagueId,
      code: 'affiliated_observer',
      blocking: false,
      detail: { conflictingTeamIds: conflicting, fieldManagerId: fieldManagerRef.id },
      status: 'open',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }, { merge: true });
  }
  await batch.commit();

  return Response.json({
    ok: true,
    assignmentId: assignmentRef.id,
    fieldManagerId: fieldManagerRef.id,
    // Shown once. Send the link and the PIN by different routes: the split is what makes a
    // forwarded message insufficient on its own.
    accessLink: `/m/${bootstrapSecret}`,
    pin,
    accessStartsAt,
    accessExpiresAt,
    affiliationRecorded: conflicting.length > 0,
  });
}
