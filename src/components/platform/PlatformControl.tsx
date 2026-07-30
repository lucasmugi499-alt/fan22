'use client';

import Link from 'next/link';
import { useMemo, useState, type FormEvent } from 'react';
import {
  Buildings,
  CheckCircle,
  Flag,
  PaperPlaneTilt,
  PlusCircle,
  ShieldCheck,
  Warning,
  XCircle,
} from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { pendingApprovals, openReports, disputedMatches } from '@/lib/platform/platformContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { QueueItem } from '@/components/core/QueueItem';
import { STATE } from '@/lib/statusSystem';
import { cn } from '@/lib/utils';
import type { League, LeagueStatus, PlanType, SportSlug, TeamAssignment } from '@/types';

const fieldClass = 'mt-1.5 h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text-strong outline-none placeholder:text-subtle focus:border-brand';
const areaClass = 'mt-1.5 min-h-24 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2 text-sm text-text-strong outline-none placeholder:text-subtle focus:border-brand';

type LeagueEditDraft = {
  leagueId: string;
  name: string;
  city: string;
  description: string;
  status: LeagueStatus;
  plan: PlanType;
};

function slugPart(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 44) || 'team';
}

function sportSlug(value: League['sport']): SportSlug {
  if (value === 'Basketball') return 'basketball';
  if (value === 'Rugby') return 'rugby';
  return value === 'basketball' || value === 'rugby' ? value : 'football';
}

