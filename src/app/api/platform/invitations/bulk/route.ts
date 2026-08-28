import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { validateInvitationDeliveryRows } from '@/lib/platform/invitationImport';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { PlatformCommandRefusal, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';
import { resendAccessInvitation } from '@/server/platform/invitations/resendInvitation';

export const runtime = 'nodejs';

const rawRows = z.array(z.record(z.string(), z.unknown())).max(150);
const schema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('preview'), rows: rawRows }),
  z.object({
    mode: z.literal('execute'),
    rows: rawRows,
    reason: z.string().trim().min(4).max(500),
    typedConfirmation: z.literal('SEND BATCH'),
  }),
]);

async function liveRows(rows: ReturnType<typeof validateInvitationDeliveryRows>['validRows']) {
  return Promise.all(rows.map(async (row) => {
    const snapshot = await adminDb.collection('invitations').doc(row.invitationId).get().catch(() => null);
    if (!snapshot?.exists) return { ...row, valid: false as const, error: 'Invitation not found.' };
    const data = snapshot.data() ?? {};
    if (['accepted', 'revoked', 'superseded'].includes(String(data.status))) {
      return { ...row, valid: false as const, error: 'Invitation is already closed.' };
    }
    if (typeof data.invitedEmail !== 'string' || !data.invitedEmail) {
      return { ...row, valid: false as const, error: 'Invitation has no email destination.' };
    }
    return {
      ...row,
      valid: true as const,
      invitedEmail: data.invitedEmail,
      currentStatus: String(data.status ?? 'unknown'),
    };
  }));
}

/** CSV preview and execution share both the pure validator and the live-state filter. */
export async function POST(request: Request) {
  const parsed = await requireAuthenticatedMutation(request, schema, {
    maxBytes: 64 * 1024,
    invalidBodyError: 'A valid invitation delivery batch is required.',
    rateLimit: { bucket: 'platform_invitation_bulk', limit: 10, windowSeconds: 300 },
  });
  if ('response' in parsed) return parsed.response;
  const validation = validateInvitationDeliveryRows(parsed.data.rows);
  const secured = await securePlatformCommand({
    actor: parsed.actor,
    command: 'invitation.bulk_resend',
    requiredCapability: 'platform.access.manage',
    requireReason: parsed.data.mode === 'execute',
    reason: parsed.data.mode === 'execute' ? parsed.data.reason : undefined,
    handler: async ({ actor, requestId, reason }) => {
      const checked = await liveRows(validation.validRows);
      const valid = checked.filter((row): row is Extract<(typeof checked)[number], { valid: true }> => row.valid);
      const liveErrors = checked.filter((row) => !row.valid).map((row) => ({ rowNumber: row.rowNumber, field: 'invitationId', message: row.error }));
      const preview = {
        rows: checked,
        validCount: valid.length,
        errorCount: validation.errors.length + liveErrors.length,
        errors: [...validation.errors, ...liveErrors],
      };
      if (parsed.data.mode === 'preview') return Response.json({ mode: 'preview', preview }, { headers: { 'cache-control': 'no-store' } });
      if (preview.errorCount) {
        return Response.json({ error: 'Resolve every row error before sending this batch.', preview }, { status: 409 });
      }
      const results = [];
      for (const row of valid) {
        try {
          const result = await resendAccessInvitation({
            request,
            invitationId: row.invitationId,
            actor,
            requestId: `${requestId}_row_${row.rowNumber}`,
            reason,
            channel: 'email',
          });
          results.push({ rowNumber: row.rowNumber, ok: true, ...result });
        } catch (cause) {
          results.push({
            rowNumber: row.rowNumber,
            invitationId: row.invitationId,
            ok: false,
            error: cause instanceof PlatformCommandRefusal ? cause.message : 'Delivery attempt failed unexpectedly.',
          });
        }
      }
      return Response.json({
        mode: 'execute',
        attempted: results.length,
        succeeded: results.filter((result) => result.ok).length,
        failed: results.filter((result) => !result.ok).length,
        results,
      });
    },
  });
  return 'response' in secured ? secured.response : secured.result;
}
