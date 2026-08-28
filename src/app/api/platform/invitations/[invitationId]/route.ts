import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId } from '@/lib/auth/access';
import { resolveAccountClass } from '@/lib/auth/accountClass';
import { indexGrantsCapability } from '@/server/access/capabilities';
import { requireActivePrincipal, requireAuthenticatedMutation, requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { platformAuditEvent, refuse, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';
import { resendAccessInvitation } from '@/server/platform/invitations/resendInvitation';

export const runtime = 'nodejs';

const mutationSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('resend'), channel: z.literal('email'), reason: z.string().trim().min(4).max(500) }),
  z.object({ action: z.literal('revoke'), reason: z.string().trim().min(4).max(500) }),
]);

function safeInvitation(id: string, data: FirebaseFirestore.DocumentData) {
  const expired = data.expiresAt && Date.parse(String(data.expiresAt)) <= Date.now()
    && !['accepted', 'revoked', 'superseded'].includes(String(data.status));
  return {
    id,
    type: data.type,
    invitedEmail: data.invitedEmail,
    invitedPhone: data.invitedPhone,
    roleKey: data.roleKey,
    scopeType: data.scopeType,
    scopeId: data.scopeId,
    applicationId: data.applicationId,
    organizationId: data.organizationId,
    leagueId: data.leagueId,
    status: expired ? 'expired' : data.status,
    provider: data.provider ?? 'resend',
    deliveryAttemptCount: data.deliveryAttemptCount ?? 0,
    lastDeliveryAttemptId: data.lastDeliveryAttemptId,
    lastDeliveryStatus: data.lastDeliveryStatus,
    deliveryError: data.deliveryError,
    sentAt: data.sentAt,
    deliveredAt: data.deliveredAt,
    viewedAt: data.viewedAt,
    acceptedAt: data.acceptedAt,
    revokedAt: data.revokedAt,
    expiresAt: data.expiresAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function safeAttempt(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    channel: data.channel,
    destination: data.destination,
    provider: data.provider,
    status: data.status,
    providerStatus: data.providerStatus,
    providerMessageId: data.providerMessageId,
    error: data.error,
    attemptNumber: data.attemptNumber,
    requestedByUserId: data.requestedByUserId,
    createdAt: data.createdAt,
    completedAt: data.completedAt,
  };
}

async function requirePlatformRead(request: Request) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth;
  const forbidden = requireRole(auth.actor, ['platform_admin', 'super_admin'], 'Platform Admin access required.');
  if (forbidden) return { response: forbidden };
  const inactive = await requireActivePrincipal(auth.actor);
  if (inactive) return { response: inactive };
  const [profile, access] = await Promise.all([
    adminDb.collection('users').doc(auth.actor.uid).get(),
    adminDb.collection('accessIndex').doc(accessIndexId('platform', 'global', auth.actor.uid)).get(),
  ]);
  const profileData = profile.data() ?? {};
  const accountClass = resolveAccountClass({
    accountClass: auth.actor.accountClass ?? profileData.accountClass,
    role: typeof auth.actor.role === 'string' ? auth.actor.role : profileData.role,
  });
  if (accountClass !== 'platform_operator') return { response: Response.json({ error: 'A dedicated Platform Operator account is required.' }, { status: 403 }) };
  if (!indexGrantsCapability(access.data(), 'platform.audit.read')) return { response: Response.json({ error: 'Missing platform capability: platform.audit.read.' }, { status: 403 }) };
  return { actor: auth.actor };
}

export async function GET(request: Request, context: { params: Promise<{ invitationId: string }> }) {
  const guarded = await requirePlatformRead(request);
  if ('response' in guarded) return guarded.response;
  const { invitationId } = await context.params;
  const [invitation, attempts] = await Promise.all([
    adminDb.collection('invitations').doc(invitationId).get(),
    adminDb.collection('invitationDeliveryAttempts').where('invitationId', '==', invitationId).limit(100).get(),
  ]).catch(() => [null, null] as const);
  if (!invitation) return Response.json({ error: 'Invitation operations are temporarily unavailable.' }, { status: 503 });
  if (!invitation.exists) return Response.json({ error: 'Invitation not found.' }, { status: 404 });
  const history = (attempts?.docs ?? [])
    .map((document) => safeAttempt(document.id, document.data()))
    .sort((left, right) => Number(right.attemptNumber ?? 0) - Number(left.attemptNumber ?? 0));
  return Response.json({ invitation: safeInvitation(invitation.id, invitation.data() ?? {}), attempts: history }, {
    headers: { 'cache-control': 'private, no-store' },
  });
}

export async function POST(request: Request, context: { params: Promise<{ invitationId: string }> }) {
  const parsed = await requireAuthenticatedMutation(request, mutationSchema, {
    maxBytes: 4 * 1024,
    invalidBodyError: 'A valid invitation operation is required.',
    rateLimit: { bucket: 'platform_invitation_operation', limit: 30, windowSeconds: 300 },
  });
  if ('response' in parsed) return parsed.response;
  const { invitationId } = await context.params;
  const body = parsed.data;
  const secured = await securePlatformCommand({
    actor: parsed.actor,
    command: `invitation.${body.action}`,
    requiredCapability: 'platform.access.manage',
    requireReason: true,
    reason: body.reason,
    handler: async ({ actor, requestId, reason }) => {
      const invitationRef = adminDb.collection('invitations').doc(invitationId);
      if (body.action === 'revoke') {
        await adminDb.runTransaction(async (transaction) => {
          const current = await transaction.get(invitationRef);
          if (!current.exists) refuse('Invitation not found.', 404);
          if (['accepted', 'revoked', 'superseded'].includes(String(current.data()?.status))) {
            refuse('This invitation is no longer revocable.', 409);
          }
          transaction.update(invitationRef, {
            status: 'revoked',
            revokedAt: FieldValue.serverTimestamp(),
            revocationReason: reason,
            updatedAt: FieldValue.serverTimestamp(),
          });
          transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
            actor,
            requestId,
            action: 'access.invitation.revoked',
            targetCollection: 'invitations',
            targetId: invitationId,
            note: reason,
            beforeSummary: { status: current.data()?.status },
            afterSummary: { status: 'revoked' },
          }));
        });
        return Response.json({ ok: true, invitationId, status: 'revoked', requestId });
      }

      const result = await resendAccessInvitation({
        request,
        invitationId,
        actor,
        requestId,
        reason,
        channel: body.channel,
      });
      return Response.json({ ok: true, ...result });
    },
  });
  return 'response' in secured ? secured.response : secured.result;
}
