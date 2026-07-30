'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { CheckCircle, EnvelopeSimple, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { useAuth } from '@/context/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Invitation, SportSlug, TeamAssignment } from '@/types';

export function LeagueAdminApplicationForm() {
  const { authStatus, currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [leagueName, setLeagueName] = useState('');
  const [sport, setSport] = useState<SportSlug>('football');
  const [city, setCity] = useState('Kampala');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const userId = currentUser?.uid ?? userProfile?.uid;
    if (!userId) return;
    setSaving(true);
    try {
      await provider.createLeagueAdminApplication({
        userId,
        applicantEmail: currentUser?.email ?? userProfile?.email,
        leagueName: leagueName.trim(),
        sport,
        city: city.trim(),
        evidenceNote: evidenceNote.trim(),
      });
      setSubmitted(true);
      toast.success(isDemoMode
        ? 'Demo league application created. Approve it from Platform Admin approvals.'
        : 'Application sent for platform review.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not submit the application.');
    } finally {
      setSaving(false);
    }
  }

  if (authStatus !== 'logged_in') {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-brand" weight="duotone" />
        <h1 className="mt-3 text-xl font-semibold text-text-strong">Operate a league on GoalPlace256</h1>
        <p className="mt-2 text-sm text-muted">Sign in to submit a league application. Platform review creates the league and assigns administrator access.</p>
        <Link href="/login" className="mt-5 inline-flex h-11 items-center rounded-[var(--radius-pill)] bg-brand px-5 text-sm font-semibold text-on-brand">Sign in</Link>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <CheckCircle className="mx-auto h-10 w-10 text-verified" weight="fill" />
        <h1 className="mt-3 text-xl font-semibold text-text-strong">Application received</h1>
        <p className="mt-2 text-sm text-muted">
          {isDemoMode
            ? 'Switch to the Platform Admin demo account and approve this application to create the draft dummy league.'
            : 'A Platform Admin will review the league identity, competition structure, and administrator assignment. Your current role does not change until approval.'}
        </p>
        {isDemoMode ? (
          <Link href="/admin/approvals" className="mt-5 inline-flex h-11 items-center rounded-[var(--radius-pill)] bg-brand px-5 text-sm font-semibold text-on-brand">
            Open approvals
          </Link>
        ) : null}
      </Card>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-lg space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-text-strong">League Admin application</h1>
        <p className="text-sm text-muted">Create a league request with real operating details. Platform Admin can approve it into a connected league record.</p>
      </div>
      <Field label="League name"><input required value={leagueName} onChange={(event) => setLeagueName(event.target.value)} className="field" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sport">
          <select value={sport} onChange={(event) => setSport(event.target.value as SportSlug)} className="field">
            <option value="football">Football</option><option value="basketball">Basketball</option><option value="rugby">Rugby</option>
          </select>
        </Field>
        <Field label="City or district"><input required value={city} onChange={(event) => setCity(event.target.value)} className="field" /></Field>
      </div>
      <Field label="Authority and competition evidence">
        <textarea required rows={5} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} className="field min-h-32 py-3" placeholder="Your role, league structure, and how the platform can verify this application." />
      </Field>
      <Button type="submit" block icon={ShieldCheck} disabled={saving}>{saving ? 'Submitting...' : 'Submit for review'}</Button>
    </form>
  );
}

export function TeamInvitationAcceptance({ assignmentId, token }: { assignmentId: string; token: string }) {
  const { authStatus, currentUser, userProfile } = useAuth();
  const [assignment, setAssignment] = useState<TeamAssignment>();
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (authStatus !== 'logged_in') return;
    let cancelled = false;
    dataProvider.getTeamAssignmentById(assignmentId)
      .then((item) => { if (!cancelled) setAssignment(item); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assignmentId, authStatus]);

  async function accept() {
    const userId = currentUser?.uid ?? userProfile?.uid;
    if (!userId) return;
    try {
      await dataProvider.acceptTeamAdminInvitation(assignmentId, userId, token);
      setAccepted(true);
      toast.success('Team Admin invitation accepted.');
      await currentUser?.getIdToken(true);
      window.setTimeout(() => window.location.assign('/team-admin'), 600);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not accept this invitation.');
    }
  }

  if (!token) return <Card className="mx-auto max-w-lg p-6 text-center"><h1 className="text-xl font-semibold">Invitation not found</h1><p className="mt-2 text-sm text-muted">This invitation link is incomplete, expired, or has been revoked.</p></Card>;
  if (authStatus !== 'logged_in') {
    const next = `/invitations/team/${encodeURIComponent(assignmentId)}?token=${encodeURIComponent(token)}`;
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <EnvelopeSimple className="mx-auto h-9 w-9 text-brand" weight="duotone" />
        <h1 className="mt-3 text-xl font-semibold text-text-strong">Team Admin invitation</h1>
        <p className="mt-2 text-sm text-muted">Sign in with the invited email address to review and accept this assignment.</p>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="mt-5 inline-flex h-11 items-center rounded-[var(--radius-pill)] bg-brand px-5 text-sm font-semibold text-on-brand">Sign in to accept</Link>
      </Card>
    );
  }
  if (loading) return <Skeleton className="mx-auto h-64 max-w-lg rounded-[var(--radius-lg)]" />;
  if (!assignment) return <Card className="mx-auto max-w-lg p-6 text-center"><h1 className="text-xl font-semibold">Invitation not found</h1><p className="mt-2 text-sm text-muted">This invitation may have expired or been revoked.</p></Card>;

  return (
    <Card className="mx-auto max-w-lg p-6 text-center">
      <EnvelopeSimple className="mx-auto h-9 w-9 text-brand" weight="duotone" />
      <h1 className="mt-3 text-xl font-semibold text-text-strong">{accepted ? 'Invitation accepted' : 'Team Admin invitation'}</h1>
      <p className="mt-2 text-sm text-muted">
        {accepted
          ? 'Your assignment and trusted Team Admin access are active. Opening the Team Console now.'
          : `You have been invited to administer team ${assignment.teamId} for the ${assignment.seasonId} season.`}
      </p>
      {!accepted && authStatus === 'logged_in' ? <Button className="mt-5" icon={CheckCircle} onClick={accept}>Accept assignment</Button> : null}
    </Card>
  );
}

