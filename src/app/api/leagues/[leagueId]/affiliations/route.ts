import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapabilityOrPlatformGrant } from '@/server/access/capabilities';
import type { TeamRelationship } from '@/types';

export const runtime = 'nodejs';

const RELATIONSHIPS: [TeamRelationship, ...TeamRelationship[]] = [
  'coach',
  'manager',
  'officer',
  'official',
  'player',
  'owner',
  'family',
];

const bodySchema = z.discriminatedUnion('action', [
  /**
   * "Which teams in this league are you involved with, in any capacity?"
   *
   * Asked at League Admin onboarding and annually thereafter. Declaring is a condition of
   * holding the assignment, which is governance rather than something this route enforces.
   */
  z.object({
    action: z.literal('declare'),
    affiliations: z.array(z.object({
      teamId: z.string().trim().min(1).max(180),
      relationship: z.enum(RELATIONSHIPS),
      seasonId: z.string().trim().max(180).optional(),
      note: z.string().trim().max(400).optional(),
    })).max(50),
  }),
  /** The league recording somebody else's affiliation, for example when assigning a Field Manager. */
  z.object({
    action: z.literal('record'),
    userId: z.string().trim().min(1).max(180),
    teamId: z.string().trim().min(1).max(180),
    relationship: z.enum(RELATIONSHIPS),
    seasonId: z.string().trim().max(180).optional(),
    note: z.string().trim().max(400).optional(),
  }),
  /** Ending one, which never deletes it: the period it covered is a fact about the past. */
  z.object({
    action: z.literal('end'),
    affiliationId: z.string().trim().min(1).max(220),
  }),
]);

/**
 * Deterministic, so re-declaring the same relationship updates one record rather than
 * accumulating duplicates every time the annual prompt is answered.
 */
function affiliationId(userId: string, teamId: string, relationship: string) {
  const key = createHash('sha256').update(`${userId}:${teamId}:${relationship}`).digest('hex').slice(0, 32);
  return `affiliation_${key}`;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params;
  const mutation = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 8_192,
    invalidBodyError: 'Invalid affiliation request.',
    accountClass: ['organization_operator', 'platform_operator'],
    rateLimit: { bucket: 'league_affiliations', limit: 20, windowSeconds: 60, identity: () => [leagueId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;
  const nowIso = new Date().toISOString();

  /**
   * Declaring is open to any league operator about themselves. Recording somebody else's
   * affiliation, and ending one, are league management.
   *
   * Note what is deliberately absent: no capability check reads `teamAffiliations`, and this
   * route never grants anything. An affiliation is evidence for conflict policy, and if it
   * ever became an input to an authorization decision it would have quietly turned into a
   * permission that anybody can award themselves by declaring it.
   */
  const permitted = await hasCapabilityOrPlatformGrant(
    actor.uid,
    { scopeType: 'league', scopeId: leagueId },
    data.action === 'declare' ? 'league.profile.manage' : 'league.team.manage',
  );
  if (!permitted) {
    return Response.json({ error: 'You do not operate this league.' }, { status: 403 });
  }

  if (data.action === 'end') {
    const ref = adminDb.collection('teamAffiliations').doc(data.affiliationId);
    const snapshot = await ref.get();
    if (!snapshot.exists || snapshot.data()?.leagueId !== leagueId) {
      return Response.json({ error: 'Affiliation not found in this league.' }, { status: 404 });
    }
    // Ended, never deleted. That this person was a coach at this club during this period is
    // a fact about the past, and a resolution decision made while it was live has to stay
    // explainable afterwards.
    await ref.update({ status: 'ended', effectiveTo: nowIso, updatedAt: FieldValue.serverTimestamp() });
    return Response.json({ ok: true, affiliationId: data.affiliationId, status: 'ended' });
  }

  const entries = data.action === 'declare'
    ? data.affiliations.map((entry) => ({ ...entry, userId: actor.uid, basis: 'declared' as const }))
    : [{
        teamId: data.teamId,
        relationship: data.relationship,
        seasonId: data.seasonId,
        note: data.note,
        userId: data.userId,
        basis: 'league_recorded' as const,
      }];

  const written: string[] = [];
  const batch = adminDb.batch();
  for (const entry of entries) {
    const id = affiliationId(entry.userId, entry.teamId, entry.relationship);
    batch.set(adminDb.collection('teamAffiliations').doc(id), {
      id,
      userId: entry.userId,
      teamId: entry.teamId,
      leagueId,
      ...(entry.seasonId ? { seasonId: entry.seasonId } : {}),
      relationship: entry.relationship,
      basis: entry.basis,
      declaredAt: nowIso,
      declaredByUserId: actor.uid,
      ...(entry.basis === 'league_recorded' ? { recordedByUserId: actor.uid } : {}),
      effectiveFrom: nowIso,
      effectiveTo: FieldValue.delete(),
      status: 'active',
      ...(entry.note ? { note: entry.note } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    written.push(id);
  }
  await batch.commit();

  return Response.json({ ok: true, affiliationIds: written });
}
