import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { hasCapability } from '@/server/access/capabilities';
import {
  jsonError,
  requireAuthenticatedMutation,
  requireAuthenticatedUser,
  type AuthenticatedActor,
} from '@/server/api/security';
import { platformAuditEvent } from '@/server/platform/commands/securePlatformCommand';
import {
  decidePayeeTransition,
  emptyPayeeRecord,
  redactPayee,
  type AthletePayeeRecord,
  type PayeeAuthority,
} from '@/lib/platform/athletePayee';

export const runtime = 'nodejs';

/**
 * Athlete payout identity.
 *
 * This route is the reason athletes can be managed profiles without that becoming a fraud
 * model. Everything else about an athlete is written by their club; the destination of their
 * money is not, and the split is enforced here rather than trusted to UI that hides a button.
 *
 * Two things are deliberately true of every response:
 *
 *  - Payout details are never returned. Not to the team, not to the league, not to the
 *    platform operator who verified them. The record answers "can this athlete be paid",
 *    which is the only question any surface actually needs, and the details themselves exist
 *    to be handed to the payment provider and nowhere else.
 *  - Details are never written to the audit trail. A fingerprint proves the destination
 *    changed between two points in time without turning the audit log into the second place
 *    account numbers are stored.
 */

const PLATFORM_SCOPE = { scopeType: 'platform', scopeId: 'global' } as const;

const payoutDetailsSchema = z.object({
  method: z.enum(['mobile_money', 'bank']),
  accountName: z.string().trim().min(2).max(120),
  accountIdentifier: z.string().trim().min(4).max(64),
  provider: z.string().trim().min(2).max(60),
}).strict();

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('invite'),
    athleteId: z.string().trim().min(1).max(200),
    note: z.string().trim().min(4).max(500),
  }),
  z.object({
    action: z.literal('submit'),
    athleteId: z.string().trim().min(1).max(200),
    note: z.string().trim().min(4).max(500),
    payoutDetails: payoutDetailsSchema,
    /** Required when a platform operator submits for an athlete who cannot self-serve. */
    evidenceRefs: z.array(z.string().trim().min(1).max(400)).max(10).optional(),
  }),
  z.object({
    action: z.enum(['verify', 'reject', 'suspend', 'reinstate']),
    athleteId: z.string().trim().min(1).max(200),
    note: z.string().trim().min(4).max(500),
  }),
]);

/**
 * The authority an actor holds over THIS athlete's money, resolved from capabilities rather
 * than from the role label on their account.
 *
 * Ordered most-specific-first so an operator who also happens to manage the club is treated
 * as platform, not as a team — otherwise the two-person rule could be sidestepped by whoever
 * held both hats.
 */
async function resolveAuthority(
  actor: AuthenticatedActor,
  athlete: FirebaseFirestore.DocumentData,
  athleteId: string,
): Promise<PayeeAuthority | null> {
  if (await hasCapability(actor.uid, PLATFORM_SCOPE, 'platform.payee.verify')) return 'platform';

  const selfOrGuardian = await hasCapability(
    actor.uid,
    { scopeType: 'athlete', scopeId: athleteId },
    'athlete.payee.submit',
  );
  if (selfOrGuardian) {
    // The claimed profile points back at the user, which is what separates the athlete from
    // a guardian holding the same capability on someone else's behalf.
    return athlete.userId === actor.uid ? 'athlete' : 'guardian';
  }

  if (typeof athlete.teamId === 'string' && athlete.teamId
    && await hasCapability(actor.uid, { scopeType: 'team', scopeId: athlete.teamId }, 'team.roster.manage')) {
    return 'team';
  }
  if (typeof athlete.leagueId === 'string' && athlete.leagueId
    && await hasCapability(actor.uid, { scopeType: 'league', scopeId: athlete.leagueId }, 'league.roster.verify')) {
    return 'league';
  }
  return null;
}

function fingerprint(details: z.infer<typeof payoutDetailsSchema>) {
  // Normalized before hashing so a re-typed identifier with different spacing or case does
  // not read as a change of destination.
  const normalized = [
    details.method,
    details.provider.trim().toLowerCase(),
    details.accountIdentifier.replace(/[\s-]/g, '').toLowerCase(),
  ].join('|');
  return `sha256:${createHash('sha256').update(normalized).digest('hex').slice(0, 32)}`;
}

