import { createHash } from 'node:crypto';
import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { jsonError, requireAuthenticatedUser } from '@/server/api/security';

import { adminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function emailMatches(invitedEmail: unknown, actorEmail: unknown) {
  if (typeof invitedEmail !== 'string') return true;
  return typeof actorEmail === 'string' && invitedEmail.toLowerCase() === actorEmail.toLowerCase();
}

function safeAccessInvitation(id: string, data: DocumentData) {
  return {
    id,
    type: data.type,
    invitedEmail: data.invitedEmail,
    roleKey: data.roleKey,
    scopeType: data.scopeType,
    scopeId: data.scopeId,
    permissionBundleId: data.permissionBundleId,
    status: data.status,
    invitedByUserId: data.invitedByUserId,
    applicationId: data.applicationId,
    organizationId: data.organizationId,
    leagueId: data.leagueId,
    teamId: data.teamId,
    seasonId: data.seasonId,
    actionUrl: data.actionUrl,
    expiresAt: data.expiresAt,
    viewedAt: data.viewedAt,
    acceptedAt: data.acceptedAt,
    declinedAt: data.declinedAt,
    revokedAt: data.revokedAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function safeTeamAssignment(id: string, data: DocumentData) {
  return {
    id,
    userId: data.userId,
    teamId: data.teamId,
    leagueId: data.leagueId,
    seasonId: data.seasonId,
    role: data.role,
    status: data.status,
    invitedByUserId: data.invitedByUserId,
    invitedEmail: data.invitedEmail,
    expiresAt: data.expiresAt,
    acceptedAt: data.acceptedAt,
    revokedAt: data.revokedAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ invitationId: string }> },
) {
  const auth = await requireAuthenticatedUser(request);
  if ('response' in auth) return auth.response;

  const { invitationId } = await context.params;
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  const kind = url.searchParams.get('kind') ?? 'access';
  if (!token) return jsonError('A complete invitation link is required.', 400);

  const collectionName = kind === 'team' ? 'teamAssignments' : 'invitations';
  const invitationRef = adminDb.collection(collectionName).doc(invitationId);
  const snapshot = await invitationRef.get();
  if (!snapshot.exists) return jsonError('Invitation not found.', 404);

  const data = snapshot.data()!;
  if (!data.tokenHash || tokenHash(token) !== data.tokenHash) {
    return jsonError('This invitation link is invalid.', 403);
  }
  if (!emailMatches(data.invitedEmail, auth.actor.email)) {
    return jsonError('Sign in with the email address that received this invitation.', 403);
  }

  let safeData = data;
  const canObserveView = kind !== 'team'
    && ['queued', 'sent', 'delivered'].includes(String(data.status))
    && (!data.expiresAt || Date.parse(String(data.expiresAt)) > Date.now());
  if (canObserveView) {
    const viewedAt = new Date().toISOString();
    await invitationRef.update({
      status: 'viewed',
      viewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    safeData = { ...data, status: 'viewed', viewedAt };
  }

  return Response.json(
    kind === 'team'
      ? safeTeamAssignment(snapshot.id, safeData)
      : safeAccessInvitation(snapshot.id, safeData),
    { headers: { 'cache-control': 'no-store' } },
  );
}
