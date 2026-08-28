import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { adminDb } from '@/lib/firebase/admin';
import { accessIndexId } from '@/lib/auth/access';
import { resolveAccountClass } from '@/lib/auth/accountClass';
import { indexGrantsCapability } from '@/server/access/capabilities';
import { requireActivePrincipal, requireAuthenticatedMutation, requireAuthenticatedUser, requireRole } from '@/server/api/security';
import { sendApplicationReviewEmail } from '@/server/email/applicationReview';
import { platformAuditEvent, refuse, securePlatformCommand } from '@/server/platform/commands/securePlatformCommand';

export const runtime = 'nodejs';

const missingField = z.enum([
  'applicantName', 'applicantPhone', 'applicantEmail', 'leagueName', 'sport', 'city',
  'evidenceNote', 'currentOperations', 'estimatedTeams', 'competitionFormat',
]);

const mutationSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('request_information'),
    missingFields: z.array(missingField).min(1).max(10),
    message: z.string().trim().min(10).max(1200),
    reason: z.string().trim().min(4).max(500),
  }),
  z.object({
    decision: z.literal('reject'),
    message: z.string().trim().min(10).max(1200),
    reason: z.string().trim().min(4).max(500),
  }),
]);

function safeApplication(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    applicantName: data.applicantName,
    applicantEmail: data.applicantEmail,
    applicantPhone: data.applicantPhone,
    leagueName: data.leagueName,
    sport: data.sport,
    city: data.city,
    region: data.region,
    evidenceNote: data.evidenceNote,
    currentOperations: data.currentOperations,
    estimatedTeams: data.estimatedTeams,
    estimatedAthletes: data.estimatedAthletes,
    competitionFormat: data.competitionFormat,
    status: data.status,
    riskLevel: data.riskLevel ?? 'unassessed',
    riskFlags: Array.isArray(data.riskFlags) ? data.riskFlags.map(String) : [],
    reviewedByUserId: data.reviewedByUserId,
    requestedInformation: data.requestedInformation,
    informationDeliveryStatus: data.informationDeliveryStatus,
    organizationId: data.organizationId,
    leagueId: data.leagueId,
    invitationId: data.invitationId,
    invitationDeliveryStatus: data.invitationDeliveryStatus,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function safeInvitation(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    invitedEmail: data.invitedEmail,
    roleKey: data.roleKey,
    status: data.status,
    expiresAt: data.expiresAt,
    sentAt: data.sentAt,
    deliveredAt: data.deliveredAt,
    viewedAt: data.viewedAt,
    acceptedAt: data.acceptedAt,
    revokedAt: data.revokedAt,
    deliveryAttemptCount: data.deliveryAttemptCount ?? 0,
    lastDeliveryStatus: data.lastDeliveryStatus,
    deliveryError: data.deliveryError,
  };
}

function safeAttempt(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    channel: data.channel,
    provider: data.provider,
    status: data.status,
    providerStatus: data.providerStatus,
    error: data.error,
    attemptNumber: data.attemptNumber,
    createdAt: data.createdAt,
    completedAt: data.completedAt,
  };
}

async function platformReadGuard(request: Request) {
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
  const accountClass = resolveAccountClass({ accountClass: auth.actor.accountClass ?? profileData.accountClass, role: auth.actor.role ?? profileData.role });
  if (accountClass !== 'platform_operator') return { response: Response.json({ error: 'A dedicated Platform Operator account is required.' }, { status: 403 }) };
  if (!indexGrantsCapability(access.data(), 'platform.audit.read')) return { response: Response.json({ error: 'Missing platform capability: platform.audit.read.' }, { status: 403 }) };
  return { actor: auth.actor };
}

