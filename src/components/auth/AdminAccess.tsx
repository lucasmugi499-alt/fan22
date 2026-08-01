'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle, EnvelopeSimple, ShieldCheck } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { useAuth } from '@/context/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Invitation, SportSlug, TeamAssignment } from '@/types';
import { assignmentKindForScope, storeSelectedAssignmentId } from '@/lib/auth/assignmentSelection';
import { getPublicAppCheckToken } from '@/lib/firebase/client';

const fanOperatorInvitationMessage = 'Fan accounts stay fan accounts. Sign out and use a League Admin or Team Admin account to accept this setup invitation.';
const operatorInvitationRoles = new Set([
  'league_owner',
  'league_admin',
  'team_owner',
  'team_admin',
  'roster_manager',
  'result_reporter',
  'content_manager',
  'platform_admin',
  'super_admin',
]);

function isOperatorInvitation(roleKey: string) {
  return operatorInvitationRoles.has(roleKey);
}

export function LeagueAdminApplicationForm() {
  const { authStatus, currentUser, userProfile, isDemoMode, accountRole } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [leagueName, setLeagueName] = useState('');
  const [sport, setSport] = useState<SportSlug>('football');
  const [city, setCity] = useState('Kampala');
  const [applicantName, setApplicantName] = useState(userProfile?.name ?? '');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const signedInEmail = currentUser?.email ?? userProfile?.email ?? '';
  const fanUsingCurrentEmail = useMemo(() => (
    accountRole === 'fan' &&
    adminEmail.trim().toLowerCase() === signedInEmail.trim().toLowerCase()
  ), [accountRole, adminEmail, signedInEmail]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const userId = currentUser?.uid ?? userProfile?.uid;
    if (fanUsingCurrentEmail) {
      toast.error('Fan accounts stay fan accounts. Use a separate League Admin setup email.');
      return;
    }
    setSaving(true);
    try {
      if ((authStatus === 'logged_in' && userId) || provider.mode === 'mock') {
        await provider.createLeagueAdminApplication({
          userId: userId ?? `public_applicant_${Date.now()}`,
          applicantName: applicantName.trim(),
          applicantPhone: applicantPhone.trim() || undefined,
          applicantEmail: adminEmail.trim().toLowerCase(),
          leagueName: leagueName.trim(),
          sport,
          city: city.trim(),
          evidenceNote: evidenceNote.trim(),
        });
      } else {
        const appCheckToken = await getPublicAppCheckToken();
        const response = await fetch('/api/league-admin-applications', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(appCheckToken ? { 'x-firebase-appcheck': appCheckToken } : {}),
          },
          body: JSON.stringify({
            applicantName: applicantName.trim(),
            applicantPhone: applicantPhone.trim(),
            applicantEmail: adminEmail.trim().toLowerCase(),
            leagueName: leagueName.trim(),
            sport,
            city: city.trim(),
            evidenceNote: evidenceNote.trim(),
          }),
        });
        const result = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok) throw new Error(result?.error ?? 'Could not submit the application.');
      }
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

  if (submitted) {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <CheckCircle className="mx-auto h-10 w-10 text-verified" weight="fill" />
        <h1 className="mt-3 text-xl font-semibold text-text-strong">Application received</h1>
        <p className="mt-2 text-sm text-muted">
          {isDemoMode
            ? 'Switch to the Platform Admin demo account and approve this application. Approval sends a League Owner setup link to the admin email; your current fan account stays unchanged.'
            : 'A Platform Admin will review the league identity, competition structure, and administrator assignment. Approval sends a League Owner setup link; any existing fan role does not change.'}
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
        <p className="text-sm text-muted">Anyone can submit a league request. Platform Admin can approve it into a connected league record and a separate League Owner setup invite.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your name"><input required value={applicantName} onChange={(event) => setApplicantName(event.target.value)} className="field" /></Field>
        <Field label="Phone or WhatsApp"><input value={applicantPhone} onChange={(event) => setApplicantPhone(event.target.value)} className="field" /></Field>
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
      <Field label="League Admin setup email">
        <input required type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} className="field" placeholder="owner@example.com" />
      </Field>
      {fanUsingCurrentEmail ? (
        <p className="rounded-[var(--radius-md)] border border-[color:var(--state-error)] bg-[color-mix(in_srgb,var(--state-error),transparent_88%)] px-3 py-2 text-sm text-text-strong">
          Fan accounts stay fan accounts. Use the email that should create the League Admin account after approval.
        </p>
      ) : null}
      <Field label="Authority and competition evidence">
        <textarea required rows={5} value={evidenceNote} onChange={(event) => setEvidenceNote(event.target.value)} className="field min-h-32 py-3" placeholder="Your role, league structure, and how the platform can verify this application." />
      </Field>
      <Button type="submit" block icon={ShieldCheck} disabled={saving}>{saving ? 'Submitting...' : 'Submit for review'}</Button>
    </form>
  );
}