async function loadAthlete(athleteId: string) {
  const snapshot = await adminDb.collection('athletes').doc(athleteId).get();
  return snapshot.exists ? snapshot.data() ?? {} : null;
}

export async function GET(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;
  const athleteId = new URL(request.url).searchParams.get('athleteId')?.trim();
  if (!athleteId) return jsonError('An athleteId is required.', 400);

  const athlete = await loadAthlete(athleteId);
  if (!athlete) return jsonError('Athlete not found.', 404);

  const authority = await resolveAuthority(auth.actor, athlete, athleteId);
  if (!authority) return jsonError('You have no authority over this athlete’s payout identity.', 403);

  const snapshot = await adminDb.collection('athletePayees').doc(athleteId).get();
  const record = snapshot.exists
    ? (snapshot.data() as AthletePayeeRecord)
    : emptyPayeeRecord(athleteId, new Date().toISOString());

  // Redacted for everyone, including platform. A team learns whether to chase the athlete
  // for details; nobody learns the details from this route.
  return Response.json(
    { authority, payee: redactPayee(record) },
    { headers: { 'cache-control': 'no-store' } },
  );
}

export async function POST(request: Request) {
  const guarded = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 8 * 1024,
    invalidBodyError: 'A payee action is required.',
    rateLimit: { bucket: 'athlete_payee', limit: 20, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;
  const { actor, requestId } = guarded;
  const body = guarded.data;

  const athlete = await loadAthlete(body.athleteId);
  if (!athlete) return jsonError('Athlete not found.', 404);

  const authority = await resolveAuthority(actor, athlete, body.athleteId);
  if (!authority) return jsonError('You have no authority over this athlete’s payout identity.', 403);

  const ref = adminDb.collection('athletePayees').doc(body.athleteId);
  const now = new Date().toISOString();
  const snapshot = await ref.get();
  const record = snapshot.exists
    ? (snapshot.data() as AthletePayeeRecord)
    : emptyPayeeRecord(body.athleteId, now);

  const source = body.action === 'submit'
    ? (authority === 'platform' ? 'platform_assisted' as const : 'portal' as const)
    : undefined;

  const decision = decidePayeeTransition({
    record,
    action: body.action,
    authority,
    actorUserId: actor.uid,
    source,
    evidenceRefs: body.action === 'submit' ? body.evidenceRefs : undefined,
  });
  if (!decision.ok) return jsonError(decision.reason, 403);

  const patch: Record<string, unknown> = {
    athleteId: body.athleteId,
    status: decision.nextStatus,
    createdAt: record.createdAt,
    updatedAt: now,
  };

  if (body.action === 'invite') {
    patch.invitedByUserId = actor.uid;
    patch.invitedAt = now;
  }

  if (body.action === 'submit') {
    patch.submittedByUserId = actor.uid;
    patch.submittedVia = source;
    patch.submittedAt = now;
    patch.detailsFingerprint = fingerprint(body.payoutDetails);
    patch.payoutDetails = body.payoutDetails;
    if (body.evidenceRefs?.length) patch.evidenceRefs = body.evidenceRefs;
    // A resubmission invalidates the previous attestation. Leaving the old verifier on the
    // record would make new details look already checked.
    patch.verifiedByUserId = FieldValue.delete();
    patch.verifiedAt = FieldValue.delete();
    patch.rejectionReason = FieldValue.delete();
  }

  if (body.action === 'verify') {
    patch.verifiedByUserId = actor.uid;
    patch.verifiedAt = now;
    patch.rejectionReason = FieldValue.delete();
  }

  if (body.action === 'reject') {
    patch.rejectionReason = body.note;
  }

  await ref.set(patch, { merge: true });

  await adminDb.collection('adminAuditEvents').add({
    ...platformAuditEvent({
      actor,
      requestId,
      action: `platform.payee.${body.action}`,
      targetCollection: 'athletePayees',
      targetId: body.athleteId,
      note: body.note,
      beforeSummary: { status: record.status, detailsFingerprint: record.detailsFingerprint ?? null },
      // The fingerprint, never the details: enough to prove the destination changed, not
      // enough to be a second copy of it.
      afterSummary: {
        status: decision.nextStatus,
        detailsFingerprint: (patch.detailsFingerprint as string | undefined) ?? record.detailsFingerprint ?? null,
        authority,
        ...(source ? { submittedVia: source } : {}),
      },
    }),
    createdAt: FieldValue.serverTimestamp(),
  });

  return Response.json({ ok: true, status: decision.nextStatus });
}