export async function GET(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  const guarded = await platformReadGuard(request);
  if ('response' in guarded) return guarded.response;
  const { applicationId } = await context.params;
  const application = await adminDb.collection('leagueAdminApplications').doc(applicationId).get().catch(() => null);
  if (!application) return Response.json({ error: 'The application workbench is temporarily unavailable.' }, { status: 503 });
  if (!application.exists) return Response.json({ error: 'Application not found.' }, { status: 404 });
  const data = application.data() ?? {};
  const invitationId = typeof data.invitationId === 'string' ? data.invitationId : null;
  const [invitation, attempts] = invitationId ? await Promise.all([
    adminDb.collection('invitations').doc(invitationId).get().catch(() => null),
    adminDb.collection('invitationDeliveryAttempts').where('invitationId', '==', invitationId).limit(100).get().catch(() => null),
  ]) : [null, null];
  const duplicateCandidates = Array.isArray(data.duplicateCandidates)
    ? data.duplicateCandidates.map((item: unknown) => {
      const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      return {
        id: String(candidate.id ?? ''),
        kind: candidate.kind === 'application' ? 'application' : 'league',
        title: String(candidate.title ?? candidate.id ?? 'Candidate'),
        city: typeof candidate.city === 'string' ? candidate.city : undefined,
        status: typeof candidate.status === 'string' ? candidate.status : undefined,
        score: Number(candidate.score ?? 0),
        reason: String(candidate.reason ?? 'Risk signal'),
      };
    }).filter((item: { id: string }) => item.id)
    : [];
  return Response.json({
    application: safeApplication(application.id, data),
    duplicateCandidates,
    invitation: invitation?.exists ? safeInvitation(invitation.id, invitation.data() ?? {}) : null,
    deliveryAttempts: (attempts?.docs ?? []).map((document) => safeAttempt(document.id, document.data())),
  }, { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  const parsed = await requireAuthenticatedMutation(request, mutationSchema, {
    maxBytes: 8 * 1024,
    invalidBodyError: 'A valid application decision is required.',
    rateLimit: { bucket: 'platform_application_review', limit: 30, windowSeconds: 300 },
  });
  if ('response' in parsed) return parsed.response;
  const { applicationId } = await context.params;
  const body = parsed.data;
  const secured = await securePlatformCommand({
    actor: parsed.actor,
    command: 'application.review',
    requiredCapability: 'platform.application.review',
    requireReason: true,
    reason: body.reason,
    handler: async ({ actor, requestId, reason }) => {
      const applicationRef = adminDb.collection('leagueAdminApplications').doc(applicationId);
      const snapshot = await applicationRef.get();
      if (!snapshot.exists) refuse('Application not found.', 404);
      const data = snapshot.data() ?? {};
      if (!['pending', 'submitted', 'under_review', 'risk_review', 'needs_information', 'resubmitted'].includes(String(data.status))) {
        refuse('This application has already been decided.', 409);
      }
      if (typeof data.applicantEmail !== 'string' || !data.applicantEmail) refuse('The application has no contact email.', 409);
      const attemptId = `application_contact_${randomUUID()}`;
      const nextStatus = body.decision === 'request_information' ? 'needs_information' : 'rejected';
      const attemptRef = adminDb.collection('applicationContactAttempts').doc(attemptId);
      await adminDb.runTransaction(async (transaction) => {
        const current = await transaction.get(applicationRef);
        if (!current.exists || !['pending', 'submitted', 'under_review', 'risk_review', 'needs_information', 'resubmitted'].includes(String(current.data()?.status))) {
          refuse('Application state changed; refresh before deciding.', 409);
        }
        transaction.update(applicationRef, {
          status: nextStatus,
          reviewedByUserId: actor.uid,
          applicantMessage: body.message,
          ...(body.decision === 'request_information' ? {
            requestedInformation: {
              fields: body.missingFields,
              message: body.message,
              requestedByUserId: actor.uid,
              requestedAt: new Date().toISOString(),
            },
          } : {}),
          informationDeliveryStatus: 'queued',
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.create(attemptRef, {
          id: attemptId,
          applicationId,
          channel: 'email',
          destination: data.applicantEmail,
          provider: 'resend',
          decision: body.decision,
          status: 'queued',
          requestedByUserId: actor.uid,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(adminDb.collection('adminAuditEvents').doc(), platformAuditEvent({
          actor,
          requestId,
          action: body.decision === 'request_information' ? 'requested_information' : 'rejected',
          targetCollection: 'leagueAdminApplications',
          targetId: applicationId,
          note: reason,
          beforeSummary: { status: current.data()?.status },
          afterSummary: { status: nextStatus, ...(body.decision === 'request_information' ? { missingFields: body.missingFields } : {}) },
        }));
      });
      const delivery = await sendApplicationReviewEmail({
        applicationId,
        attemptId,
        to: data.applicantEmail,
        applicantName: String(data.applicantName ?? 'Applicant'),
        leagueName: String(data.leagueName ?? 'league'),
        decision: body.decision,
        ...(body.decision === 'request_information' ? { missingFields: body.missingFields } : {}),
        message: body.message,
      });
      const deliveryStatus = delivery.status === 'sent' ? 'sent' : 'failed_delivery';
      await adminDb.runTransaction(async (transaction) => {
        transaction.update(applicationRef, {
          informationDeliveryStatus: deliveryStatus,
          ...(delivery.error ? { informationDeliveryError: delivery.error } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.update(attemptRef, {
          status: deliveryStatus,
          providerStatus: delivery.status,
          ...(delivery.id ? { providerMessageId: delivery.id } : {}),
          ...(delivery.error ? { error: delivery.error } : {}),
          completedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      });
      return Response.json({ ok: true, applicationId, status: nextStatus, deliveryStatus, requestId });
    },
  });
  return 'response' in secured ? secured.response : secured.result;
}