export function TeamInvitationAcceptance({ assignmentId, token }: { assignmentId: string; token: string }) {
  const { authStatus, currentUser, userProfile, accountRole, logout } = useAuth();
  const [assignment, setAssignment] = useState<TeamAssignment>();
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const next = `/invitations/team/${encodeURIComponent(assignmentId)}?token=${encodeURIComponent(token)}`;

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
      if (assignment?.teamId) storeSelectedAssignmentId('team', assignment.teamId);
      setAccepted(true);
      toast.success('Team Admin invitation accepted.');
      if (typeof currentUser?.getIdToken === 'function') await currentUser.getIdToken(true);
      window.setTimeout(() => window.location.assign('/team-admin'), 600);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Could not accept this invitation.');
    }
  }

  async function useDifferentAccount() {
    await logout();
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  if (!token) return <Card className="mx-auto max-w-lg p-6 text-center"><h1 className="text-xl font-semibold">Invitation not found</h1><p className="mt-2 text-sm text-muted">This invitation link is incomplete, expired, or has been revoked.</p></Card>;
  if (authStatus !== 'logged_in') {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <EnvelopeSimple className="mx-auto h-9 w-9 text-brand" weight="duotone" />
        <h1 className="mt-3 text-xl font-semibold text-text-strong">Team Admin invitation</h1>
        <p className="mt-2 text-sm text-muted">Sign in or create an invited admin account with the email address that received this assignment.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] bg-brand px-5 text-sm font-semibold text-on-brand">Sign in</Link>
          <Link href={`/register?next=${encodeURIComponent(next)}`} className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] border border-border bg-surface-2 px-5 text-sm font-semibold text-text-strong">Create invited account</Link>
        </div>
      </Card>
    );
  }
  if (loading) return <Skeleton className="mx-auto h-64 max-w-lg rounded-[var(--radius-lg)]" />;
  if (!assignment) return <Card className="mx-auto max-w-lg p-6 text-center"><h1 className="text-xl font-semibold">Invitation not found</h1><p className="mt-2 text-sm text-muted">This invitation may have expired or been revoked.</p></Card>;

  const fanAccountBlocked = accountRole === 'fan' && userProfile?.accountStatus !== 'invited';

  return (
    <Card className="mx-auto max-w-lg p-6 text-center">
      <EnvelopeSimple className="mx-auto h-9 w-9 text-brand" weight="duotone" />
      <h1 className="mt-3 text-xl font-semibold text-text-strong">{accepted ? 'Invitation accepted' : fanAccountBlocked ? 'Use an admin account' : 'Team Admin invitation'}</h1>
      <p className="mt-2 text-sm text-muted">
        {accepted
          ? 'Your assignment and trusted Team Admin access are active. Opening the Team Console now.'
          : fanAccountBlocked
            ? fanOperatorInvitationMessage
          : `You have been invited to administer team ${assignment.teamId} for the ${assignment.seasonId} season.`}
      </p>
      {!accepted && fanAccountBlocked ? <Button className="mt-5" variant="secondary" onClick={useDifferentAccount}>Use a different account</Button> : null}
      {!accepted && !fanAccountBlocked && authStatus === 'logged_in' ? <Button className="mt-5" icon={CheckCircle} onClick={accept}>Accept assignment</Button> : null}
    </Card>
  );
}

