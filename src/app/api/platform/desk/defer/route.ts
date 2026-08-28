import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { platformAuditEvent, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';

export const runtime = 'nodejs';

const schema = z.object({
  caseId: z.string().trim().min(3).max(260),
  sourceCollection: z.string().trim().min(2).max(120),
  sourceId: z.string().trim().min(1).max(200),
  hours: z.union([z.literal(1), z.literal(24), z.literal(72), z.literal(168)]),
  reason: z.string().trim().min(4).max(500),
}).strict();

export async function POST(request: Request) {
  const parsed = await requireAuthenticatedMutation(request, schema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'A valid Desk deferral is required.',
    rateLimit: { bucket: 'platform_desk_defer', limit: 60, windowSeconds: 300 },
  });
  if ('response' in parsed) return parsed.response;
  const body = parsed.data;
  const secured = await securePlatformCommand({
    actor: parsed.actor,
    command: 'desk.case.defer',
    requiredCapability: 'platform.admin.manage',
    requireReason: true,
    reason: body.reason,
    handler: async ({ actor, requestId, reason }) => {
      const deferUntil = new Date(Date.now() + body.hours * 60 * 60_000).toISOString();
      const id = `defer_${createHash('sha256').update(`${actor.uid}:${body.caseId}`).digest('hex').slice(0, 32)}`;
      const deferralRef = adminDb.collection('platformCaseDeferrals').doc(id);
      await adminDb.runTransaction(async (transaction) => {
        transaction.set(deferralRef, {
          id,
          caseId: body.caseId,
          sourceCollection: body.sourceCollection,
          sourceId: body.sourceId,
          userId: actor.uid,
          reason,
          deferUntil,
          status: 'active',
          updatedAt: FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
          actor,
          requestId,
          action: 'platform.desk.case_deferred',
          targetCollection: 'platformCaseDeferrals',
          targetId: id,
          note: reason,
          afterSummary: { caseId: body.caseId, deferUntil },
        }));
      });
      return Response.json({ ok: true, id, caseId: body.caseId, deferUntil, requestId });
    },
  });
  return 'response' in secured ? secured.response : secured.result;
}
