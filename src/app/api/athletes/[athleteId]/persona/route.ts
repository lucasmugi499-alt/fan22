import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { hasCapability } from '@/server/access/capabilities';

export const runtime = 'nodejs';

/**
 * Everything an athlete may say about themselves, and nothing else.
 *
 * The absent fields are the point. There is no `legalName`, no `registeredPosition`, no
 * `teamId`, no `eligibility` and no `verified`, because those belong to the League and to the
 * truth engine. The schema is the enforcement: a request carrying one of them is rejected as
 * malformed rather than silently ignored, so an attempt to reach the sporting record through
 * this route fails loudly.
 */
const personaSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  bio: z.string().trim().max(600).optional(),
  avatarUrl: z.string().trim().url().max(600).optional(),
  coverUrl: z.string().trim().url().max(600).optional(),
  preferredPosition: z.string().trim().max(60).optional(),
  secondaryPreferredPosition: z.string().trim().max(60).optional(),
  heightCm: z.number().int().min(100).max(250).optional(),
  preferredFoot: z.enum(['left', 'right', 'both']).optional(),
  hometown: z.string().trim().max(120).optional(),
  socialLinks: z.array(z.object({
    label: z.string().trim().min(1).max(40),
    url: z.string().trim().url().max(400),
  })).max(6).optional(),
  contactPreference: z.enum(['none', 'league', 'public']).optional(),
}).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ athleteId: string }> },
) {
  const { athleteId } = await params;
  const mutation = await requireAuthenticatedMutation(request, personaSchema, {
    maxBytes: 8_192,
    invalidBodyError: 'Invalid profile update. Your registered name, position and team are managed by your league.',
    rateLimit: { bucket: 'athlete_persona', limit: 20, windowSeconds: 300, identity: () => [athleteId] },
  });
  if ('response' in mutation) return mutation.response;
  const { actor, data } = mutation;

  const permitted = await hasCapability(
    actor.uid,
    { scopeType: 'athlete', scopeId: athleteId },
    'athlete.persona.manage',
  );
  if (!permitted) {
    return Response.json({ error: 'Only the athlete who claimed this profile can edit it.' }, { status: 403 });
  }

  /**
   * The claim is re-checked against the persona document rather than trusted from the
   * capability alone.
   *
   * A capability says this account holds athlete-self authority in this athlete's scope. This
   * says the persona it is about to write is the one that account claimed. They should always
   * agree; if they ever stop agreeing, that is a projection bug, and the failure mode of
   * trusting the capability alone is one athlete editing another's public identity.
   */
  const personaRef = adminDb.collection('athletePersonas').doc(athleteId);
  const existing = await personaRef.get();
  if (existing.exists && existing.data()?.claimedByUserId !== actor.uid) {
    return Response.json({ error: 'This profile is claimed by another account.' }, { status: 403 });
  }
  if (!existing.exists) {
    return Response.json(
      { error: 'This athlete profile has not been claimed yet. Submit a claim first.' },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  // Merged, so an athlete editing one field does not clear the rest, and only the keys the
  // schema permits can reach the document at all.
  await personaRef.set({ ...data, athleteId, updatedAt: now, updatedAtServer: FieldValue.serverTimestamp() }, { merge: true });

  return Response.json({ ok: true, athleteId });
}