export function AccessInvitationAcceptance({ invitationId, token }: { invitationId: string; token: string }) {
  const { authStatus, currentUser, userProfile, isDemoMode, accountRole, logout } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [invitation, setInvitation] = useState<Invitation>();
  const [loading, setLoading] = useState(true);
  const [accepted, setAccepted] = useState(false);
  const [loadedAt] = useState(() => Date.now());
  const next = `/invitations/access/${encodeURIComponent(invitationId)}?token=${encodeURIComponent(token)}`;

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
      if (invitation) {
        const assignmentKind = assignmentKindForScope(invitation.scopeType);
        if (assignmentKind) storeSelectedAssignmentId(assignmentKind, invitation.scopeId);
      }
      setAccepted(true);
      toast.success('Invitation accepted.');
      if (typeof currentUser?.getIdToken === 'function') await currentUser.getIdToken(true);
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

  async function useDifferentAccount() {
    await logout();
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  if (!token) {
    return <Card className="mx-auto max-w-lg p-6 text-center"><h1 className="text-xl font-semibold">Invitation not found</h1><p className="mt-2 text-sm text-muted">This invitation link is incomplete, expired, or has been revoked.</p></Card>;
  }
  if (authStatus !== 'logged_in') {
    return (
      <Card className="mx-auto max-w-lg p-6 text-center">
        <EnvelopeSimple className="mx-auto h-9 w-9 text-brand" weight="duotone" />
        <h1 className="mt-3 text-xl font-semibold text-text-strong">GoalPlace256 invitation</h1>
        <p className="mt-2 text-sm text-muted">Sign in or create an invited admin account with the email address that received this assignment.</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link href={`/login?next=${encodeURIComponent(next)}`} className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] bg-brand px-5 text-sm font-semibold text-on-brand">Sign in</Link>
          <Link href={`/register?next=${encodeURIComponent(next)}`} className="inline-flex h-11 items-center justify-center rounded-[var(--radius-pill)] border border-border bg-surface-2 px-5 text-sm font-semibold text-text-strong">Create invited account</Link>
        </div>
      </Card>
    );
  }
  if (loading) return <Skeleton className="mx-auto h-64 max-w-lg rounded-[var(--radius-lg)]" />;
  if (!invitation) {
    return <Card className="mx-auto max-w-lg p-6 text-center"><h1 className="text-xl font-semibold">Invitation not found</h1><p className="mt-2 text-sm text-muted">This invitation may have expired, been revoked, or belonged to another environment.</p></Card>;
  }

  const expired = Date.parse(invitation.expiresAt) <= loadedAt;
  const fanAccountBlocked = accountRole === 'fan' && userProfile?.accountStatus !== 'invited' && isOperatorInvitation(invitation.roleKey);
  const canAccept = !accepted && invitation.status !== 'accepted' && !expired && !fanAccountBlocked;

  return (
    <Card className="mx-auto max-w-lg p-6 text-center">
      <EnvelopeSimple className="mx-auto h-9 w-9 text-brand" weight="duotone" />
      <h1 className="mt-3 text-xl font-semibold text-text-strong">{accepted || invitation.status === 'accepted' ? 'Invitation accepted' : fanAccountBlocked ? 'Use an admin account' : 'GoalPlace256 invitation'}</h1>
      <p className="mt-2 text-sm text-muted">
        {accepted || invitation.status === 'accepted'
          ? 'Your scoped assignment is active. Opening your workspace now.'
          : fanAccountBlocked
            ? fanOperatorInvitationMessage
          : `You have been invited as ${invitation.roleKey.replace(/_/g, ' ')} for ${invitation.scopeType} ${invitation.scopeId}.`}
      </p>
      <dl className="mt-5 grid gap-2 rounded-[var(--radius-md)] bg-surface-2 p-4 text-left text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted">Role</dt><dd className="font-semibold capitalize text-text-strong">{invitation.roleKey.replace(/_/g, ' ')}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Scope</dt><dd className="font-semibold text-text-strong">{invitation.scopeType}:{invitation.scopeId}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">Status</dt><dd className="font-semibold capitalize text-text-strong">{expired ? 'expired' : invitation.status.replace(/_/g, ' ')}</dd></div>
      </dl>
      {fanAccountBlocked ? <Button className="mt-5" variant="secondary" onClick={useDifferentAccount}>Use a different account</Button> : null}
      {canAccept ? <Button className="mt-5" icon={CheckCircle} onClick={accept}>Accept assignment</Button> : null}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-semibold uppercase text-subtle">{label}<span className="mt-2 block normal-case">{children}</span></label>;
}
