import { createHash, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { sendAccessInvitationEmail } from '@/server/email/accessInvitation';
import { platformAuditEvent, refuse } from '@/server/platform/commands/securePlatformCommand';
import type { AuthenticatedActor } from '@/server/api/security';

function publicBaseUrl(request: Request) {
  return process.env.GOALPLACE_APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

export type InvitationResendResult = {
  invitationId: string;
  status: 'sent' | 'failed_delivery';
  attemptId: string;
  actionUrl: string;
  providerStatus: 'sent' | 'not_configured' | 'failed';
  error?: string;
  requestId: string;
};

/** Rotates one token, records one attempt, sends once, and advances only from provider output. */
export async function resendAccessInvitation(input: {
  request: Request;
  invitationId: string;
  actor: AuthenticatedActor;
  requestId: string;
  reason: string;
  channel: 'email';
}): Promise<InvitationResendResult> {
  const invitationRef = adminDb.collection('invitations').doc(input.invitationId);
  const currentSnapshot = await invitationRef.get();
  if (!currentSnapshot.exists) refuse('Invitation not found.', 404);
  const current = currentSnapshot.data() ?? {};
  if (['accepted', 'revoked', 'superseded'].includes(String(current.status))) {
    refuse('This invitation is no longer active. Create a new governed assignment instead.', 409);
  }
  if (typeof current.invitedEmail !== 'string' || !current.invitedEmail) refuse('This invitation has no email destination.', 409);
  const nextAttempt = Number(current.deliveryAttemptCount ?? 0) + 1;
  const nextTokenVersion = Number(current.tokenVersion ?? 0) + 1;
  const attemptId = `${input.invitationId}_email_${nextAttempt}`;
  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const relativeActionUrl = `/invitations/access/${input.invitationId}?token=${encodeURIComponent(token)}`;
  const attemptRef = adminDb.collection('invitationDeliveryAttempts').doc(attemptId);

  await adminDb.runTransaction(async (transaction) => {
    const fresh = await transaction.get(invitationRef);
    if (!fresh.exists) refuse('Invitation not found.', 404);
    if (['accepted', 'revoked', 'superseded'].includes(String(fresh.data()?.status))) refuse('Invitation state changed; refresh before resending.', 409);
    transaction.update(invitationRef, {
      status: 'queued',
      tokenHash,
      tokenVersion: nextTokenVersion,
      actionUrl: relativeActionUrl,
      expiresAt,
      deliveryAttemptCount: nextAttempt,
      lastDeliveryAttemptId: attemptId,
      lastDeliveryStatus: 'queued',
      deliveryError: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.create(attemptRef, {
      id: attemptId,
      invitationId: input.invitationId,
      channel: input.channel,
      destination: current.invitedEmail,
      provider: 'resend',
      status: 'queued',
      attemptNumber: nextAttempt,
      requestedByUserId: input.actor.uid,
      reason: input.reason,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
      actor: input.actor,
      requestId: input.requestId,
      action: 'access.invitation.resend_queued',
      targetCollection: 'invitations',
      targetId: input.invitationId,
      note: input.reason,
      beforeSummary: { status: fresh.data()?.status, tokenVersion: fresh.data()?.tokenVersion },
      afterSummary: { status: 'queued', tokenVersion: nextTokenVersion, attemptId },
    }));
  });

  const leagueId = String(current.leagueId ?? current.scopeId ?? '');
  const league = leagueId ? await adminDb.collection('leagues').doc(leagueId).get().catch(() => null) : null;
  const delivery = await sendAccessInvitationEmail({
    to: current.invitedEmail,
    inviteUrl: new URL(relativeActionUrl, publicBaseUrl(input.request)).toString(),
    invitationId: input.invitationId,
    leagueName: String(league?.data()?.name ?? 'your GoalPlace256 league'),
    roleLabel: String(current.roleKey ?? 'operator').replaceAll('_', ' ').replace(/^./, (value) => value.toUpperCase()),
    expiresAt,
    attemptId,
  });
  const status = delivery.status === 'sent' ? 'sent' : 'failed_delivery';
  await adminDb.runTransaction(async (transaction) => {
    transaction.update(invitationRef, {
      status,
      lastDeliveryStatus: delivery.status,
      ...(delivery.id ? { emailMessageId: delivery.id } : {}),
      ...(delivery.error ? { deliveryError: delivery.error } : {}),
      ...(delivery.status === 'sent' ? { sentAt: FieldValue.serverTimestamp() } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(attemptRef, {
      status,
      providerStatus: delivery.status,
      ...(delivery.id ? { providerMessageId: delivery.id } : {}),
      ...(delivery.error ? { error: delivery.error } : {}),
      completedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (current.applicationId) {
      transaction.update(adminDb.collection('leagueAdminApplications').doc(String(current.applicationId)), {
        invitationDeliveryStatus: status,
        invitationActionUrl: relativeActionUrl,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  });
  return {
    invitationId: input.invitationId,
    status,
    attemptId,
    actionUrl: new URL(relativeActionUrl, publicBaseUrl(input.request)).toString(),
    providerStatus: delivery.status,
    ...(delivery.error ? { error: delivery.error } : {}),
    requestId: input.requestId,
  };
}
