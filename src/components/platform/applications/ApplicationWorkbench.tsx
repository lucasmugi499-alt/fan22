'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle, Copy, Envelope, WarningCircle } from '@phosphor-icons/react';
import { ConsequenceSheet } from '@/components/platform/commands/ConsequenceSheet';
import { PlatformCommandButton } from '@/components/platform/commands/PlatformCommandButton';
import { usePlatformCommand } from '@/components/platform/commands/usePlatformCommand';
import { DirectoryRow, EmptyState, PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/context/AuthProvider';

type ApplicationPayload = {
  application: {
    id: string;
    applicantName?: string;
    applicantEmail?: string;
    applicantPhone?: string;
    leagueName: string;
    sport?: string;
    city?: string;
    region?: string;
    evidenceNote?: string;
    currentOperations?: string;
    estimatedTeams?: number;
    competitionFormat?: string;
    status: string;
    riskLevel: string;
    riskFlags: string[];
    requestedInformation?: { fields?: string[]; message?: string; requestedAt?: string };
    informationDeliveryStatus?: string;
    invitationId?: string;
    invitationDeliveryStatus?: string;
    organizationId?: string;
    leagueId?: string;
  };
  duplicateCandidates: Array<{ id: string; kind: string; title: string; city?: string; status?: string; score: number; reason: string }>;
  invitation: null | {
    id: string;
    invitedEmail?: string;
    roleKey?: string;
    status: string;
    expiresAt?: string;
    sentAt?: string;
    deliveredAt?: string;
    viewedAt?: string;
    acceptedAt?: string;
    deliveryAttemptCount?: number;
    lastDeliveryStatus?: string;
    deliveryError?: string;
  };
  deliveryAttempts: Array<{ id: string; channel?: string; provider?: string; status: string; providerStatus?: string; error?: string; attemptNumber?: number; createdAt?: string }>;
};

type Decision = 'approve' | 'request_information' | 'reject' | null;

const OPEN_STATUSES = new Set(['pending', 'submitted', 'under_review', 'risk_review', 'needs_information', 'resubmitted']);

function tone(status: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (['approved', 'accepted', 'delivered', 'sent', 'low'].includes(status)) return 'good';
  if (['rejected', 'failed_delivery', 'revoked', 'high'].includes(status)) return 'bad';
  if (['pending', 'needs_information', 'queued', 'medium', 'risk_review'].includes(status)) return 'warn';
  return 'neutral';
}

export function ApplicationWorkbench({ id, initialCommand }: { id: string; initialCommand?: string }) {
  const { currentUser, isDemoMode } = useAuth();
  const [payload, setPayload] = useState<ApplicationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [decision, setDecision] = useState<Decision>(() => initialCommand === 'application.approve_and_invite' ? 'approve' : initialCommand === 'application.review' ? 'request_information' : null);
  const [invitationCommand, setInvitationCommand] = useState<'resend' | 'revoke' | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const approve = usePlatformCommand('/api/access');
  const review = usePlatformCommand(`/api/platform/applications/${encodeURIComponent(id)}`);
  const invitation = usePlatformCommand(payload?.invitation ? `/api/platform/invitations/${encodeURIComponent(payload.invitation.id)}` : '/api/platform/invitations/missing');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      await Promise.resolve();
      if (isDemoMode) {
        if (!cancelled) {
          setPayload({
            application: { id, leagueName: id.replaceAll('_', ' '), status: 'pending', riskLevel: 'low', riskFlags: [] },
            duplicateCandidates: [], invitation: null, deliveryAttempts: [],
          });
          setLoading(false);
        }
        return;
      }
      if (!currentUser || typeof currentUser.getIdToken !== 'function') {
        if (!cancelled) { setError('Sign in again to review this application.'); setLoading(false); }
        return;
      }
      if (!cancelled) { setLoading(true); setError(null); }
      try {
        const token = await currentUser.getIdToken();
        const response = await fetch(`/api/platform/applications/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${token}` } });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'The application could not be loaded.');
        if (!cancelled) setPayload(body as ApplicationPayload);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'The application could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [currentUser, id, isDemoMode, refresh]);

  if (loading) return <Skeleton className="h-[620px] rounded-[var(--radius-lg)]" />;
  if (error || !payload) return (
    <Card className="p-5"><p role="alert" className="text-sm text-[var(--state-error)]">{error ?? 'Application unavailable.'}</p><Button className="mt-3" variant="secondary" onClick={() => setRefresh((value) => value + 1)}>Try again</Button></Card>
  );

  const application = payload.application;
  const open = OPEN_STATUSES.has(application.status);
  const invitationActive = payload.invitation && !['accepted', 'revoked', 'superseded'].includes(payload.invitation.status);
  return (
    <section className="space-y-5">
      <PlatformAdminHeader
        eyebrow="Application workbench"
        title={application.leagueName}
        description="Applicant evidence, duplicate comparison, named information requests, decision history, and observed invitation delivery."
        action={<Link href="/admin/network?tab=applications" className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-pill)] border border-border bg-surface-2 px-4 text-sm font-semibold text-text-strong hover:bg-surface-3"><ArrowLeft className="h-4 w-4" /> Back to applications</Link>}
      />
      <div className="flex flex-wrap gap-2"><StatusChip label={application.status} tone={tone(application.status)} /><StatusChip label={`${application.riskLevel} risk`} tone={tone(application.riskLevel)} /></div>
      <PlatformStatGrid items={[
        { label: 'Risk flags', value: application.riskFlags.length, tone: application.riskFlags.length ? 'bad' : 'good' },
        { label: 'Duplicate candidates', value: payload.duplicateCandidates.length, tone: payload.duplicateCandidates.length ? 'warn' : 'good' },
        { label: 'Estimated teams', value: application.estimatedTeams ?? '—' },
        { label: 'Delivery', value: payload.invitation?.status ?? application.informationDeliveryStatus ?? 'not started', tone: payload.invitation?.status === 'failed_delivery' ? 'bad' : undefined },
      ]} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-text-strong">Application evidence</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                ['Applicant', application.applicantName ?? 'Not supplied'],
                ['Email', application.applicantEmail ?? 'Not supplied'],
                ['Phone', application.applicantPhone ?? 'Not supplied'],
                ['Location', [application.city, application.region].filter(Boolean).join(' · ') || 'Not supplied'],
                ['Sport', application.sport ?? 'Not supplied'],
                ['Format', application.competitionFormat ?? 'Not supplied'],
              ].map(([label, value]) => <div key={label} className="rounded-[var(--radius-md)] bg-surface-2 p-3"><dt className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{label}</dt><dd className="mt-1 break-words text-sm text-text-strong">{value}</dd></div>)}
            </dl>
            <div className="mt-3 rounded-[var(--radius-md)] bg-surface-2 p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">Evidence</p><p className="mt-1 text-sm leading-6 text-text">{application.evidenceNote ?? 'Not supplied'}</p></div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2"><Copy className="h-5 w-5 text-brand" /><h2 className="text-sm font-semibold text-text-strong">Duplicate comparison</h2></div>
            {payload.duplicateCandidates.length ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-[var(--radius-md)] border border-brand/30 bg-brand-subtle/20 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-brand">This application</p><p className="mt-1 font-semibold text-text-strong">{application.leagueName}</p><p className="mt-1 text-xs text-muted">{application.city} · {application.status}</p>
                </div>
                {payload.duplicateCandidates.map((candidate) => (
                  <div key={`${candidate.kind}-${candidate.id}`} className="rounded-[var(--radius-md)] border border-[color-mix(in_srgb,var(--state-warning),transparent_50%)] bg-surface-2 p-3">
                    <div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-subtle">{candidate.kind}</p><StatusChip label={`${candidate.score}%`} tone="warn" /></div>
                    <p className="mt-1 font-semibold text-text-strong">{candidate.title}</p><p className="mt-1 text-xs text-muted">{candidate.city ?? 'Location unavailable'} · {candidate.status ?? 'status unavailable'}</p><p className="mt-2 text-xs text-[var(--state-warning)]">{candidate.reason}</p>
                  </div>
                ))}
              </div>
            ) : <div className="mt-3"><EmptyState title="No duplicate candidates">No stored name or applicant signal crossed the review threshold at intake.</EmptyState></div>}
          </Card>

          {application.requestedInformation ? (
            <Card className="p-4"><h2 className="text-sm font-semibold text-text-strong">Latest information request</h2><p className="mt-2 text-sm leading-6 text-text">{application.requestedInformation.message}</p><p className="mt-2 text-xs text-muted">Missing: {application.requestedInformation.fields?.join(', ')}</p><StatusChip label={application.informationDeliveryStatus ?? 'queued'} tone={tone(application.informationDeliveryStatus ?? 'queued')} /></Card>
          ) : null}

          {payload.invitation ? (
            <Card className="p-4">
              <div className="flex items-center gap-2"><Envelope className="h-5 w-5 text-brand" /><h2 className="text-sm font-semibold text-text-strong">Owner invitation delivery</h2></div>
              <div className="mt-3 flex flex-wrap items-center gap-2"><StatusChip label={payload.invitation.status} tone={tone(payload.invitation.status)} /><span className="text-xs text-muted">{payload.invitation.invitedEmail}</span></div>
              {payload.invitation.deliveryError ? <p className="mt-3 text-sm leading-6 text-[var(--state-error)]">{payload.invitation.deliveryError}</p> : null}
              <div className="mt-3 space-y-2">
                {payload.deliveryAttempts.map((attempt) => <DirectoryRow key={attempt.id} title={`Attempt ${attempt.attemptNumber ?? '—'} · ${attempt.channel ?? 'email'}`} meta={`${attempt.provider ?? 'provider'}${attempt.error ? ` · ${attempt.error}` : ''}`} status={attempt.status} statusTone={tone(attempt.status)} />)}
              </div>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-brand" weight="fill" /><h2 className="text-sm font-semibold text-text-strong">Decision</h2></div>
            <div className="mt-3 flex flex-col items-start gap-3">
              <PlatformCommandButton commandId="application.approve_and_invite" onClick={() => setDecision('approve')} disabledReason={!open ? 'This application has already left the open review state.' : undefined} />
              <PlatformCommandButton commandId="application.review" label="Request information" onClick={() => setDecision('request_information')} disabledReason={!open ? 'This application has already left the open review state.' : undefined} />
              <PlatformCommandButton commandId="application.review" label="Reject application" onClick={() => setDecision('reject')} disabledReason={!open ? 'This application has already left the open review state.' : undefined} />
            </div>
            {success ? <p role="status" className="mt-3 text-xs leading-5 text-brand">{success}</p> : null}
          </Card>
          {payload.invitation ? (
            <Card className="p-4"><h2 className="text-sm font-semibold text-text-strong">Invitation operations</h2><div className="mt-3 flex flex-col items-start gap-3"><PlatformCommandButton commandId="invitation.resend" onClick={() => setInvitationCommand('resend')} disabledReason={!invitationActive ? 'Accepted or revoked invitations cannot be resent.' : undefined} /><PlatformCommandButton commandId="invitation.revoke" onClick={() => setInvitationCommand('revoke')} disabledReason={!invitationActive ? 'This invitation is already closed.' : undefined} /></div></Card>
          ) : null}
          {application.riskFlags.length ? <Card className="p-4"><div className="flex items-center gap-2 text-[var(--state-warning)]"><WarningCircle className="h-5 w-5" /><h2 className="text-sm font-semibold">Risk signals</h2></div><ul className="mt-2 space-y-1 text-xs leading-5 text-muted">{application.riskFlags.map((flag) => <li key={flag}>{flag.replaceAll('_', ' ')}</li>)}</ul></Card> : null}
        </aside>
      </div>

      <ConsequenceSheet open={decision === 'approve'} commandId="application.approve_and_invite" targetId={id} inputs={{ applicationId: id }} title={`Approve ${application.leagueName} and invite owner`} submitLabel="Approve and invite" running={approve.running} error={approve.error} onClose={() => { setDecision(null); approve.reset(); }} onSubmit={async () => { const ok = await approve.run({ action: 'approve_league_admin', applicationId: id }, 'Application approved and invitation delivery attempted.'); if (ok) { setDecision(null); setSuccess('Application approved and invitation delivery attempted.'); setRefresh((value) => value + 1); } }} />
      <ConsequenceSheet
        open={decision === 'request_information' || decision === 'reject'}
        commandId="application.review"
        targetId={id}
        inputs={{ applicationId: id, decision }}
        title={decision === 'reject' ? `Reject ${application.leagueName}` : `Request information from ${application.applicantName ?? 'applicant'}`}
        submitLabel={decision === 'reject' ? 'Reject application' : 'Send request'}
        fields={decision === 'request_information' ? [
          { name: 'missingFields', label: 'Missing fields (comma separated)', kind: 'text', required: true, placeholder: 'currentOperations, estimatedTeams', maxLength: 300 },
          { name: 'message', label: 'Message to applicant', kind: 'textarea', required: true, maxLength: 1200 },
        ] : [{ name: 'message', label: 'Message to applicant', kind: 'textarea', required: true, maxLength: 1200 }]}
        running={review.running}
        error={review.error}
        onClose={() => { setDecision(null); review.reset(); }}
        onSubmit={async (values, reason) => {
          const missingFields = (values.missingFields ?? '').split(',').map((value) => value.trim()).filter(Boolean);
          const body = decision === 'request_information'
            ? { decision, missingFields, message: values.message, reason }
            : { decision: 'reject', message: values.message, reason };
          const ok = await review.run(body, decision === 'reject' ? 'Application rejected.' : 'Information request sent.');
          if (ok) { setDecision(null); setSuccess(decision === 'reject' ? 'Application rejected.' : 'Information request recorded and delivery attempted.'); setRefresh((value) => value + 1); }
        }}
      />
      <ConsequenceSheet open={invitationCommand === 'resend'} commandId="invitation.resend" targetId={payload.invitation?.id} inputs={{ invitationId: payload.invitation?.id, channel: 'email' }} title="Resend owner invitation" submitLabel="Resend by email" running={invitation.running} error={invitation.error} onClose={() => { setInvitationCommand(null); invitation.reset(); }} onSubmit={async (_values, reason) => { const ok = await invitation.run({ action: 'resend', channel: 'email', reason }, 'Invitation delivery attempted.'); if (ok) { setInvitationCommand(null); setSuccess('Invitation delivery attempted.'); setRefresh((value) => value + 1); } }} />
      <ConsequenceSheet open={invitationCommand === 'revoke'} commandId="invitation.revoke" targetId={payload.invitation?.id} inputs={{ invitationId: payload.invitation?.id }} title="Revoke owner invitation" submitLabel="Revoke invitation" running={invitation.running} error={invitation.error} onClose={() => { setInvitationCommand(null); invitation.reset(); }} onSubmit={async (_values, reason) => { const ok = await invitation.run({ action: 'revoke', reason }, 'Invitation revoked.'); if (ok) { setInvitationCommand(null); setSuccess('Invitation revoked.'); setRefresh((value) => value + 1); } }} />
    </section>
  );
}