export function PlatformControl() {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const actorUserId = currentUser?.uid ?? userProfile?.uid ?? '';
  const {
    leagues,
    teams,
    seasons,
    athletes,
    matches,
    reports,
    teamAssignments,
    loading,
    retry,
  } = useGoalPlaceData({
    collections: ['leagues', 'teams', 'seasons', 'athletes', 'matches', 'reports', 'teamAssignments'],
    recordLimit: 1200,
  });

  const approvals = useMemo(() => pendingApprovals(leagues, athletes), [leagues, athletes]);
  const reportsOpen = useMemo(() => openReports(reports), [reports]);
  const disputes = useMemo(() => disputedMatches(matches), [matches]);
  const sortedAssignments = useMemo(
    () => [...teamAssignments].sort((a, b) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0)),
    [teamAssignments],
  );
  const firstLeagueId = leagues[0]?.id ?? '';

  const [creatingLeague, setCreatingLeague] = useState(false);
  const [leagueName, setLeagueName] = useState('');
  const [leagueSport, setLeagueSport] = useState<SportSlug>('football');
  const [leagueCity, setLeagueCity] = useState('');
  const [leagueDescription, setLeagueDescription] = useState('');

  const [editingLeagueId, setEditingLeagueId] = useState('');
  const activeEditLeague = leagues.find((league) => league.id === (editingLeagueId || firstLeagueId));
  const [editDraft, setEditDraft] = useState<LeagueEditDraft | null>(null);
  const editValues: LeagueEditDraft = editDraft && editDraft.leagueId === activeEditLeague?.id
    ? editDraft
    : {
        leagueId: activeEditLeague?.id ?? '',
        name: activeEditLeague?.name ?? '',
        city: activeEditLeague?.city ?? '',
        description: activeEditLeague?.description ?? '',
        status: activeEditLeague?.status ?? 'community',
        plan: activeEditLeague?.plan ?? 'free',
      };
  const [savingLeague, setSavingLeague] = useState(false);

  const [teamLeagueId, setTeamLeagueId] = useState('');
  const activeTeamLeague = leagues.find((league) => league.id === (teamLeagueId || firstLeagueId));
  const [teamName, setTeamName] = useState('');
  const [teamCity, setTeamCity] = useState('');
  const [teamAdminEmail, setTeamAdminEmail] = useState('');
  const [creatingTeam, setCreatingTeam] = useState(false);
  const [revokingId, setRevokingId] = useState('');

  function selectEditLeague(leagueId: string) {
    const league = leagues.find((item) => item.id === leagueId);
    setEditingLeagueId(leagueId);
    setEditDraft(league ? {
      leagueId: league.id,
      name: league.name,
      city: league.city,
      description: league.description,
      status: league.status,
      plan: league.plan,
    } : null);
  }

  function patchEditDraft(patch: Partial<LeagueEditDraft>) {
    setEditDraft({
      ...editValues,
      ...patch,
    });
  }

  async function createLeague(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!actorUserId) {
      toast.error('Your Platform Admin account is not ready.');
      return;
    }
    setCreatingLeague(true);
    try {
      const year = new Date().getFullYear();
      await provider.createLeague({
        name: leagueName.trim(),
        sport: leagueSport,
        city: leagueCity.trim(),
        country: 'Uganda',
        description: leagueDescription.trim(),
        status: 'community',
        plan: 'free',
        verified: false,
        adminUserIds: [],
        season: `${year} Season`,
        teamsCount: 0,
        athletesCount: 0,
        matchesCount: 0,
        matchCompletionRate: 0,
        verifiedResultsRate: 0,
        goalPlaceIndex: 45,
        totalSupport: 0,
        supportersCount: 0,
        verificationRules: {
          requiresLeagueAdminApproval: true,
          requiresRefereeConfirmation: false,
          allowsPerformancePledges: true,
        },
      });
      toast.success('League created and connected to a season.');
      setLeagueName('');
      setLeagueCity('');
      setLeagueDescription('');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'League could not be created.');
    } finally {
      setCreatingLeague(false);
    }
  }

  async function saveLeague(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeEditLeague) return;
    setSavingLeague(true);
    try {
      await provider.updateLeagueProfile(activeEditLeague.id, {
        name: editValues.name.trim(),
        city: editValues.city.trim(),
        description: editValues.description.trim(),
        status: editValues.status,
        plan: editValues.plan,
        verified: editValues.status === 'verified' || editValues.status === 'partner',
      });
      toast.success('League updated.');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'League could not be updated.');
    } finally {
      setSavingLeague(false);
    }
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTeamLeague || !actorUserId) {
      toast.error('Choose a league before adding a team.');
      return;
    }
    setCreatingTeam(true);
    try {
      const now = new Date().toISOString();
      let season = seasons.find((item) => item.id === activeTeamLeague.currentSeasonId)
        ?? seasons.find((item) => item.leagueId === activeTeamLeague.id && ['active', 'registration', 'draft'].includes(item.status));
      if (!season) {
        const seasonId = `season_${activeTeamLeague.id}_${new Date().getFullYear()}`;
        await provider.createSeason({
          id: seasonId,
          leagueId: activeTeamLeague.id,
          name: `${new Date().getFullYear()} Season`,
          sport: sportSlug(activeTeamLeague.sport),
          status: 'registration',
          startDate: now.slice(0, 10),
          competitionFormat: 'league',
          scoring: sportSlug(activeTeamLeague.sport) === 'basketball'
            ? { win: 2, draw: null, loss: 0 }
            : sportSlug(activeTeamLeague.sport) === 'rugby'
              ? { win: 4, draw: 2, loss: 0 }
              : { win: 3, draw: 1, loss: 0 },
        });
        season = {
          id: seasonId,
          leagueId: activeTeamLeague.id,
          name: `${new Date().getFullYear()} Season`,
          sport: sportSlug(activeTeamLeague.sport),
          status: 'registration',
          startDate: now.slice(0, 10),
          competitionFormat: 'league',
          scoring: { win: 3, draw: 1, loss: 0 },
          createdAt: now,
        };
      }
      const teamId = `team_${slugPart(teamName)}_${Date.now().toString(36)}`;
      await provider.createTeams([{
        id: teamId,
        name: teamName.trim(),
        sport: sportSlug(activeTeamLeague.sport),
        leagueId: activeTeamLeague.id,
        city: teamCity.trim() || activeTeamLeague.city,
        location: teamCity.trim() || activeTeamLeague.city,
        country: 'Uganda',
        description: `${teamName.trim()} competing in ${activeTeamLeague.name}.`,
        plan: 'free',
        verified: false,
        adminUserIds: [],
        totalSupport: 0,
        supportersCount: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        leaguePoints: 0,
        teamAdminEmail: teamAdminEmail.trim().toLowerCase() || undefined,
        createdAt: now,
      }]);
      if (teamAdminEmail.trim()) {
        await provider.createTeamAdminInvitation({
          id: `invite_${teamId}_${Date.now().toString(36)}`,
          userId: '',
          teamId,
          leagueId: activeTeamLeague.id,
          seasonId: season.id,
          role: 'team_admin',
          status: 'invited',
          invitedByUserId: actorUserId,
          invitedEmail: teamAdminEmail.trim().toLowerCase(),
          createdAt: now,
          updatedAt: now,
        });
      }
      toast.success(teamAdminEmail.trim() ? 'Team created and admin invite sent.' : 'Team created.');
      setTeamName('');
      setTeamCity('');
      setTeamAdminEmail('');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Team could not be created.');
    } finally {
      setCreatingTeam(false);
    }
  }

  async function revokeAssignment(assignment: TeamAssignment) {
    if (!actorUserId) return;
    setRevokingId(assignment.id);
    try {
      await provider.revokeTeamAssignment(assignment.id, actorUserId, 'Revoked from Platform Admin control.');
      toast.success('Team Admin access revoked.');
      retry();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Assignment could not be revoked.');
    } finally {
      setRevokingId('');
    }
  }

  if (loading) return <ControlSkeleton />;

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[var(--radius-md)] bg-brand text-on-brand shadow-[var(--glow-brand)]">
          <ShieldCheck className="h-6 w-6" weight="fill" />
        </span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-strong">Governance</h1>
          <p className="text-sm text-muted">Trust and safety across the whole platform.</p>
        </div>
      </header>

      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Today</p>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Metric icon={CheckCircle} label="Approvals" value={approvals.length} tone={approvals.length ? 'pending' : 'default'} />
        <Metric icon={Flag} label="Open reports" value={reportsOpen.length} tone={reportsOpen.length ? 'disputed' : 'default'} />
        <Metric icon={Warning} label="Disputes" value={disputes.length} tone={disputes.length ? 'pending' : 'default'} />
        <Metric icon={Buildings} label="Leagues" value={leagues.length} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-text-strong">Create league</h2>
              <p className="text-xs text-muted">Start a connected league record with its season ready.</p>
            </div>
            <PlusCircle className="h-6 w-6 text-brand" weight="fill" />
          </div>
          <form onSubmit={createLeague} className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
              League name
              <input required minLength={3} value={leagueName} onChange={(event) => setLeagueName(event.target.value)} className={fieldClass} placeholder="Ntungamo District Football League" />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
                Sport
                <select value={leagueSport} onChange={(event) => setLeagueSport(event.target.value as SportSlug)} className={fieldClass}>
                  <option value="football">Football</option>
                  <option value="basketball">Basketball</option>
                  <option value="rugby">Rugby</option>
                </select>
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
                Region or city
                <input required minLength={2} value={leagueCity} onChange={(event) => setLeagueCity(event.target.value)} className={fieldClass} placeholder="Ntungamo" />
              </label>
            </div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
              Operating note
              <textarea value={leagueDescription} onChange={(event) => setLeagueDescription(event.target.value)} className={areaClass} placeholder="Teams, venues, season structure, and admin contact context." />
            </label>
            <Button type="submit" icon={PlusCircle} disabled={creatingLeague || !leagueName.trim() || !leagueCity.trim()} block>
              {creatingLeague ? 'Creating...' : 'Create connected league'}
            </Button>
          </form>
        </Card>

        <Card className="p-4">
          <div className="mb-3">
            <h2 className="text-[15px] font-semibold text-text-strong">Edit league</h2>
            <p className="text-xs text-muted">Change the public details, status, and plan for any league.</p>
          </div>
          {activeEditLeague ? (
            <form onSubmit={saveLeague} className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
                League
                <select value={activeEditLeague.id} onChange={(event) => selectEditLeague(event.target.value)} className={fieldClass}>
                  {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
                </select>
              </label>
              <input required minLength={3} value={editValues.name} onChange={(event) => patchEditDraft({ name: event.target.value })} className={fieldClass} aria-label="League name" />
              <input required minLength={2} value={editValues.city} onChange={(event) => patchEditDraft({ city: event.target.value })} className={fieldClass} aria-label="League city" />
              <div className="grid gap-3 sm:grid-cols-2">
                <select value={editValues.status} onChange={(event) => patchEditDraft({ status: event.target.value as LeagueStatus })} className={fieldClass} aria-label="League status">
                  <option value="draft">Draft</option>
                  <option value="community">Community</option>
                  <option value="verified">Verified</option>
                  <option value="partner">Partner</option>
                  <option value="suspended">Suspended</option>
                </select>
                <select value={editValues.plan} onChange={(event) => patchEditDraft({ plan: event.target.value as PlanType })} className={fieldClass} aria-label="League plan">
                  <option value="free">Free</option>
                  <option value="pro">Pro</option>
                  <option value="partner">Partner</option>
                </select>
              </div>
              <textarea value={editValues.description} onChange={(event) => patchEditDraft({ description: event.target.value })} className={areaClass} aria-label="League description" />
              <Button type="submit" variant="secondary" icon={CheckCircle} disabled={savingLeague} block>
                {savingLeague ? 'Saving...' : 'Save league changes'}
              </Button>
            </form>
          ) : (
            <Card className="p-4 text-sm text-muted">Create a league first.</Card>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-text-strong">Teams and invitations</h2>
            <p className="text-xs text-muted">Add teams into a league and invite the person who will manage that team.</p>
          </div>
          <PaperPlaneTilt className="h-6 w-6 text-brand" weight="fill" />
        </div>
        <form onSubmit={createTeam} className="grid gap-3 lg:grid-cols-[1.1fr_1fr_0.9fr_1fr_auto] lg:items-end">
          <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
            League
            <select value={activeTeamLeague?.id ?? ''} onChange={(event) => setTeamLeagueId(event.target.value)} className={fieldClass} disabled={!leagues.length}>
              {leagues.map((league) => <option key={league.id} value={league.id}>{league.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
            Team name
            <input required minLength={2} value={teamName} onChange={(event) => setTeamName(event.target.value)} className={fieldClass} placeholder="Ntungamo Falcons" />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
            City
            <input value={teamCity} onChange={(event) => setTeamCity(event.target.value)} className={fieldClass} placeholder={activeTeamLeague?.city ?? 'Kampala'} />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-subtle">
            Admin email
            <input type="email" value={teamAdminEmail} onChange={(event) => setTeamAdminEmail(event.target.value)} className={fieldClass} placeholder="coach@example.com" />
          </label>
          <Button type="submit" icon={PaperPlaneTilt} disabled={creatingTeam || !activeTeamLeague || !teamName.trim()}>
            {creatingTeam ? 'Adding...' : 'Add team'}
          </Button>
        </form>

        <div className="mt-4 space-y-2">
          {sortedAssignments.slice(0, 6).map((assignment) => {
            const team = teams.find((item) => item.id === assignment.teamId);
            const league = leagues.find((item) => item.id === assignment.leagueId);
            return (
              <div key={assignment.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-text-strong">{assignment.invitedEmail ?? assignment.userId}</p>
                  <p className="truncate text-xs text-muted">{team?.name ?? assignment.teamId} · {league?.name ?? assignment.leagueId} · {assignment.emailDelivery ?? 'pending email'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={cn(
                    'rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize',
                    assignment.status === 'active' ? 'bg-brand-subtle text-brand' : assignment.status === 'revoked' ? 'bg-[color-mix(in_srgb,var(--state-error),transparent_84%)] text-[var(--state-error)]' : 'bg-surface-3 text-muted',
                  )}>
                    {assignment.status}
                  </span>
                  {assignment.status !== 'revoked' ? (
                    <Button size="sm" variant="ghost" icon={XCircle} onClick={() => revokeAssignment(assignment)} disabled={revokingId === assignment.id}>
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!sortedAssignments.length ? <p className="rounded-[var(--radius-md)] bg-surface-2 p-3 text-sm text-muted">No team invitations yet.</p> : null}
        </div>
      </Card>

      <Section title="Awaiting approval" href="/admin/approvals">
        {approvals.length ? (
          <div className="space-y-2.5">
            {approvals.slice(0, 3).map((a) => (
              <QueueItem key={`${a.kind}-${a.id}`} state={STATE.pending} title={a.title} subtitle={a.subtitle} />
            ))}
          </div>
        ) : (
          <Card className="p-4 text-sm text-muted">Nothing awaiting approval.</Card>
        )}
      </Section>

      <Section title="Open reports" href="/admin/trust">
        {reportsOpen.length ? (
          <div className="space-y-2.5">
            {reportsOpen.slice(0, 3).map((r) => (
              <QueueItem key={r.id} state={STATE.disputed} title={r.summary} subtitle={`${r.type.replace(/_/g, ' ')} · ${r.severity ?? 'unrated'}`} />
            ))}
          </div>
        ) : (
          <Card className="p-4 text-sm text-muted">No open reports.</Card>
        )}
      </Section>
    </div>
  );
}

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-text-strong">{title}</h2>
        <Link href={href} className="text-sm font-medium text-brand hover:underline">View all</Link>
      </div>
      {children}
    </section>
  );
}

function Metric({ icon: Icon, label, value, tone = 'default' }: { icon: typeof Flag; label: string; value: number; tone?: 'default' | 'pending' | 'disputed' }) {
  const color = tone === 'pending' ? 'text-[var(--state-pending)]' : tone === 'disputed' ? 'text-[var(--state-disputed)]' : 'text-text-strong';
  return (
    <Card className="p-3.5">
      <span className="mb-2 inline-grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-muted"><Icon className="h-4 w-4" weight="bold" /></span>
      <p data-numeric className={cn('tabular text-2xl font-bold tabular-nums', color)}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}

function ControlSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-12 w-52" />
      <div className="grid grid-cols-4 gap-2.5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-[var(--radius-lg)]" />)}</div>
      <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}
