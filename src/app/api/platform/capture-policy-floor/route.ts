import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { CAPTURE_POLICIES } from '@/lib/capturePolicy';
import { decideCapturePolicyFloorChange } from '@/lib/platform/capturePolicyFloor';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { platformAuditEvent, refuse, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';

export const runtime = 'nodejs';

const schema = z.object({
  proposedFloor: z.enum(CAPTURE_POLICIES),
  expectedVersion: z.number().int().nonnegative(),
  reason: z.string().trim().min(4).max(500),
  typedConfirmation: z.literal('SET FLOOR'),
}).strict();

export async function POST(request: Request) {
  const parsed = await requireAuthenticatedMutation(request, schema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'A valid capture-policy floor change is required.',
    rateLimit: { bucket: 'platform_capture_policy_floor', limit: 10, windowSeconds: 300 },
  });
  if ('response' in parsed) return parsed.response;
  const body = parsed.data;
  const secured = await securePlatformCommand({
    actor: parsed.actor,
    command: 'integrity.capture_policy_floor.set',
    requiredCapability: 'platform.admin.manage',
    requireReason: true,
    reason: body.reason,
    handler: async ({ actor, requestId, reason }) => {
      const settingsRef = adminDb.collection('platformSettings').doc('global');
      let nextVersion = body.expectedVersion + 1;
      await adminDb.runTransaction(async (transaction) => {
        const settings = await transaction.get(settingsRef);
        const data = settings.data() ?? {};
        const actualVersion = Number(data.version ?? 0);
        const decision = decideCapturePolicyFloorChange({
          current: data.capturePolicyFloor,
          proposed: body.proposedFloor,
          expectedVersion: body.expectedVersion,
          actualVersion,
        });
        if (!decision.allowed || decision.nextVersion === undefined) refuse(decision.reason ?? 'The policy floor change is not allowed.', 409);
        nextVersion = decision.nextVersion;
        transaction.set(settingsRef, {
          capturePolicyFloor: body.proposedFloor,
          version: nextVersion,
          updatedAt: FieldValue.serverTimestamp(),
          updatedByUserId: actor.uid,
        }, { merge: true });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
          actor,
          requestId,
          action: 'platform.integrity.capture_policy_floor_changed',
          targetCollection: 'platformSettings',
          targetId: 'global',
          note: reason,
          beforeSummary: { capturePolicyFloor: decision.current, version: actualVersion },
          afterSummary: { capturePolicyFloor: body.proposedFloor, version: nextVersion, existingFixturesChanged: false },
        }));
      });
      return Response.json({ ok: true, capturePolicyFloor: body.proposedFloor, version: nextVersion, existingFixturesChanged: false, requestId });
    },
  });
  return 'response' in secured ? secured.response : secured.result;
}