export function AccessInvitationAcceptance({ invitationId, token }: { invitationId: string; token: string }) {
  const { authStatus, currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [invitation, setInvitation] = useState<Invitation>();
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [loadedAt] = useState(() => Date.now());

  useEffect(() => {
    if (authStatus !== 'logged_in') return;
    let cancelled = false;
    provider.getInvitationById(invitationId)
      .then((item) => { if (!cancelled) setInvitation(item); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [authStatus, invitationId, provider]);

  async function accept() {
    const userId = currentUser?.uid ?? userProfile?.uid;
    if (!userId) return;
    try {
      await provider.acceptInvitation(invitationId, userId, token);
      setAccepted(true);
      toast.success('Invitation accepted.');
      await currentUser?.getIdToken(true);
      window.setTimeout(() => {
        if (invitation?.roleKey === 'league_owner' || invitation?.roleKey === 'league_admin') {
          window.location.assign('/league-admin/onboarding');
        } else if (invitation?.roleKey === 'team_owner' || invitation?.roleKey === 'team_admin') {
          window.location.assign('/team-admin');
        } else {
          window.location.assign('/home');
        }
      }, 600);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not accept this invitation.');
    }
  }

  if (!token) {
    return <Card className="mx-auto max-w-lg p-6 text-center"><h1 className="text-xl font-semibold">Invitation not found</h1><p className="mt-2 text-sm text-muted">This invitation link is incomplete, expired, or has been revoked.</p></Card>;
  }
  if (authStatus !== 'logged_in') {
    const next = `/invitations/access/${encodeURIComponent(invitationId)}?token=${encodeURIComponent(token)}`;
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <EnvelopeSimple className="mx-auto h-9 w-9 text-brand" weight="duotone" />
        <h1 className="mt-3 text-xl font-semibold text-text-strong">GoalPlace256 invitation</h1>
        <p className="mt-2 text-sm text-muted">Sign in with the invited email address to review and accept this assignment.</p>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="mt-5 inline-flex h-11 items-center rounded-[var(--radius-pill)] bg-brand px-5 text-sm font-semibold text-on-brand">Sign in to accept</Link>
      </Card>
    );
  }
  if (loading) return <Skeleton className="mx-auto h-64 max-w-lg rounded-[var(--radius-lg)]" />;
  if (!invitation) {
    return <Card className="mx-auto max-w-lg p-6 text-center"><h1 className="text-xl font-semibold">Invitation not found</h1><p className="mt-2 text-sm text-muted">This invitation may have expired, been revoked, or belonged to another environment.</p></Card>;
  }

  const expired = Date.parse(invitation.expiresAt) <= loadedAt;
  const canAccept = !accepted && invitation.status !== 'accepted' && !expired;

  return (
    <Card className="mx-auto max-w-lg p-6 text-center">
      <EnvelopeSimple className="mx-auto h-9 w-9 text-brand" weight="duotone" />
      <h1 className="mt-3 text-xl font-semibold text-text-strong">{accepted || invitation.status === 'accepted' ? 'Invitation accepted' : 'GoalPlace256 invitation'}</h1>
      <p className="mt-2 text-sm text-muted">
        {accepted || invitation.status === 'accepted'
          ? 'Your scoped assignment is active. Opening your workspace now.'
          : `You have been invited as ${invitation.roleKey.replace(/_/g, ' ')} for ${invitation.scopeType} ${invitation.scopeId}.`}
      </p>
      <dl className="mt-5 grid gap-2 rounded-[var(--radius-md)] bg-surface-2 p-4 text-left text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">Role</dt><dd className="font-semibold capitalize text-text-strong">{invitation.roleKey.replace(/_/g, ' ')}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Scope</dt><dd className="font-semibold text-text-strong">{invitation.scopeType}:{invitation.scopeId}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd className="font-semibold capitalize text-text-strong">{expired ? 'expired' : invitation.status.replace(/_/g, ' ')}</dd></div>
      </dl>
      {canAccept ? <Button className="mt-5" icon={CheckCircle} onClick={accept}>Accept assignment</Button> : null}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase text-subtle">{label}<span className="mt-2 block normal-case">{children}</span></label>;
}
