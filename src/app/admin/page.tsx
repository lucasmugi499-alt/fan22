'use client';

import React, { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  Activity01Icon,
  Alert01Icon,
  Building01Icon,
  CheckmarkCircle01Icon,
  Coins01Icon,
  Download01Icon,
  Flag01Icon,
  SecurityCheckIcon,
  Settings01Icon,
} from 'hugeicons-react';
import { Trophy } from '@phosphor-icons/react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Button } from '@/components/ui/button';
import {
  ActionToolbar,
  AdminTabBar,
  AppPageHeader,
  DashboardSection,
  DashboardStatGrid,
  DataCard,
  DataTableCard,
  DemoNotice,
  DetailDrawer,
  ImpactStatCard,
  MobileDataCard,
  PageContainer,
  SportBadge,
  StatusBadge,
  StatusExplainerChip,
  WorkQueueCard,
} from '@/components/ui/product';
import { LeagueStatusBadge } from '@/components/ui/league';
import { dataProvider } from '@/data/dataProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { isFirebaseConfigured } from '@/lib/firebase/client';
import { formatUGX } from '@/lib/sportThemes';
import { AwardCategory, Report, Sponsor, User } from '@/types';
import { ReviewDisputeDrawer, ReviewPayoutDrawer } from '@/components/modals/demo-modals';

type DrawerState = {
  title: string;
  description: string;
  body: React.ReactNode;
};

function statusTone(status?: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold' {
  const value = status?.toLowerCase() ?? '';
  if (value.includes('active') || value.includes('verified') || value.includes('resolved') || value.includes('operational')) return 'success';
  if (value.includes('pending') || value.includes('review') || value.includes('open')) return 'warning';
  if (value.includes('high') || value.includes('critical') || value.includes('suspended') || value.includes('hidden')) return 'danger';
  if (value.includes('partner') || value.includes('sponsor')) return 'gold';
  if (value.includes('configured') || value.includes('normal')) return 'info';
  return 'neutral';
}

function formatDate(value?: string) {
  if (!value) return 'Date pending';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value));
}

function MiniMeta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-200">{value}</p>
    </div>
  );
}

function actionHistoryText(history?: string[]) {
  return history?.length ? history.join(' -> ') : 'No action history yet';
}

export default function AdminPage() {
  return (
    <RoleGuard allowedRoles={['platform_admin', 'super_admin']}>
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading admin...</div>}>
        <AdminDashboard />
      </Suspense>
    </RoleGuard>
  );
}

function AdminDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { leagues, matches, athletes, teams, feedPosts, challenges, reports, verifications, source } = useGoalPlaceData();
  const [users, setUsers] = useState<User[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [awards, setAwards] = useState<AwardCategory[]>([]);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [approvedLeagueIds, setApprovedLeagueIds] = useState<Set<string>>(new Set());
  const [suspendedLeagueIds, setSuspendedLeagueIds] = useState<Set<string>>(new Set());
  const [approvedAthleteIds, setApprovedAthleteIds] = useState<Set<string>>(new Set());
  const [reportDecisions, setReportDecisions] = useState<Record<string, string>>({});
  const [verificationDecisions, setVerificationDecisions] = useState<Record<string, string>>({});
  const [approvedPayoutIds, setApprovedPayoutIds] = useState<Set<string>>(new Set());
  const [heldPayoutIds, setHeldPayoutIds] = useState<Set<string>>(new Set());
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());
  const [escalatedPostIds, setEscalatedPostIds] = useState<Set<string>>(new Set());
  const [savedPlatformSettings, setSavedPlatformSettings] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      dataProvider.getUsers(),
      dataProvider.getSponsors(),
      dataProvider.getAwardCategories(),
    ]).then(([nextUsers, nextSponsors, nextAwards]) => {
      if (cancelled) return;
      setUsers(nextUsers);
      setSponsors(nextSponsors);
      setAwards(nextAwards);
    }).catch(() => {
      toast.error('Demo admin metadata could not load.');
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const pendingMatches = matches.filter((match) => String(match.verificationStatus).toLowerCase().includes('pending'));
  const pendingLeagues = leagues.filter((league) => league.status !== 'partner').slice(0, 5);
  const platformReports = useMemo(() => {
    const fallback: Report[] = [
      { id: 'report_001', reporterId: 'demo_reporter_001', type: 'reported_feed_post', summary: feedPosts[0]?.caption.slice(0, 52) ?? 'Feed post', reporterName: 'Content desk', reportedEntity: 'Feed post', severity: 'Medium', status: 'reviewing', assignedReviewer: 'Moderation desk', lastUpdate: '18m ago', createdAt: new Date().toISOString() },
      { id: 'report_002', reporterId: 'demo_reporter_002', type: 'disputed_match_result', summary: matches[1] ? `${matches[1].homeTeamId} / ${matches[1].awayTeamId}` : 'Match result', reporterName: 'League ops', reportedEntity: 'Match result', severity: 'High', status: 'open', assignedReviewer: 'League operations', lastUpdate: '42m ago', createdAt: new Date().toISOString() },
    ];
    return (reports.length ? reports : fallback).slice(0, 8).map((report) => ({
      id: report.id,
      type: report.type.replaceAll('_', ' '),
      reporter: report.reporterName ?? report.reporterId,
      reportedEntity: report.reportedEntity ?? report.summary,
      severity: report.severity ?? 'Medium',
      status: report.status,
      reviewer: report.assignedReviewer ?? 'Unassigned',
      updated: report.lastUpdate ?? formatDate(report.updatedAt ?? report.createdAt),
      reason: report.reasonFlagged ?? report.summary,
      history: report.actionHistory,
    }));
  }, [feedPosts, matches, reports]);

  const payoutRows = challenges.slice(0, 5).map((challenge, index) => {
    const athlete = athletes.find((item) => item.id === challenge.athleteId);
    const team = teams.find((item) => item.id === athlete?.teamId);
    const fee = Math.round(challenge.totalPledged * 0.03);
    return {
      id: `platform_payout_${challenge.id}`,
      athlete,
      team,
      supportType: index % 2 === 0 ? 'Performance challenge' : 'Athlete support pool',
      amount: challenge.totalPledged,
      fee,
      net: challenge.totalPledged - fee,
      status: index === 0 ? 'Ready for approval' : 'Evidence review',
      type: challenge.description,
    };
  });

  const tabs = useMemo(() => [
    'Overview',
    'Users',
    'Leagues',
    'Athletes',
    'Teams',
    'Verifications',
    'Reports',
    'Feed Moderation',
    'Support/Payout Review',
    'Sponsors',
    'Awards',
    'System Health',
    'Settings',
  ], []);
  const tabGroups = useMemo(() => [
    { label: 'Control', tabs: ['Overview', 'Users', 'Leagues', 'Athletes', 'Teams'] },
    { label: 'Trust', tabs: ['Verifications', 'Reports', 'Feed Moderation', 'Support/Payout Review'] },
    { label: 'Growth', tabs: ['Sponsors', 'Awards'] },
    { label: 'System', tabs: ['System Health', 'Settings'] },
  ], []);
  const routeTab = searchParams?.get('tab');
  const routeKey = searchParams?.toString() ?? '';
  const [localTab, setLocalTab] = useState<{ routeKey: string; tab: string | null }>({ routeKey, tab: null });
  const activeTab = localTab.routeKey === routeKey && localTab.tab
    ? localTab.tab
    : routeTab && tabs.includes(routeTab)
      ? routeTab
      : 'Overview';
  const setActiveTab = (tab: string) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (tab === 'Overview') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const query = params.toString();
    setLocalTab({ routeKey: query, tab });
    router.replace(`/admin${query ? `?${query}` : ''}`, { scroll: false });
  };

  const openDetail = (
    title: string,
    description: string,
    details: [string, React.ReactNode][],
    actionLabel = `Record ${title} Decision`,
    onAction?: () => void
  ) => {
    setDrawer({
      title,
      description,
      body: (
        <div className="space-y-4">
          {details.map(([label, value]) => <MiniMeta key={label} label={label} value={value} />)}
          <Button className="w-full" onClick={() => { onAction?.(); setDrawer(null); toast.success(`${title} action recorded in demo mode.`); }}>{actionLabel}</Button>
        </div>
      ),
    });
  };

  const approveLeague = (leagueId: string) => {
    setApprovedLeagueIds((items) => new Set([...items, leagueId]));
    toast.success('League approval recorded in demo mode.');
  };

  const suspendLeague = (leagueId: string) => {
    setSuspendedLeagueIds((items) => new Set([...items, leagueId]));
    toast.success('League suspension marked locally.');
  };

  const adminQueues = [
    {
      title: 'League Approvals Queue',
      entity: pendingLeagues[0]?.name ?? 'Kampala Youth League',
      detail: `${pendingLeagues.length} league records need application, admin, and competition status review.`,
      priority: 'High' as const,
      submittedAt: '18m ago',
      actionLabel: 'Review League Application',
      action: () => setActiveTab('Leagues'),
    },
    {
      title: 'Report Moderation Queue',
      entity: platformReports[0]?.reportedEntity ?? 'Reported feed post',
      detail: `${platformReports.length} moderation or dispute reports are open or under review.`,
      priority: 'Medium' as const,
      submittedAt: platformReports[0]?.updated ?? '42m ago',
      actionLabel: 'Review Moderation Report',
      action: () => setActiveTab('Reports'),
    },
    {
      title: 'Payout Review Queue',
      entity: payoutRows[0]?.athlete?.name ?? 'Athlete support release',
      detail: `${payoutRows.length} demo payout reviews need evidence checks before a demo approval can be recorded.`,
      priority: 'High' as const,
      submittedAt: 'Today',
      actionLabel: 'Review Payout Request',
      action: () => setActiveTab('Support/Payout Review'),
    },
    {
      title: 'Sponsor Package Queue',
      entity: sponsors[0]?.name ?? 'Sponsor package',
      detail: 'Review package status, impact reporting readiness, and public visibility before renewal.',
      priority: 'Low' as const,
      submittedAt: '2h ago',
      actionLabel: 'Manage Sponsor Package',
      action: () => setActiveTab('Sponsors'),
    },
  ];

  const firstLeague = pendingLeagues[0] ?? leagues[0];
  const firstVerification = verifications[0];
  const firstSponsor = sponsors[0];
  const firstPayout = payoutRows[0];
  const adminActions: Record<string, { label: string; icon: React.ElementType; variant?: React.ComponentProps<typeof Button>['variant']; onClick: () => void }[]> = {
    Overview: [
      { label: 'Review Approvals', icon: CheckmarkCircle01Icon, onClick: () => setActiveTab('Leagues') },
      { label: 'Review Escalations', icon: Alert01Icon, variant: 'outline', onClick: () => setActiveTab('Reports') },
      { label: 'Export Platform Report', icon: Download01Icon, variant: 'outline', onClick: () => openDetail('Platform Report', 'Export a demo platform operating summary.', [['Leagues', leagues.length], ['Pending approvals', pendingLeagues.length], ['Reports', platformReports.length], ['Data mode', source]], 'Prepare Export') },
    ],
    Leagues: [
      { label: 'Approve League', icon: CheckmarkCircle01Icon, onClick: () => firstLeague && approveLeague(firstLeague.id) },
      { label: 'Inspect League', icon: Building01Icon, variant: 'outline', onClick: () => firstLeague && openDetail(firstLeague.name, 'League application detail.', [['Plan', firstLeague.plan], ['Teams', firstLeague.teamsCount], ['Athletes', firstLeague.athletesCount], ['Support', formatUGX(firstLeague.totalSupport)]], 'Close Inspection') },
      { label: 'Suspend League', icon: Flag01Icon, variant: 'destructive', onClick: () => firstLeague && suspendLeague(firstLeague.id) },
    ],
    Verifications: [
      { label: 'Review Evidence', icon: SecurityCheckIcon, onClick: () => firstVerification && openDetail(firstVerification.relatedLabel ?? firstVerification.type, 'Verification evidence detail.', [['Evidence', firstVerification.evidenceStatus ?? 'Evidence pending'], ['Amount affected', formatUGX(firstVerification.amountAffected ?? 0)], ['Action history', actionHistoryText(firstVerification.actionHistory)]], 'Close Evidence Review') },
      { label: 'Approve Verification', icon: CheckmarkCircle01Icon, variant: 'outline', onClick: () => firstVerification && setVerificationDecisions((items) => ({ ...items, [firstVerification.id]: 'verified' })) },
      { label: 'Reject Verification', icon: Flag01Icon, variant: 'outline', onClick: () => firstVerification && setVerificationDecisions((items) => ({ ...items, [firstVerification.id]: 'rejected' })) },
    ],
    Sponsors: [
      { label: 'Manage Sponsor Package', icon: Coins01Icon, onClick: () => firstSponsor && openDetail(firstSponsor.name, 'Sponsor package and impact reporting detail.', [['Package', firstSponsor.packageType.replaceAll('_', ' ')], ['Commitment', formatUGX(firstSponsor.amountCommitted)], ['Category', firstSponsor.category]], 'Save Sponsor Review') },
      { label: 'Generate Sponsor Report', icon: Download01Icon, variant: 'outline', onClick: () => firstSponsor && openDetail('Sponsor Report', 'Generate a demo impact report for sponsor review.', [['Sponsor', firstSponsor.name], ['Impact', firstSponsor.impactSummary], ['Commitment', formatUGX(firstSponsor.amountCommitted)]], 'Generate Report') },
    ],
    'Support/Payout Review': [
      { label: 'Review Payout', icon: Coins01Icon, onClick: () => setModalOpen('reviewPayout') },
      { label: 'Approve Demo Review', icon: CheckmarkCircle01Icon, variant: 'gold', onClick: () => firstPayout && setApprovedPayoutIds((items) => new Set([...items, firstPayout.id])) },
      { label: 'Hold for Evidence', icon: Flag01Icon, variant: 'outline', onClick: () => firstPayout && setHeldPayoutIds((items) => new Set([...items, firstPayout.id])) },
    ],
    'System Health': [
      { label: 'View Logs', icon: Activity01Icon, onClick: () => openDetail('System Logs', 'Review recent demo platform events.', [['Data mode', source], ['Reports open', platformReports.length], ['Firebase configured', isFirebaseConfigured ? 'Yes' : 'No']], 'Close Logs') },
      { label: 'Check Data Mode', icon: CheckmarkCircle01Icon, variant: 'outline', onClick: () => openDetail('Data Mode', 'Check current data provider and readiness.', [['Current source', source], ['Mock fallback', 'Ready'], ['Firestore', isFirebaseConfigured ? 'Configured' : 'Not configured']], 'Close Data Check') },
      { label: 'Export Diagnostics', icon: Download01Icon, variant: 'outline', onClick: () => openDetail('Diagnostics Export', 'Prepare a demo diagnostics bundle.', [['Leagues loaded', leagues.length], ['Athletes loaded', athletes.length], ['Known warnings', isFirebaseConfigured ? 'None active' : 'Firebase env missing in mock mode']], 'Prepare Diagnostics') },
    ],
  };
  const activeAdminActions = adminActions[activeTab] ?? [];

  return (
    <PageContainer compact className="space-y-6">
      <AppPageHeader
        eyebrow="Company control center"
        title="Platform Control Center"
        description="Operate GoalPlace256 across approvals, moderation, verification, support review, sponsors, awards, and system readiness."
        meta={
          <>
            <StatusBadge tone="success">Platform Health: Operational</StatusBadge>
            <StatusBadge tone="info">Data mode: {source}</StatusBadge>
            <StatusBadge tone="warning">{pendingMatches.length + pendingLeagues.length} pending approvals</StatusBadge>
          </>
        }
      />

      <AdminTabBar tabs={tabs} groups={tabGroups} activeTab={activeTab} onTabChange={setActiveTab} />

      <DashboardStatGrid>
        <ImpactStatCard label="Leagues" value={String(leagues.length)} detail={`${pendingLeagues.length} need review`} icon={Building01Icon} />
        <ImpactStatCard label="Athletes" value={String(athletes.length)} detail={`${athletes.filter((item) => item.verified).length} verified`} icon={Trophy} tone="gold" />
        <ImpactStatCard label="Reports" value={String(platformReports.length)} detail="Moderation and support issues" icon={Alert01Icon} tone="orange" />
        <ImpactStatCard label="Payout reviews" value={String(payoutRows.length)} detail="Demo payout reviews only" icon={Coins01Icon} tone="blue" />
      </DashboardStatGrid>

      {activeAdminActions.length > 0 && (
        <ActionToolbar>
          {activeAdminActions.map((action) => {
            const Icon = action.icon;
            return (
              <Button key={action.label} size="sm" variant={action.variant} onClick={action.onClick}>
                <Icon className="size-4" />
                {action.label}
              </Button>
            );
          })}
        </ActionToolbar>
      )}

      {activeTab === 'Overview' && (
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <DashboardSection eyebrow="Control Queues" title="Admin priorities">
            <div className="grid gap-3">
              {adminQueues.map((queue) => (
                <WorkQueueCard
                  key={queue.title}
                  title={queue.title}
                  entity={queue.entity}
                  detail={queue.detail}
                  priority={queue.priority}
                  submittedAt={queue.submittedAt}
                  actionLabel={queue.actionLabel}
                  onAction={queue.action}
                />
              ))}
            </div>
          </DashboardSection>
          <DashboardSection eyebrow="Activity" title="Recent admin activity">
            <div className="space-y-3">
              {['Verification rules synced for football leagues.', 'Flagged post restored after review.', 'Sponsor package metrics refreshed.', 'Demo payout review exported for finance.'].map((item, index) => (
                <DataCard key={item} className="flex items-start gap-3">
                  <Activity01Icon className="mt-1 size-5 text-[var(--goal-mint)]" />
                  <div>
                    <p className="font-bold text-white">{item}</p>
                    <p className="mt-1 text-xs text-slate-500">{index + 1}h ago</p>
                  </div>
                </DataCard>
              ))}
            </div>
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Users' && (
        <DashboardSection eyebrow="Users" title="Registered accounts" action={<Button variant="outline" onClick={() => openDetail('User Export', 'Prepare a demo user account export.', [['Users in view', users.length], ['Roles included', 'Fan, Athlete, Team Admin, League Admin, Platform Admin'], ['Data mode', source]], 'Prepare User Export')}><Download01Icon className="size-4" /> Export Users</Button>}>
          <DataTableCard className="hidden lg:block">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-white/6 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                <tr><th className="px-4 py-3">Name</th><th>Email</th><th>Role</th><th>Status</th><th>City</th><th>Points</th><th>Wallet</th><th className="px-4">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {users.slice(0, 12).map((user) => (
                  <tr key={user.id}>
                    <td className="px-4 py-4 font-bold text-white">{user.displayName}</td>
                    <td className="text-slate-300">{user.email}</td>
                    <td className="text-slate-300">{user.role.replace('_', ' ')}</td>
                    <td><StatusBadge tone={statusTone(user.status)}>{user.status}</StatusBadge></td>
                    <td className="text-slate-300">{user.city}</td>
                    <td className="text-slate-300">{user.points}</td>
                    <td className="text-slate-300">{formatUGX(user.walletBalance)}</td>
                    <td className="px-4"><Button size="sm" variant="outline" onClick={() => openDetail(user.displayName, 'User profile and admin controls.', [['Email', user.email], ['Role', user.role], ['Status', user.status], ['Points', user.points], ['Wallet', formatUGX(user.walletBalance)], ['Joined', formatDate(user.createdAt)]])}>Inspect User Account</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableCard>
          <div className="grid gap-3 lg:hidden">
            {users.slice(0, 8).map((user) => (
              <MobileDataCard key={user.id} title={user.displayName} eyebrow={user.email} meta={<StatusBadge tone={statusTone(user.status)}>{user.status}</StatusBadge>} actions={<Button size="sm" variant="outline" onClick={() => openDetail(user.displayName, 'User profile and admin controls.', [['Email', user.email], ['Role', user.role], ['City', user.city]])}>Inspect User Account</Button>}>
                <div className="grid grid-cols-2 gap-3">
                  <MiniMeta label="Role" value={user.role.replace('_', ' ')} />
                  <MiniMeta label="Points" value={user.points} />
                  <MiniMeta label="Wallet" value={formatUGX(user.walletBalance)} />
                </div>
              </MobileDataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Leagues' && (
        <DashboardSection eyebrow="Leagues" title="League verification and plans">
          <div className="grid gap-3">
            {leagues.map((league) => {
              const approved = approvedLeagueIds.has(league.id);
              const suspended = suspendedLeagueIds.has(league.id);
              return (
                <MobileDataCard key={league.id} title={league.name} eyebrow={`${league.city} • ${league.sport}`} meta={<LeagueStatusBadge status={suspended ? 'suspended' : approved ? 'verified' : league.status} />} actions={<><Button size="sm" onClick={() => approveLeague(league.id)}>Approve League</Button><Button size="sm" variant="outline" onClick={() => openDetail(league.name, 'League verification detail.', [['Plan', league.plan], ['Teams', league.teamsCount], ['Athletes', league.athletesCount], ['Support', formatUGX(league.totalSupport)]])}>Inspect League Application</Button><Button size="sm" variant="destructive" onClick={() => suspendLeague(league.id)}>Suspend League</Button></>}>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniMeta label="Plan" value={league.plan} />
                    <MiniMeta label="Teams" value={league.teamsCount} />
                    <MiniMeta label="Athletes" value={league.athletesCount} />
                    <MiniMeta label="Support" value={formatUGX(league.totalSupport)} />
                  </div>
                </MobileDataCard>
              );
            })}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Athletes' && (
        <DashboardSection eyebrow="Athletes" title="Athlete verification and support">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {athletes.slice(0, 12).map((athlete) => (
              <DataCard key={athlete.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SportBadge sport={athlete.sport} />
                    <h3 className="mt-3 font-display text-lg font-black text-white">{athlete.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{athlete.position} • {teams.find((team) => team.id === athlete.teamId)?.name ?? 'Team pending'}</p>
                  </div>
                  <StatusBadge tone={statusTone(approvedAthleteIds.has(athlete.id) ? 'verified' : athlete.verificationStatus)}>{approvedAthleteIds.has(athlete.id) ? 'verified' : athlete.verificationStatus}</StatusBadge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <MiniMeta label="Profile" value={`${athlete.verified ? 94 : 67}%`} />
                  <MiniMeta label="Support" value={formatUGX(athlete.totalEarnings ?? athlete.totalSupport)} />
                  <MiniMeta label="Actions" value={<Button size="sm" variant="outline" onClick={() => setApprovedAthleteIds((items) => new Set([...items, athlete.id]))}>Approve Verification</Button>} />
                </div>
              </DataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Teams' && (
        <DashboardSection eyebrow="Teams" title="Platform teams">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {teams.slice(0, 12).map((team) => (
              <MobileDataCard key={team.id} title={team.name} eyebrow={`${team.city} • ${team.sport}`} meta={<StatusExplainerChip domain="team" status={team.verified ? 'Verified' : team.verificationStatus ?? 'Pending Verification'} />} actions={<Button size="sm" variant="outline" onClick={() => openDetail(team.name, 'Team profile controls.', [['League', leagues.find((league) => league.id === team.leagueId)?.name ?? 'League pending'], ['Athletes', athletes.filter((athlete) => athlete.teamId === team.id).length], ['Support', formatUGX(team.supportPool ?? team.totalSupport)]])}>Open Team Controls</Button>}>
                <div className="grid grid-cols-2 gap-3">
                  <MiniMeta label="Athletes" value={athletes.filter((athlete) => athlete.teamId === team.id).length} />
                  <MiniMeta label="Support" value={formatUGX(team.supportPool ?? team.totalSupport)} />
                </div>
              </MobileDataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Verifications' && (
        <DashboardSection eyebrow="Trust Queue" title="Verification operating queue" description="Review league, athlete, match, challenge, and support-release evidence from one place.">
          <div className="grid gap-3 lg:grid-cols-2">
            {verifications.slice(0, 10).map((record) => (
              <MobileDataCard
                key={record.id}
                title={record.relatedLabel ?? record.type.replaceAll('_', ' ')}
                eyebrow={`Submitted by ${record.submittedBy} • ${formatDate(record.createdAt)}`}
                meta={<StatusExplainerChip domain="system" status={String(verificationDecisions[record.id] ?? record.status)} />}
                actions={
                  <>
                    <Button size="sm" variant="outline" onClick={() => openDetail(record.relatedLabel ?? record.type, 'Verification record detail.', [['Evidence', record.evidenceStatus ?? 'Evidence pending'], ['Amount affected', formatUGX(record.amountAffected ?? 0)], ['Action history', actionHistoryText(record.actionHistory)]])}>View Verification Evidence</Button>
                    <Button size="sm" onClick={() => setVerificationDecisions((items) => ({ ...items, [record.id]: 'verified' }))}>Approve Verification</Button>
                    <Button size="sm" variant="outline" onClick={() => setVerificationDecisions((items) => ({ ...items, [record.id]: 'rejected' }))}>Reject Verification</Button>
                  </>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMeta label="Type" value={record.type.replaceAll('_', ' ')} />
                  <MiniMeta label="Related record" value={record.relatedId} />
                  <MiniMeta label="Evidence" value={record.evidenceStatus ?? 'Evidence pending'} />
                  <MiniMeta label="Amount affected" value={formatUGX(record.amountAffected ?? 0)} />
                </div>
              </MobileDataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Reports' && (
        <DashboardSection eyebrow="Reports" title="Moderation and dispute reports">
          <div className="grid gap-3 lg:grid-cols-2">
            {platformReports.map((report) => (
              <MobileDataCard
                key={report.id}
                title={report.type}
                eyebrow={`${report.reporter} reported ${report.reportedEntity}`}
                meta={<StatusBadge tone={statusTone(report.severity)}>{report.severity}</StatusBadge>}
                actions={
                  <>
                    <Button size="sm" variant="outline" onClick={() => openDetail(report.type, 'Report detail and moderation notes.', [['Reporter', report.reporter], ['Reported entity', report.reportedEntity], ['Assigned reviewer', report.reviewer], ['Reason', report.reason], ['Action history', actionHistoryText(report.history)]])}>View Report Details</Button>
                    <Button size="sm" onClick={() => setReportDecisions((items) => ({ ...items, [report.id]: 'resolved' }))}>Resolve Report</Button>
                    <Button size="sm" variant="outline" onClick={() => setReportDecisions((items) => ({ ...items, [report.id]: 'escalated' }))}>Escalate Report</Button>
                  </>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMeta label="Report type" value={report.type} />
                  <MiniMeta label="Assigned reviewer" value={report.reviewer} />
                  <MiniMeta label="Status" value={reportDecisions[report.id] ?? report.status} />
                  <MiniMeta label="Last update" value={report.updated} />
                </div>
              </MobileDataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Feed Moderation' && (
        <DashboardSection eyebrow="Content" title="Flagged and high-engagement posts">
          <div className="space-y-3">
            {feedPosts.slice(0, 6).map((post, index) => {
              const hidden = hiddenPostIds.has(post.id);
              const escalated = escalatedPostIds.has(post.id);
              return (
                <MobileDataCard
                  key={post.id}
                  title={post.caption.slice(0, 84)}
                  eyebrow={`${post.authorName} • ${String(post.type).replaceAll('_', ' ')} • ${post.flagReason ?? (index < 2 ? 'Engagement spike review' : 'Routine visibility check')}`}
                  meta={<StatusBadge tone={hidden || escalated ? 'danger' : index < 2 || post.status === 'reported' ? 'warning' : 'success'}>{hidden ? 'Hidden' : escalated ? 'Escalated' : post.status === 'reported' || index < 2 ? 'Flagged' : 'Active'}</StatusBadge>}
                  actions={
                    <>
                      <Button size="sm" variant="outline" onClick={() => openDetail('Feed Post', 'Review post content and engagement context.', [['Author', post.authorName], ['Post type', String(post.type).replaceAll('_', ' ')], ['Reason flagged', post.flagReason ?? 'Engagement spike review'], ['Status', hidden ? 'hidden' : post.status], ['Engagement', `${post.likesCount + post.commentsCount + post.sharesCount} actions`]])}>Review Feed Post</Button>
                      <Button size="sm" variant={hidden ? 'outline' : 'destructive'} onClick={() => { setHiddenPostIds((items) => { const next = new Set(items); if (next.has(post.id)) next.delete(post.id); else next.add(post.id); return next; }); toast.success(hidden ? 'Post restored in demo mode.' : 'Post hidden in demo mode.'); }}>{hidden ? 'Restore Feed Post' : 'Hide Feed Post'}</Button>
                      <Button size="sm" variant="outline" onClick={() => setEscalatedPostIds((items) => new Set([...items, post.id]))}>Escalate Feed Post</Button>
                    </>
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <MiniMeta label="Post author" value={post.authorName} />
                    <MiniMeta label="Engagement" value={`${post.likesCount} likes / ${post.commentsCount} comments / ${post.sharesCount} shares`} />
                  </div>
                </MobileDataCard>
              );
            })}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Support/Payout Review' && (
        <DashboardSection eyebrow="Support/Payout Review" title="Payout review queue" description="Demo payout reviews only. Real payment processing is not enabled.">
          <DemoNotice title="Demo payout reviews only">
            Real payment processing is not enabled. Demo approvals record review intent without moving funds.
          </DemoNotice>
          <div className="grid gap-3 lg:grid-cols-2">
            {payoutRows.map((payout) => (
              <DataCard key={payout.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-black text-white">{payout.athlete?.name ?? 'Athlete support'}</h3>
                    <p className="mt-1 text-sm text-slate-400">{payout.team?.name ?? 'Team pending'} • {payout.supportType}</p>
                  </div>
                  <StatusExplainerChip domain="support" status={approvedPayoutIds.has(payout.id) ? 'Released' : heldPayoutIds.has(payout.id) ? 'Held' : 'Held'} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                  <MiniMeta label="Related challenge" value={payout.type} />
                  <MiniMeta label="Gross amount" value={formatUGX(payout.amount)} />
                  <MiniMeta label="Platform fee" value={formatUGX(payout.fee)} />
                  <MiniMeta label="Net" value={formatUGX(payout.net)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openDetail(payout.athlete?.name ?? 'Support release', 'Payout request detail.', [['Athlete/team', `${payout.athlete?.name ?? 'Athlete'} / ${payout.team?.name ?? 'Team pending'}`], ['Support type', payout.supportType], ['Related challenge', payout.type], ['Net amount', formatUGX(payout.net)]])}>Review Payout Request</Button>
                  <Button size="sm" variant="gold" onClick={() => setApprovedPayoutIds((items) => new Set([...items, payout.id]))}>Approve Demo Review</Button>
                  <Button size="sm" variant="outline" onClick={() => setHeldPayoutIds((items) => new Set([...items, payout.id]))}>Hold for Evidence</Button>
                </div>
              </DataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Sponsors' && (
        <DashboardSection eyebrow="Sponsors" title="Sponsor packages and impact">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sponsors.slice(0, 6).map((sponsor) => (
              <DataCard key={sponsor.id}>
                <h3 className="font-display text-lg font-black text-white">{sponsor.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{sponsor.category} • {sponsor.city}</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MiniMeta label="Package" value={sponsor.packageType.replaceAll('_', ' ')} />
                  <MiniMeta label="Commitment" value={formatUGX(sponsor.amountCommitted)} />
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-300">{sponsor.impactSummary}</p>
                <Button className="mt-4" size="sm" variant="outline" onClick={() => openDetail(sponsor.name, 'Sponsor package and impact reporting detail.', [['Package', sponsor.packageType.replaceAll('_', ' ')], ['Commitment', formatUGX(sponsor.amountCommitted)], ['Category', sponsor.category]])}>Manage Sponsor Package</Button>
              </DataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Awards' && (
        <DashboardSection eyebrow="Awards" title="Award categories and current leaders">
          <div className="grid gap-3 md:grid-cols-2">
            {awards.map((award) => (
              <DataCard key={award.id}>
                <Trophy className="mb-4 size-6 text-[var(--goal-gold)]" />
                <h3 className="font-display text-xl font-black text-white">{award.name}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{award.description}</p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <MiniMeta label="Type" value={award.categoryType} />
                  <MiniMeta label="Leaders" value={award.currentLeaderIds.length} />
                </div>
                <Button className="mt-4" size="sm" variant="outline" onClick={() => openDetail(award.name, 'Award category configuration preview.', [['Type', award.categoryType], ['Current leaders', award.currentLeaderIds.length], ['Description', award.description]], 'Save Award Review')}>Configure Award Category</Button>
              </DataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'System Health' && (
        <DashboardSection eyebrow="System Health" title="Data and infrastructure readiness">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              ['Data mode', source, 'info'],
              ['Firebase configured', isFirebaseConfigured ? 'Yes' : 'No', isFirebaseConfigured ? 'success' : 'warning'],
              ['Mock provider status', source === 'mock' ? 'Active' : 'Fallback ready', 'success'],
              ['Firestore provider status', isFirebaseConfigured ? 'Ready for live reads' : 'Using safe fallback', isFirebaseConfigured ? 'success' : 'warning'],
              ['Storage status', isFirebaseConfigured ? 'Rules ready' : 'Rules prepared for setup', 'info'],
              ['Last seed/export', `${leagues.length} leagues / ${athletes.length} athletes loaded`, 'success'],
              ['Known warnings', isFirebaseConfigured ? 'None active' : 'Firebase env missing in mock mode', isFirebaseConfigured ? 'success' : 'warning'],
              ['Admin logs', 'Demo visible', 'success'],
              ['Alerts', platformReports.length ? `${platformReports.length} reports open` : 'Clear', platformReports.length ? 'warning' : 'success'],
            ].map(([label, value, tone]) => (
              <DataCard key={label as string}>
                <Activity01Icon className="mb-4 size-5 text-[var(--goal-mint)]" />
                <MiniMeta label={label as string} value={<StatusBadge tone={tone as 'neutral'}>{value as string}</StatusBadge>} />
              </DataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Settings' && (
        <DashboardSection eyebrow="Settings" title="Platform controls">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Role access controls', 'Visible MVP roles are fan, athlete, team admin, league admin, and platform admin.'],
              ['Demo mode settings', 'Mock writes show toasts and never process real payments.'],
              ['Future payment settings', 'Reserved for a later release and disabled in demo mode.'],
              ['Maintenance banner', 'Configure platform-wide notices for support and verification windows.'],
            ].map(([title, detail]) => (
              <DataCard key={title}>
                <Settings01Icon className="mb-4 size-5 text-[var(--goal-mint)]" />
                <h3 className="font-display text-xl font-black text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
                {savedPlatformSettings.has(title) && (
                  <StatusBadge className="mt-4" tone="success">Saved locally</StatusBadge>
                )}
                <Button className="mt-4" size="sm" variant="outline" onClick={() => setSavedPlatformSettings((items) => new Set([...items, title]))}>Save Platform Setting</Button>
              </DataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      <DetailDrawer open={Boolean(drawer)} onOpenChange={(open) => !open && setDrawer(null)} title={drawer?.title ?? ''} description={drawer?.description}>
        {drawer?.body}
      </DetailDrawer>

      <ReviewDisputeDrawer open={modalOpen === 'reviewDispute'} onOpenChange={(open) => !open && setModalOpen(null)} />
      <ReviewPayoutDrawer open={modalOpen === 'reviewPayout'} onOpenChange={(open) => !open && setModalOpen(null)} />
    </PageContainer>
  );
}
