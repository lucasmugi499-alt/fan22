'use client';

import Link from 'next/link';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { DirectoryRow, EmptyState, PlatformAdminHeader, PlatformStatGrid, StatusChip } from '@/components/platform/PlatformAdminPrimitives';

type DetailKind = 'application' | 'league' | 'team' | 'person' | 'trust' | 'sponsor' | 'campaign';

export function PlatformEntityDetail({ kind, id }: { kind: DetailKind; id: string }) {
  const data = useGoalPlaceData({
    collections: ['leagueAdminApplications', 'leagues', 'teams', 'athletes', 'matches', 'teamAssignments', 'users', 'reports', 'adminAuditEvents', 'sponsors', 'sponsorCampaigns', 'sponsorReports'],
    recordLimit: 700,
  });

  if (data.loading) return <Skeleton className="h-[560px] rounded-[var(--radius-lg)]" />;

  if (kind === 'application') {
    const application = data.leagueAdminApplications.find((item) => item.id === id);
    if (!application) return <Missing title="Application not found" back="/admin/applications" />;
    return (
      <section className="space-y-5">
        <PlatformAdminHeader eyebrow="Application" title={application.leagueName} description="Application detail workspace for applicant review, evidence, risk checks, decision history and audit." action={<Back href="/admin/applications" />} />
        <PlatformStatGrid items={[
          { label: 'Status', value: application.status },
          { label: 'Sport', value: application.sport },
          { label: 'Estimated teams', value: application.estimatedTeams ?? 0 },
          { label: 'Risk flags', value: application.riskFlags?.length ?? 0, tone: application.riskFlags?.length ? 'bad' : 'good' },
        ]} />
        <DetailGrid rows={[
          ['Applicant', `${application.applicantName ?? 'Name pending'} · ${application.applicantEmail ?? 'email pending'}`],
          ['Location', `${application.city}${application.region ? ` · ${application.region}` : ''}`],
          ['Evidence', application.evidenceNote],
          ['Current operations', application.currentOperations ?? 'Not supplied'],
          ['Operator invitation', application.invitationId ? `Created: ${application.invitationId}` : 'Not created yet'],
        ]} />
      </section>
    );
  }

  if (kind === 'league') {
    const league = data.leagues.find((item) => item.id === id);
    if (!league) return <Missing title="League not found" back="/admin/organizations" />;
    const teams = data.teams.filter((item) => item.leagueId === id);
    const matches = data.matches.filter((item) => item.leagueId === id);
    const audit = data.adminAuditEvents.filter((item) => item.targetId === id);
    return (
      <section className="space-y-5">
        <PlatformAdminHeader eyebrow="League" title={league.name} description="League governance workspace for identity, seasons, teams, administrators, data quality, incidents and audit." action={<Back href="/admin/organizations" />} />
        <PlatformStatGrid items={[
          { label: 'Teams', value: teams.length },
          { label: 'Matches', value: matches.length },
          { label: 'Verified result rate', value: `${league.verifiedResultsRate ?? 0}%` },
          { label: 'Status', value: league.lifecycleStatus ?? league.status, tone: league.status === 'suspended' ? 'bad' : league.verified ? 'good' : 'warn' },
        ]} />
        <Card className="p-4">
          <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Teams</h2>
          <div className="space-y-2.5">
            {teams.map((team) => <DirectoryRow key={team.id} href={`/admin/teams/${team.id}`} title={team.name} meta={`${team.city} · ${team.sport}`} status={team.verificationStatus ?? (team.verified ? 'verified' : 'pending')} statusTone={team.verified ? 'good' : 'warn'} />)}
          </div>
        </Card>
        <AuditPreview rows={audit} />
      </section>
    );
  }

  if (kind === 'team') {
    const team = data.teams.find((item) => item.id === id);
    if (!team) return <Missing title="Team not found" back="/admin/organizations" />;
    const athletes = data.athletes.filter((item) => item.teamId === id);
    const matches = data.matches.filter((item) => item.homeTeamId === id || item.awayTeamId === id);
    const assignments = data.teamAssignments.filter((item) => item.teamId === id);
    return (
      <section className="space-y-5">
        <PlatformAdminHeader eyebrow="Team" title={team.name} description="Team governance workspace for roster, administrators, fixtures, results, athlete claims, media, incidents and audit." action={<Back href="/admin/organizations" />} />
        <PlatformStatGrid items={[
          { label: 'Athletes', value: athletes.length },
          { label: 'Matches', value: matches.length },
          { label: 'Administrators', value: assignments.length },
          { label: 'Status', value: team.verificationStatus ?? (team.verified ? 'verified' : 'pending'), tone: team.verificationStatus === 'rejected' ? 'bad' : team.verified ? 'good' : 'warn' },
        ]} />
        <DetailGrid rows={[
          ['League', data.leagues.find((item) => item.id === team.leagueId)?.name ?? team.leagueId],
          ['Location', team.location ?? team.city],
          ['Record', `${team.wins}-${team.draws ?? 0}-${team.losses}`],
          ['Support', `${team.totalSupport.toLocaleString()} UGX · ${team.supportersCount} supporters`],
        ]} />
      </section>
    );
  }

  if (kind === 'person') {
    const user = data.users.find((item) => item.id === id);
    if (!user) return <Missing title="Person not found" back="/admin/people" />;
    const assignments = data.teamAssignments.filter((item) => item.userId === id || item.invitedEmail === user.email);
    const audit = data.adminAuditEvents.filter((item) => item.actorUserId === id || item.targetId === id);
    return (
      <section className="space-y-5">
        <PlatformAdminHeader eyebrow="Person" title={user.displayName || user.name || user.email} description="Account, identity, assignments, organizations, security, cases, activity and audit." action={<Back href="/admin/people" />} />
        <PlatformStatGrid items={[
          { label: 'Account class', value: user.accountClass ?? 'legacy' },
          { label: 'Status', value: user.accountStatus ?? user.status },
          { label: 'Assignments', value: assignments.length },
          { label: 'Access version', value: user.accessVersion ?? 1 },
        ]} />
        <DetailGrid rows={[
          ['Email', user.email],
          ['Role', user.role.replace(/_/g, ' ')],
          ['Onboarding', user.onboardingStatus ?? 'not recorded'],
          ['Person link', user.personId ?? 'Not linked'],
        ]} />
        <AuditPreview rows={audit} />
      </section>
    );
  }

  if (kind === 'trust') {
    const report = data.reports.find((item) => item.id === id);
    if (!report) return <Missing title="Trust case not found" back="/admin/trust" />;
    return (
      <section className="space-y-5">
        <PlatformAdminHeader eyebrow="Trust case" title={report.summary} description="Investigation workspace for evidence, related entities, internal notes, restrictions, decision and audit." action={<Back href="/admin/trust" />} />
        <PlatformStatGrid items={[
          { label: 'Status', value: report.status },
          { label: 'Severity', value: report.severity ?? 'unrated' },
          { label: 'Type', value: report.type.replace(/_/g, ' ') },
          { label: 'Reviewer', value: report.assignedReviewer ?? 'unassigned' },
        ]} />
        <DetailGrid rows={[
          ['Reporter', report.reporterName ?? report.reporterId],
          ['Affected entity', report.affectedEntity ?? report.reportedEntity ?? 'Not specified'],
          ['Reason flagged', report.reasonFlagged ?? 'Not specified'],
          ['Action history', report.actionHistory?.join(' · ') ?? 'No actions recorded'],
        ]} />
      </section>
    );
  }

  const missingHref = kind === 'sponsor' ? '/admin/sponsors' : '/admin/sponsors';
  return <Missing title="Detail workspace not found" back={missingHref} />;
}

function DetailGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <Card className="p-4">
      <div className="grid gap-3 md:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-subtle">{label}</p>
            <p className="mt-1 text-sm text-text-strong">{value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function AuditPreview({ rows }: { rows: Array<{ id: string; action: string; targetCollection: string; targetId: string; note?: string; createdAt: string }> }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-[15px] font-semibold text-text-strong">Audit preview</h2>
      <div className="space-y-2.5">
        {rows.length ? rows.slice(0, 8).map((event) => (
          <DirectoryRow key={event.id} title={event.action.replace(/_/g, ' ')} meta={`${event.targetCollection}/${event.targetId}`} status={new Date(event.createdAt).toLocaleString()} detail={event.note ? <span className="text-xs text-muted">{event.note}</span> : <StatusChip label="immutable" tone="good" />} />
        )) : (
          <EmptyState title="No audit events in this preview">Related server-owned audit history will appear here.</EmptyState>
        )}
      </div>
    </Card>
  );
}

function Missing({ title, back }: { title: string; back: string }) {
  return (
    <section className="space-y-5">
      <PlatformAdminHeader eyebrow="Platform detail" title={title} description="The requested platform record is not available in the loaded data window." action={<Back href={back} />} />
      <EmptyState title="Record unavailable">Return to the directory and open a visible record.</EmptyState>
    </section>
  );
}

function Back({ href }: { href: string }) {
  return (
    <Link href={href} className="inline-flex h-11 items-center rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 text-sm font-semibold text-text-strong hover:bg-surface-3">
      Back to directory
    </Link>
  );
}
