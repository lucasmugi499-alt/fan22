import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { requireAuthenticatedMutation } from '@/server/api/security';
import { platformAuditEvent, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';
import { environmentReadiness, routingMechanismAvailable } from '@/server/platform/environmentReadiness';
import { decideActivationTransition, type ActivationRequest } from '@/lib/platform/environmentActivation';

export const runtime = 'nodejs';

/**
 * The guarded activation workflow. Records intent and approvals; it never moves traffic.
 *
 * There is no endpoint here that switches an environment, because nothing in this
 * deployment can. What this does is make the human process reviewable: readiness measured
 * rather than asserted, a second operator's approval, typed confirmation on each forward
 * step, and an immutable audit entry per transition.
 *
 * The workflow deliberately cannot complete today. It reaches `routing_pending` and stops,
 * which is the truthful state — the outstanding step needs infrastructure, not a click.
 */
const bodySchema = z.union([
  z.object({
    action: z.literal('open'),
    environment: z.enum(['beta', 'production']),
  }),
  z.object({
    action: z.enum([
      'record_readiness',
      'approve',
      'request_maintenance',
      'issue_routing_instruction',
      'confirm_smoke',
      'complete',
      'abandon',
    ]),
    requestId: z.string().trim().min(1).max(200),
    typedConfirmation: z.string().trim().max(40).optional(),
    note: z.string().trim().max(1500).optional(),
  }),
]);

export async function POST(request: Request) {
  const guarded = await requireAuthenticatedMutation(request, bodySchema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'An activation action is required.',
    rateLimit: { bucket: 'environment_activation', limit: 30, windowSeconds: 300 },
  });
  if ('response' in guarded) return guarded.response;

  const outcome = await securePlatformCommand({
    actor: guarded.actor,
    command: 'environment.activation',
    // Governance-only, and deliberately not folded into platform.admin.manage: moving an
    // environment is the most consequential act available on this platform.
    requiredCapability: 'platform.environment.activate',
    requireReason: true,
    reason: guarded.data.action === 'open' ? `Open activation request for ${guarded.data.environment}` : guarded.data.note,
    handler: async ({ actor, requestId, reason }) => {
      const collection = adminDb.collection('environmentActivations');

      if (guarded.data.action === 'open') {
        const id = `activation_${guarded.data.environment}_${randomUUID()}`;
        const now = new Date().toISOString();
        const record: ActivationRequest = {
          id,
          environment: guarded.data.environment,
          stage: 'draft',
          requestedByUserId: actor.uid,
          createdAt: now,
          updatedAt: now,
        };
        await collection.doc(id).create(record);
        await adminDb.collection('adminAuditEvents').add({
          ...platformAuditEvent({
            actor, requestId,
            action: 'environment.activation.opened',
            targetCollection: 'environmentActivations',
            targetId: id,
            note: reason,
            afterSummary: { stage: 'draft', environment: guarded.data.environment },
          }),
          createdAt: FieldValue.serverTimestamp(),
        });
        return { requestId: id, stage: 'draft' as const };
      }

      const ref = collection.doc(guarded.data.requestId);
      const snapshot = await ref.get();
      if (!snapshot.exists) throw new Error('Activation request not found.');
      const current = snapshot.data() as ActivationRequest;

      // Readiness is re-measured at the moment of the transition, never trusted from when
      // the request was opened. Configuration can change underneath a pending approval.
      const readiness = await environmentReadiness(current.environment, routingMechanismAvailable());

      const decision = decideActivationTransition({
        request: {
          stage: current.stage,
          environment: current.environment,
          requestedByUserId: current.requestedByUserId,
          readinessBlockers: guarded.data.action === 'approve' ? readiness.blockers : current.readinessBlockers,
        },
        action: guarded.data.action,
        actorUserId: actor.uid,
        typedConfirmation: guarded.data.typedConfirmation,
        routingAvailable: routingMechanismAvailable(),
      });
      if (!decision.ok) throw new Error(decision.reason);

      const now = new Date().toISOString();
      const patch: Record<string, unknown> = { stage: decision.nextStage, updatedAt: now };
      if (guarded.data.action === 'record_readiness') patch.readinessBlockers = readiness.blockers;
      if (guarded.data.action === 'approve') patch.approvedByUserId = actor.uid;
      await ref.update(patch);

      await adminDb.collection('adminAuditEvents').add({
        ...platformAuditEvent({
          actor, requestId,
          action: `environment.activation.${guarded.data.action}`,
          targetCollection: 'environmentActivations',
          targetId: guarded.data.requestId,
          note: reason,
          beforeSummary: { stage: current.stage },
          afterSummary: { stage: decision.nextStage },
        }),
        environment: current.environment,
        // Stated on every entry so the audit trail can never be read as evidence that
        // traffic moved.
        trafficMoved: false,
        createdAt: FieldValue.serverTimestamp(),
      });

      return { requestId: guarded.data.requestId, stage: decision.nextStage };
    },
  });

  if ('response' in outcome) return outcome.response;
  return Response.json({ ok: true, ...outcome.result });
}
