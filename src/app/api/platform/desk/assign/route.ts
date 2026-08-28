import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { platformAuditEvent, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';

export const runtime = 'nodejs';

/**
 * Claims a case, or puts it back.
 *
 * The Desk shipped with a `Mine` filter and a `assignedToUserId` it could read but nothing
 * could write, so the filter was permanently empty and two operators working the same queue
 * had no way to divide it. Both would open the same escalation, and the second would discover
 * it was already decided.
 *
 * Assignment is written onto the source record rather than into a side table, because every
 * other reader of that record — the league's own view of its exception, a later audit — should
 * see who picked it up. A claim is not private Desk state.
 *
 * Deliberately not a lock. An operator who claims a case and goes home must not be able to
 * freeze it, so a claim can always be taken over; the audit trail records that it happened
 * rather than the system refusing.
 */
const ASSIGNABLE_COLLECTIONS = new Set([
  'leagueAdminApplications',
  'athletes',
  'matchOperationalExceptions',
  'reconciliationExceptions',
  'reports',
  'athletePayees',
  'settlements',
  'finalizations',
]);

const schema = z.object({
  caseId: z.string().trim().min(3).max(260),
  sourceCollection: z.string().trim().min(2).max(120),
  sourceId: z.string().trim().min(1).max(200),
  /** `claim` takes it, `release` returns it to the pool. */
  action: z.enum(['claim', 'release']),
  reason: z.string().trim().max(500).optional().default(''),
}).strict();

export async function POST(request: Request) {
  const parsed = await requireAuthenticatedMutation(request, schema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'A valid Desk assignment is required.',
    rateLimit: { bucket: 'platform_desk_assign', limit: 120, windowSeconds: 300 },
  });
  if ('response' in parsed) return parsed.response;
  const body = parsed.data;

  /*
   * The collection is named by the client, so it is checked against a list rather than
   * trusted. Without this, a caller could write an `assignedToUserId` onto any document in
   * the database through a route that only means to touch a case.
   */
  if (!ASSIGNABLE_COLLECTIONS.has(body.sourceCollection)) {
    return Response.json({ error: 'That record is not a Desk case.' }, { status: 400 });
  }

  const secured = await securePlatformCommand({
    actor: parsed.actor,
    command: 'desk.case.assign',
    requiredCapability: 'platform.admin.manage',
    requireReason: false,
    reason: body.reason,
    handler: async ({ actor, requestId, reason }) => {
      const ref = adminDb.collection(body.sourceCollection).doc(body.sourceId);
      const outcome = await adminDb.runTransaction(async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists) return { missing: true as const };
        const before = snapshot.data() ?? {};
        const previous = typeof before.assignedToUserId === 'string' ? before.assignedToUserId : null;

        /*
         * Taking or clearing someone else's claim is permitted and recorded as a takeover.
         * Refusing would leave a stale claim unclearable whenever an operator is unavailable,
         * which is exactly when the queue most needs to move.
         */
        const assignedToUserId = body.action === 'claim' ? actor.uid : null;
        transaction.update(ref, {
          assignedToUserId,
          assignedAt: body.action === 'claim' ? FieldValue.serverTimestamp() : FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
          actor,
          requestId,
          action: body.action === 'claim' ? 'platform.desk.case_claimed' : 'platform.desk.case_released',
          targetCollection: body.sourceCollection,
          targetId: body.sourceId,
          note: reason,
          beforeSummary: { assignedToUserId: previous },
          afterSummary: {
            assignedToUserId,
            caseId: body.caseId,
            // Names the case where one operator took another's claim, which is the only
            // form of contention this route allows.
            takenFrom: previous && previous !== actor.uid ? previous : undefined,
          },
        }));
        return { missing: false as const, previous, assignedToUserId };
      });

      if (outcome.missing) {
        return Response.json({ error: 'That case no longer exists.' }, { status: 404 });
      }
      return Response.json({
        ok: true,
        caseId: body.caseId,
        assignedToUserId: outcome.assignedToUserId,
        takenFrom: outcome.previous && outcome.previous !== parsed.actor.uid ? outcome.previous : null,
        requestId,
      });
    },
  });
  return 'response' in secured ? secured.response : secured.result;
}
