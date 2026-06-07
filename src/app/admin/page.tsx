'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Activity01Icon,
  Alert01Icon,
  Building01Icon,
  CheckmarkCircle01Icon,
  Coins01Icon,
  Comment01Icon,
  Download01Icon,
  Flag01Icon,
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
  DetailDrawer,
  ImpactStatCard,
  MobileDataCard,
  PageContainer,
  SportBadge,
  StatusBadge,
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
      <AdminDashboard />
    </RoleGuard>
  );
}

function AdminDashboard() {
  const { leagues, matches, athletes, teams, feedPosts, challenges, reports, verifications, source } = useGoalPlaceData();
  const [activeTab, setActiveTab] = useState('Overview');
  const [users, setUsers] = useState<User[]>([]);
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [awards, setAwards] = useState<AwardCategory[]>([]);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [approvedLeagueIds, setApprovedLeagueIds] = useState<Set<string>>(new Set());
  const [hiddenPostIds, setHiddenPostIds] = useState<Set<string>>(new Set());

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

  const tabs = [
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
  ];
  const tabGroups = [
    { label: 'Control', tabs: ['Overview', 'Users', 'Leagues', 'Athletes', 'Teams'] },
    { label: 'Trust', tabs: ['Verifications', 'Reports', 'Feed Moderation', 'Support/Payout Review'] },
    { label: 'Growth', tabs: ['Sponsors', 'Awards'] },
    { label: 'System', tabs: ['System Health', 'Settings'] },
  ];

  const openDetail = (title: string, description: string, details: [string, React.ReactNode][]) => {
    setDrawer({
      title,
      description,
      body: (
        <div className="space-y-4">
          {details.map(([label, value]) => <MiniMeta key={label} label={label} value={value} />)}
          <Button className="w-full" onClick={() => { setDrawer(null); toast.success(`${title} action recorded in demo mode.`); }}>Record Demo Action</Button>
        </div>
      ),
    });
  };

  const approveLeague = (leagueId: string) => {
    setApprovedLeagueIds((items) => new Set([...items, leagueId]));
    toast.success('League approval recorded in demo mode.');
  };

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
        actions={
          <Button onClick={() => toast.success('Demo export prepared. No production data was downloaded.')}>
            <Download01Icon className="size-4" />
            Export Data
          </Button>
        }
      />

      <AdminTabBar tabs={tabs} groups={tabGroups} activeTab={activeTab} onTabChange={setActiveTab} />

      <DashboardStatGrid>
        <ImpactStatCard label="Leagues" value={String(leagues.length)} detail={`${pendingLeagues.length} need review`} icon={Building01Icon} />
        <ImpactStatCard label="Athletes" value={String(athletes.length)} detail={`${athletes.filter((item) => item.verified).length} verified`} icon={Trophy} tone="gold" />
        <ImpactStatCard label="Reports" value={String(platformReports.length)} detail="Moderation and support issues" icon={Alert01Icon} tone="orange" />
        <ImpactStatCard label="Payout reviews" value={String(payoutRows.length)} detail="Demo support releases" icon={Coins01Icon} tone="blue" />
      </DashboardStatGrid>

      <ActionToolbar>
        <Button size="sm" onClick={() => { setActiveTab('Leagues'); toast.success('League approvals opened.'); }}><CheckmarkCircle01Icon className="size-4" /> Approve League</Button>
        <Button size="sm" variant="outline" onClick={() => setModalOpen('reviewDispute')}><Flag01Icon className="size-4" /> Review Reports</Button>
        <Button size="sm" variant="outline" onClick={() => { setActiveTab('Feed Moderation'); toast.success('Feed moderation opened.'); }}><Comment01Icon className="size-4" /> Moderate Feed</Button>
        <Button size="sm" variant="gold" onClick={() => setModalOpen('reviewPayout')}><Coins01Icon className="size-4" /> Review Support</Button>
      </ActionToolbar>

      {activeTab === 'Overview' && (
        <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
          <DashboardSection eyebrow="Urgent" title="Admin priorities">
            <div className="grid gap-3">
              {[
                ['League verification', `${pendingLeagues.length} league records need status review`, 'Leagues'],
                ['Moderation queue', `${platformReports.length} reports are open or reviewing`, 'Reports'],
                ['Support review', `${payoutRows.length} demo support releases await sign-off`, 'Support/Payout Review'],
              ].map(([title, detail, tab]) => (
                <button key={title} className="rounded-xl border border-white/10 bg-white/[0.045] p-4 text-left transition-colors hover:border-[var(--goal-emerald)]/35" onClick={() => setActiveTab(tab)}>
                  <p className="font-display text-lg font-black text-white">{title}</p>
                  <p className="mt-1 text-sm text-slate-400">{detail}</p>
                </button>
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
        <DashboardSection eyebrow="Users" title="Registered accounts" action={<Button variant="outline" onClick={() => toast.success('Demo user export prepared.')}><Download01Icon className="size-4" /> Export Users</Button>}>
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
                    <td className="px-4"><Button size="sm" variant="outline" onClick={() => openDetail(user.displayName, 'User profile and admin controls.', [['Email', user.email], ['Role', user.role], ['Status', user.status], ['Points', user.points], ['Wallet', formatUGX(user.walletBalance)], ['Joined', formatDate(user.createdAt)]])}>Inspect</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableCard>
          <div className="grid gap-3 lg:hidden">
            {users.slice(0, 8).map((user) => (
              <MobileDataCard key={user.id} title={user.displayName} eyebrow={user.email} meta={<StatusBadge tone={statusTone(user.status)}>{user.status}</StatusBadge>} actions={<Button size="sm" variant="outline" onClick={() => openDetail(user.displayName, 'User profile and admin controls.', [['Email', user.email], ['Role', user.role], ['City', user.city]])}>Inspect</Button>}>
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
              return (
                <MobileDataCard key={league.id} title={league.name} eyebrow={`${league.city} • ${league.sport}`} meta={<LeagueStatusBadge status={approved ? 'verified' : league.status} />} actions={<><Button size="sm" onClick={() => approveLeague(league.id)}>Approve League</Button><Button size="sm" variant="outline" onClick={() => openDetail(league.name, 'League verification detail.', [['Plan', league.plan], ['Teams', league.teamsCount], ['Athletes', league.athletesCount], ['Support', formatUGX(league.totalSupport)]])}>Inspect</Button></>}>
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
                  <StatusBadge tone={statusTone(athlete.verificationStatus)}>{athlete.verificationStatus}</StatusBadge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <MiniMeta label="Profile" value={`${athlete.verified ? 94 : 67}%`} />
                  <MiniMeta label="Support" value={formatUGX(athlete.totalEarnings ?? athlete.totalSupport)} />
                  <MiniMeta label="Actions" value={<button className="text-[var(--goal-mint)]" onClick={() => toast.success(`${athlete.name} verified in demo mode.`)}>Verify</button>} />
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
              <MobileDataCard key={team.id} title={team.name} eyebrow={`${team.city} • ${team.sport}`} meta={<StatusBadge tone={team.verified ? 'success' : 'warning'}>{team.verified ? 'Verified' : 'Review'}</StatusBadge>} actions={<Button size="sm" variant="outline" onClick={() => openDetail(team.name, 'Team profile controls.', [['League', leagues.find((league) => league.id === team.leagueId)?.name ?? 'League pending'], ['Athletes', athletes.filter((athlete) => athlete.teamId === team.id).length], ['Support', formatUGX(team.supportPool ?? team.totalSupport)]])}>Manage</Button>}>
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
                meta={<StatusBadge tone={statusTone(String(record.status))}>{record.status}</StatusBadge>}
                actions={
                  <>
                    <Button size="sm" variant="outline" onClick={() => openDetail(record.relatedLabel ?? record.type, 'Verification record detail.', [['Evidence', record.evidenceStatus ?? 'Evidence pending'], ['Amount affected', formatUGX(record.amountAffected ?? 0)], ['Action history', actionHistoryText(record.actionHistory)]])}>View</Button>
                    <Button size="sm" onClick={() => toast.success(`${record.id} verified in demo mode.`)}>Verify</Button>
                    <Button size="sm" variant="outline" onClick={() => toast.success(`${record.id} rejected in demo mode.`)}>Reject</Button>
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
                    <Button size="sm" variant="outline" onClick={() => openDetail(report.type, 'Report detail and moderation notes.', [['Reporter', report.reporter], ['Reported entity', report.reportedEntity], ['Assigned reviewer', report.reviewer], ['Reason', report.reason], ['Action history', actionHistoryText(report.history)]])}>View</Button>
                    <Button size="sm" onClick={() => toast.success(`${report.id} resolved in demo mode.`)}>Resolve</Button>
                    <Button size="sm" variant="outline" onClick={() => toast.success(`${report.id} escalated in demo mode.`)}>Escalate</Button>
                  </>
                }
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <MiniMeta label="Report type" value={report.type} />
                  <MiniMeta label="Assigned reviewer" value={report.reviewer} />
                  <MiniMeta label="Status" value={report.status} />
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
              return (
                <MobileDataCard
                  key={post.id}
                  title={post.caption.slice(0, 84)}
                  eyebrow={`${post.authorName} • ${String(post.type).replaceAll('_', ' ')} • ${post.flagReason ?? (index < 2 ? 'Engagement spike review' : 'Routine visibility check')}`}
                  meta={<StatusBadge tone={hidden ? 'danger' : index < 2 || post.status === 'reported' ? 'warning' : 'success'}>{hidden ? 'Hidden' : post.status === 'reported' || index < 2 ? 'Flagged' : 'Active'}</StatusBadge>}
                  actions={
                    <>
                      <Button size="sm" variant="outline" onClick={() => openDetail('Feed Post', 'Review post content and engagement context.', [['Author', post.authorName], ['Post type', String(post.type).replaceAll('_', ' ')], ['Reason flagged', post.flagReason ?? 'Engagement spike review'], ['Status', hidden ? 'hidden' : post.status], ['Engagement', `${post.likesCount + post.commentsCount + post.sharesCount} actions`]])}>View</Button>
                      <Button size="sm" variant={hidden ? 'outline' : 'destructive'} onClick={() => { setHiddenPostIds((items) => { const next = new Set(items); if (next.has(post.id)) next.delete(post.id); else next.add(post.id); return next; }); toast.success(hidden ? 'Post restored in demo mode.' : 'Post hidden in demo mode.'); }}>{hidden ? 'Restore' : 'Hide'}</Button>
                      <Button size="sm" variant="outline" onClick={() => toast.success('Post escalated in demo mode.')}>Escalate</Button>
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
        <DashboardSection eyebrow="Support/Payout Review" title="Demo support release ledger" description="Demo payout review only. Real payment processing is not enabled yet.">
          <div className="grid gap-3 lg:grid-cols-2">
            {payoutRows.map((payout) => (
              <DataCard key={payout.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-black text-white">{payout.athlete?.name ?? 'Athlete support'}</h3>
                    <p className="mt-1 text-sm text-slate-400">{payout.team?.name ?? 'Team pending'} • {payout.supportType}</p>
                  </div>
                  <StatusBadge tone="warning">{payout.status}</StatusBadge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
                  <MiniMeta label="Related challenge" value={payout.type} />
                  <MiniMeta label="Gross amount" value={formatUGX(payout.amount)} />
                  <MiniMeta label="Platform fee" value={formatUGX(payout.fee)} />
                  <MiniMeta label="Net" value={formatUGX(payout.net)} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openDetail(payout.athlete?.name ?? 'Support release', 'Support/Payout review detail.', [['Athlete/team', `${payout.athlete?.name ?? 'Athlete'} / ${payout.team?.name ?? 'Team pending'}`], ['Support type', payout.supportType], ['Related challenge', payout.type], ['Net amount', formatUGX(payout.net)]])}>Review</Button>
                  <Button size="sm" variant="gold" onClick={() => toast.success('Demo support release approved. Real payments are not enabled yet.')}>Approve Demo Review</Button>
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
                <Button className="mt-4" size="sm" variant="outline" onClick={() => toast.success(`${sponsor.name} package opened.`)}>Manage Package</Button>
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
                <Button className="mt-4" size="sm" variant="outline" onClick={() => toast.success(`${award.name} configured in demo mode.`)}>Configure</Button>
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
              ['Role access controls', 'Visible MVP roles are fan, athlete, league admin, and platform admin.'],
              ['Demo mode settings', 'Mock writes show toasts and never process real payments.'],
              ['Future payment settings', 'Reserved for a later release and disabled in demo mode.'],
              ['Maintenance banner', 'Configure platform-wide notices for support and verification windows.'],
            ].map(([title, detail]) => (
              <DataCard key={title}>
                <Settings01Icon className="mb-4 size-5 text-[var(--goal-mint)]" />
                <h3 className="font-display text-xl font-black text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
                <Button className="mt-4" size="sm" variant="outline" onClick={() => toast.success(`${title} saved in demo mode.`)}>Save</Button>
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
