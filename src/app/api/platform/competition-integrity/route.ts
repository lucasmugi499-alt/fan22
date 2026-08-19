import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { platformAuditEvent, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';

export const runtime = 'nodejs';

/**
 * Platform workflow actions on a competition-integrity case.
 *
 * Deliberately narrow. Platform may acknowledge, escalate or close the OPERATIONAL item;
 * it may not decide the sporting outcome. There is no score field here and no path to one:
 * a wrong result is corrected by the governing League through the correction route, which
 * re-runs the finalizer and produces a new official version with its own audit trail.
 *
 * Letting a Platform Admin "resolve" a case by editing a score would put official sporting
 * truth behind a support workflow and give two different authorities the power to decide
 * the same fact — the split this whole access migration exists to remove.
 */
const bodySchema = z.object({
  exceptionId: z.string().trim().min(1).max(200),
  status: z.enum(['acknowledged', 'escalated', 'resolved']),
  note: z.string().trim().max(1500).optional(),
});

export async function POST(request: Request) {
  const guarded = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'A case id and a workflow status are required.',
    rateLimit: { bucket: 'competition_integrity_action', limit: 40, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;

  const outcome = await securePlatformCommand({
    actor: guarded.actor,
    command: 'competition_integrity.case_transition',
    // Deciding a trust case is the capability this is, so it asks for exactly that rather
    // than a broad administration grant.
    requiredCapability: 'platform.trust.decide',
    // Closing or escalating a blocked official result is a governance act, so it carries a
    // written reason.
    requireReason: true,
    reason: guarded.data.note,
    handler: async ({ actor, requestId, reason }) => {
      const ref = adminDb.collection('reconciliationExceptions').doc(guarded.data.exceptionId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new Error('Competition integrity case not found.');
      const current = snapshot.data() ?? {};
      if (current.status === 'superseded') {
        throw new Error('A superseded case cannot be transitioned.');
      }

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = {
        status: guarded.data.status,
        workflowNote: reason,
        updatedAt: now,
      };
      if (guarded.data.status === 'acknowledged') {
        patch.acknowledgedByUserId = actor.uid;
        patch.acknowledgedAt = now;
      }
      if (guarded.data.status === 'resolved') {
        patch.resolvedByUserId = actor.uid;
        patch.resolvedAt = now;
      }
      await ref.update(patch);

      // Immutable evidence of who moved the case and why. The sporting record is
      // untouched, and this says so explicitly.
      await adminDb.collection('adminAuditEvents').add({
        ...platformAuditEvent({
          actor,
          requestId,
          action: `competition_integrity.${guarded.data.status}`,
          targetCollection: 'reconciliationExceptions',
          targetId: guarded.data.exceptionId,
          note: reason,
          beforeSummary: { status: current.status ?? 'open' },
          afterSummary: { status: guarded.data.status },
        }),
        matchId: current.matchId ?? null,
        leagueId: current.leagueId ?? null,
        sportingRecordChanged: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      return { exceptionId: guarded.data.exceptionId, status: guarded.data.status };
    },
  });

  if ('response' in outcome) return outcome.response;
  return Response.json({ ok: true, ...outcome.result });
}
