'use client';

import React, { useMemo, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Building03Icon,
  Calendar01Icon,
  CheckmarkCircle01Icon,
  SecurityCheckIcon,
  Task01Icon,
  UserAdd01Icon,
  Notification01Icon,
} from 'hugeicons-react';
import { Trophy, Users } from '@phosphor-icons/react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { Button } from '@/components/ui/button';
import {
  GoalPlaceIndexPanel,
  LeagueIntegrityNote,
  LeagueStandingsTable,
  LeagueStatusBadge,
} from '@/components/ui/league';
import {
  AddTeamModal,
  AddAthleteModal,
  CreateFixtureModal,
  SubmitResultModal,
  VerifyResultModal,
  CreateChallengeModal,
  InviteTeamAdminModal,
  CreateLeagueNoticeModal,
  SponsorReportModal,
} from '@/components/modals/demo-modals';
import {
  ActionToolbar,
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
  StatusExplainerChip,
  TabStrip,
} from '@/components/ui/product';
import { dataProvider } from '@/data/dataProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { currentSeasonFor, scoringForSeason } from '@/lib/season';
import { Match, Team, VerificationStatus } from '@/types';
import type { IconComponent } from '@/lib/icons';

function normalizeVerificationStatus(status: VerificationStatus): VerificationStatus {
  if (status === 'verified') return 'verified';
  if (status === 'rejected') return 'rejected';
  if (status === 'disputed') return 'disputed';
  return status;
}

function formatDate(value?: string) {
  if (!value) return 'Date pending';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function teamName(teams: Team[], id?: string) {
  return teams.find((team) => team.id === id)?.name ?? 'Team pending';
}

export default function LeagueAdminPage() {
  return (
    <RoleGuard allowedRoles={['league_admin', 'platform_admin', 'super_admin']}>
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading league admin...</div>}>
        <LeagueAdminDashboard />
      </Suspense>
    </RoleGuard>
  );
}

function LeagueAdminDashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { leagues, teams, athletes, matches, challenges, seasons } = useGoalPlaceData();
  const initialLeague = searchParams?.get('league') || leagues[0]?.id || '';
  const [selectedLeagueId, setSelectedLeagueId] = useState(initialLeague);
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [matchOverrides, setMatchOverrides] = useState<Record<string, VerificationStatus>>({});
  const [challengeOverrides, setChallengeOverrides] = useState<Record<string, VerificationStatus>>({});
  const [notices, setNotices] = useState<{ id: string; type: string; message: string; date: Date }[]>([]);
  const [drawer, setDrawer] = useState<{ title: string; description: string; body: React.ReactNode } | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [partnerRequested, setPartnerRequested] = useState(false);

  const selectedLeague = leagues.find((league) => league.id === selectedLeagueId) ?? leagues[0];

  const leagueTeams = useMemo(
    () => teams.filter((team) => team.leagueId === selectedLeague?.id),
    [selectedLeague?.id, teams]
  );
  const leagueAthletes = useMemo(
    () => athletes.filter((athlete) => athlete.leagueId === selectedLeague?.id),
    [athletes, selectedLeague?.id]
  );
  const leagueMatches = useMemo(
    () => matches.filter((match) => match.leagueId === selectedLeague?.id),
    [matches, selectedLeague?.id]
  );
  const leagueChallenges = useMemo(
    () => challenges.filter((challenge) => challenge.leagueId === selectedLeague?.id),
    [challenges, selectedLeague?.id]
  );
  const activeSeason = useMemo(
    () => (selectedLeague ? currentSeasonFor(seasons, selectedLeague.id, selectedLeague.currentSeasonId) : undefined),
    [seasons, selectedLeague]
  );
  const standings = useMemo(
    () =>
      buildLeagueStandings(leagueTeams, leagueMatches, {
        seasonId: activeSeason?.id,
        scoring: scoringForSeason(activeSeason, selectedLeague?.sport ?? 'football'),
      }),
    [activeSeason, leagueMatches, leagueTeams, selectedLeague?.sport]
  );

  const tabs = useMemo(() => [
    'Overview',
    'Teams & Athletes',
    'Fixtures & Results',
    'Verification',
    'Sponsor Report',
    'Settings',
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
    router.replace(`/league-admin${query ? `?${query}` : ''}`, { scroll: false });
  };

  const quickActions = {
    createFixture: () => setModalOpen('createFixture'),
    addTeam: () => setModalOpen('addTeam'),
    addAthlete: () => setModalOpen('addAthlete'),
    verifyResult: () => setModalOpen('verifyResult'),
    submitResult: () => setModalOpen('submitResult'),
    createChallenge: () => setModalOpen('createChallenge'),
    inviteTeamAdmin: () => setModalOpen('inviteTeamAdmin'),
    createNotice: () => setModalOpen('createNotice'),
    sponsorReport: () => setModalOpen('sponsorReport'),
  };

  const updateMatch = async (match: Match, status: VerificationStatus) => {
    try {
      const nextStatus = normalizeVerificationStatus(status);
      await dataProvider.updateMatchVerification(match.id, nextStatus);
      setMatchOverrides((items) => ({ ...items, [match.id]: nextStatus }));
      toast.success(`Match marked ${nextStatus}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification update failed');
    }
  };

  if (!selectedLeague) {
    return (
      <PageContainer compact>
        <DataCard className="text-center text-slate-300">No leagues found.</DataCard>
      </PageContainer>
    );
  }

  const pendingMatches = leagueMatches.filter((match) => {
    const status = matchOverrides[match.id] ?? match.verificationStatus;
    return status === 'pending' || status === 'disputed';
  });
  const pendingChallenges = leagueChallenges.filter((challenge) => {
    const status = challengeOverrides[challenge.id] ?? challenge.verificationStatus;
    return status === 'pending' || status === 'disputed';
  });

  const upcomingFixtures = leagueMatches.filter((match) => match.status === 'scheduled').slice(0, 4);
  const recentResults = leagueMatches.filter((match) => match.score.home !== null && match.score.away !== null).slice(0, 4);

  const urgentTasks = [
    { title: `${pendingMatches.length} match results awaiting decision`, detail: 'Review scores, venue notes, and submitted evidence.', actionLabel: 'Review Match Results', action: () => setActiveTab('Verification') },
    { title: `${pendingChallenges.length} challenge outcomes pending`, detail: 'Confirm athlete achievements before support releases.', actionLabel: 'Review Challenge Outcomes', action: () => setActiveTab('Verification') },
    { title: 'Sponsor report due', detail: 'Generate impact report for current period.', actionLabel: 'Prepare Sponsor Report', action: () => setActiveTab('Sponsor Report') },
  ];

  const openActionDrawer = (title: string, description: string, body: React.ReactNode) => {
    setDrawer({ title, description, body });
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const leagueActions: Record<string, { label: string; icon: IconComponent; variant?: 'default' | 'outline'; onClick: () => void }[]> = {
    Overview: [
      { label: 'Create Fixture', icon: Calendar01Icon, onClick: quickActions.createFixture },
      { label: 'Add Team', icon: Building03Icon, variant: 'outline', onClick: quickActions.addTeam },
      { label: 'Review Pending Items', icon: Task01Icon, variant: 'outline', onClick: () => setActiveTab('Verification') },
      { label: 'Publish Notice', icon: Notification01Icon, variant: 'outline', onClick: quickActions.createNotice },
    ],
    'Teams & Athletes': [
      { label: 'Add Team', icon: Building03Icon, onClick: quickActions.addTeam },
      { label: 'Add Athlete', icon: UserAdd01Icon, variant: 'outline', onClick: quickActions.addAthlete },
      { label: 'Invite Team Admin', icon: UserAdd01Icon, variant: 'outline', onClick: quickActions.inviteTeamAdmin },
      {
        label: 'Review Team Submissions',
        icon: Task01Icon,
        variant: 'outline',
        onClick: () => openActionDrawer(
          'Team Submissions',
          'Review roster changes, missing contacts, and pending team admin invitations.',
          <div className="space-y-4">
            {leagueTeams.slice(0, 4).map((team) => (
              <DataCard key={team.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-bold text-white">{team.name}</p>
                    <p className="text-sm text-slate-400">{team.pendingSubmissions ?? 0} pending items</p>
                  </div>
                  <StatusExplainerChip domain="team" status={team.verified ? 'Verified' : team.verificationStatus ?? 'Pending Verification'} />
                </div>
              </DataCard>
            ))}
            <Button className="w-full" onClick={() => { setDrawer(null); toast.success('Team submission review recorded locally.'); }}>Record Review</Button>
          </div>
        ),
      },
    ],
    'Fixtures & Results': [
      { label: 'Create Fixture', icon: Calendar01Icon, onClick: quickActions.createFixture },
      { label: 'Submit Match Result', icon: Task01Icon, variant: 'outline', onClick: quickActions.submitResult },
      {
        label: 'Import Fixtures',
        icon: Calendar01Icon,
        variant: 'outline',
        onClick: () => openActionDrawer(
          'Import Fixtures',
          'Stage a fixture import for this league without changing production data.',
          <div className="space-y-4">
            <DataCard>
              <p className="text-sm text-slate-300">Demo import checks team names, venues, dates, and duplicate matchups before publishing.</p>
            </DataCard>
            <Button className="w-full" onClick={() => { setDrawer(null); toast.success('Fixture import staged locally.'); }}>Stage Fixture Import</Button>
          </div>
        ),
      },
      { label: 'View Standings', icon: Trophy, variant: 'outline', onClick: () => scrollToSection('league-standings') },
    ],
    Verification: [
      { label: 'Review Match Queue', icon: CheckmarkCircle01Icon, onClick: () => scrollToSection('league-match-queue') },
      { label: 'Review Challenge Queue', icon: Trophy, variant: 'outline', onClick: () => scrollToSection('league-challenge-queue') },
      { label: 'Review Disputes', icon: SecurityCheckIcon, variant: 'outline', onClick: () => scrollToSection('league-dispute-queue') },
    ],
    'Sponsor Report': [
      { label: 'Generate Sponsor Report', icon: Task01Icon, onClick: quickActions.sponsorReport },
      { label: 'Export CSV', icon: Task01Icon, variant: 'outline', onClick: quickActions.sponsorReport },
      { label: 'View Sponsor Impact', icon: SecurityCheckIcon, variant: 'outline', onClick: () => scrollToSection('league-sponsor-impact') },
    ],
    Settings: [
      { label: 'Edit League Info', icon: Building03Icon, onClick: () => scrollToSection('league-settings-form') },
      {
        label: 'Manage Permissions',
        icon: SecurityCheckIcon,
        variant: 'outline',
        onClick: () => openActionDrawer(
          'League Permissions',
          'Review who can submit rosters, results, evidence, and notices for this league.',
          <div className="space-y-4">
            {['League Admin: full competition control', 'Team Admin: roster and result submissions', 'Platform Admin: trust and escalation oversight'].map((item) => (
              <DataCard key={item}><p className="text-sm font-bold text-slate-200">{item}</p></DataCard>
            ))}
            <Button className="w-full" onClick={() => { setDrawer(null); toast.success('Permission review saved locally.'); }}>Save Permission Review</Button>
          </div>
        ),
      },
      {
        label: 'WhatsApp Reporting Bridge',
        icon: Notification01Icon,
        variant: 'outline',
        onClick: () => openActionDrawer(
          'WhatsApp Reporting Bridge',
          'Prepare the demo reporting bridge for fixture reminders and result intake.',
          <div className="space-y-4">
            <DataCard>
              <p className="text-sm text-slate-300">Bridge status: demo-ready. Team admins would receive fixture and result prompts through the configured reporting channel.</p>
            </DataCard>
            <Button className="w-full" onClick={() => { setDrawer(null); toast.success('Reporting bridge checked locally.'); }}>Mark Bridge Checked</Button>
          </div>
        ),
      },
    ],
  };

  return (
    <PageContainer compact className="space-y-6 pb-24">
      <AppPageHeader
        eyebrow="League operating desk"
        title={selectedLeague.name}
        description="Run fixtures, rosters, verification queues, support reviews, and partner reporting from one production-grade workspace."
        meta={
          <>
            <SportBadge sport={selectedLeague.sport} />
            <LeagueStatusBadge status={selectedLeague.status} />
            <StatusBadge tone="info">{selectedLeague.season}</StatusBadge>
            <StatusBadge>{selectedLeague.city}</StatusBadge>
          </>
        }
        actions={
          <label className="grid min-w-64 gap-2 hidden md:grid">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Selected League</span>
            <select
              value={selectedLeague.id}
              onChange={(event) => setSelectedLeagueId(event.target.value)}
              className="h-11 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-bold text-white outline-none focus:border-[var(--goal-emerald)]"
            >
              {leagues.map((league) => (
                <option key={league.id} value={league.id}>
                  {league.name}
                </option>
              ))}
            </select>
          </label>
        }
      />

      <div className="md:hidden">
        <select
          value={selectedLeague.id}
          onChange={(event) => setSelectedLeagueId(event.target.value)}
          className="w-full h-11 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-bold text-white outline-none focus:border-[var(--goal-emerald)]"
        >
          {leagues.map((league) => (
            <option key={league.id} value={league.id}>
              {league.name}
            </option>
          ))}
        </select>
      </div>

      <TabStrip tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <ActionToolbar>
        {leagueActions[activeTab].map((action) => {
          const Icon = action.icon;
          return (
            <Button key={action.label} size="sm" variant={action.variant} onClick={action.onClick}>
              <Icon className="size-4" />
              {action.label}
            </Button>
          );
        })}
      </ActionToolbar>

      {activeTab === 'Overview' && (
        <div className="space-y-8">
          <DashboardStatGrid>
            <ImpactStatCard label="Teams" value={String(leagueTeams.length)} detail={`${leagueAthletes.length} rostered athletes`} icon={Users} />
            <ImpactStatCard label="Upcoming fixtures" value={String(upcomingFixtures.length)} detail="Published and draft matchdays" icon={Calendar01Icon} tone="blue" />
            <ImpactStatCard label="Pending reviews" value={String(pendingMatches.length + pendingChallenges.length)} detail="Results and challenge outcomes" icon={Task01Icon} tone="orange" />
            <ImpactStatCard label="GoalPlace Index" value={String(selectedLeague.goalPlaceIndex)} detail="Separate from standings" icon={SecurityCheckIcon} tone="gold" />
          </DashboardStatGrid>

          <DashboardSection eyebrow="Actions" title="Top Pending Actions">
            <div className="grid gap-3 lg:grid-cols-3">
              {urgentTasks.map((task) => (
                <DataCard key={task.title} className="flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-white">{task.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">{task.detail}</p>
                  </div>
                  <Button className="mt-4 w-full" variant="outline" size="sm" onClick={task.action}>{task.actionLabel}</Button>
                </DataCard>
              ))}
            </div>
          </DashboardSection>

          <DashboardSection eyebrow="Quality Signal" title="GoalPlace Index & Integrity" description="Your league’s operational score and reporting limits. Standings are strictly based on verified match results.">
            <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <GoalPlaceIndexPanel league={selectedLeague} />
              <LeagueIntegrityNote />
            </div>
          </DashboardSection>

          <DashboardSection 
            eyebrow="Communications" 
            title="League Notices" 
          >
            {notices.length === 0 ? (
              <DataCard className="text-center text-slate-400">
                No active league notices.
              </DataCard>
            ) : (
              <div className="space-y-3">
                {notices.map((notice) => (
                  <DataCard key={notice.id}>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[var(--goal-mint)]">{notice.type}</span>
                        <p className="mt-1 text-sm font-medium text-slate-200">{notice.message}</p>
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(notice.date.toISOString())}</span>
                    </div>
                  </DataCard>
                ))}
              </div>
            )}
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Teams & Athletes' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Rosters" title="Teams">
            <DataTableCard className="hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px] text-left text-sm">
                  <thead className="bg-white/6 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                    <tr>
                      <th className="px-4 py-3">Team Name</th>
                      <th className="px-4 py-3">Coach / Contact</th>
                      <th className="px-4 py-3">Roster</th>
                      <th className="px-4 py-3">Pending</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8 bg-white/[0.03]">
                    {leagueTeams.map((team) => (
                      <tr key={team.id} className="transition-colors hover:bg-white/[0.04]">
                        <td className="whitespace-nowrap p-4 font-bold text-white">
                          <div>{team.name}</div>
                          <div className="text-xs text-slate-500 font-normal">{team.city}</div>
                        </td>
                        <td className="whitespace-nowrap p-4">
                          <div className="text-slate-300">{team.teamAdminName || 'No Admin'}</div>
                          {team.teamAdminEmail && <div className="text-xs text-slate-500">Invited</div>}
                        </td>
                        <td className="whitespace-nowrap p-4 text-slate-300">
                          {team.rosterCompleteness || 0}% Complete
                        </td>
                        <td className="whitespace-nowrap p-4 text-slate-300">
                          {team.pendingSubmissions ? <span className="text-orange-400 font-bold">{team.pendingSubmissions} items</span> : '0 items'}
                        </td>
                        <td className="whitespace-nowrap p-4">
                          <StatusExplainerChip domain="team" status={team.verified ? 'Verified' : team.verificationStatus ?? 'Pending Verification'} />
                        </td>
                        <td className="whitespace-nowrap p-4 text-right space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/team-admin?team=${team.id}`)}>Open Console</Button>
                          {!team.teamAdminEmail && (
                            <Button variant="ghost" size="sm" onClick={quickActions.inviteTeamAdmin}>Invite Admin</Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => openActionDrawer('Team Submissions', 'Review roster changes and pending evidence for this team.', <div className="space-y-4"><DataCard><p className="font-bold text-white">{team.name}</p><p className="mt-1 text-sm text-slate-300">{team.pendingSubmissions ?? 0} pending items need league review.</p></DataCard><Button className="w-full" onClick={() => { setDrawer(null); toast.success(`${team.name} submissions reviewed locally.`); }}>Record Team Review</Button></div>)}>Review Team Submissions</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DataTableCard>
            <div className="grid gap-3 md:hidden">
              {leagueTeams.map((team) => (
                <MobileDataCard
                  key={team.id}
                  title={team.name}
                  eyebrow={`${team.city} • ${team.rosterCompleteness || 0}% roster complete`}
                  meta={<StatusExplainerChip domain="team" status={team.verified ? 'Verified' : team.verificationStatus ?? 'Pending Verification'} />}
                  actions={
                    <>
                      <Button size="sm" variant="outline" onClick={() => router.push(`/team-admin?team=${team.id}`)}>Open Console</Button>
                      {!team.teamAdminEmail && <Button size="sm" variant="outline" onClick={quickActions.inviteTeamAdmin}>Invite Admin</Button>}
                      <Button size="sm" variant="outline" onClick={() => openActionDrawer('Team Submissions', 'Review roster changes and pending evidence for this team.', <div className="space-y-4"><DataCard><p className="font-bold text-white">{team.name}</p><p className="mt-1 text-sm text-slate-300">{team.pendingSubmissions ?? 0} pending items need league review.</p></DataCard><Button className="w-full" onClick={() => { setDrawer(null); toast.success(`${team.name} submissions reviewed locally.`); }}>Record Team Review</Button></div>)}>Review Submissions</Button>
                    </>
                  }
                >
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-xs font-bold uppercase text-slate-500">Contact</p><p className="mt-1 font-bold text-slate-200">{team.teamAdminName || 'No Admin'}</p></div>
                    <div><p className="text-xs font-bold uppercase text-slate-500">Pending</p><p className="mt-1 font-bold text-slate-200">{team.pendingSubmissions ?? 0} items</p></div>
                  </div>
                </MobileDataCard>
              ))}
            </div>
          </DashboardSection>

          <DashboardSection eyebrow="Profiles" title="Athletes">
            <DataTableCard className="hidden md:block">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-white/6 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Athlete Name</th>
                    <th className="px-4 py-3">Team</th>
                    <th className="px-4 py-3">Position</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8 bg-white/[0.03]">
                  {leagueAthletes.map((athlete) => (
                    <tr key={athlete.id} className="transition-colors hover:bg-white/[0.04]">
                      <td className="whitespace-nowrap p-4 font-bold text-white">{athlete.name}</td>
                      <td className="whitespace-nowrap p-4 text-slate-300">{teamName(teams, athlete.teamId)}</td>
                      <td className="whitespace-nowrap p-4 text-slate-300 capitalize">{athlete.position}</td>
                      <td className="whitespace-nowrap p-4">
                        <StatusExplainerChip domain="athlete" status={athlete.verified ? 'Verified' : athlete.verificationStatus} />
                      </td>
                      <td className="whitespace-nowrap p-4">
                        <Button variant="outline" size="sm" onClick={() => router.push(`/athletes/${athlete.id}`)}>View Athlete Profile</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableCard>
            <div className="grid gap-3 md:hidden">
              {leagueAthletes.map((athlete) => (
                <MobileDataCard
                  key={athlete.id}
                  title={athlete.name}
                  eyebrow={`${teamName(teams, athlete.teamId)} • ${athlete.position}`}
                  meta={<StatusExplainerChip domain="athlete" status={athlete.verified ? 'Verified' : athlete.verificationStatus} />}
                  actions={<Button size="sm" variant="outline" onClick={() => router.push(`/athletes/${athlete.id}`)}>View Athlete Profile</Button>}
                />
              ))}
            </div>
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Fixtures & Results' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Standings" title="Current Standings">
            <div className="mb-4 rounded-xl border border-[var(--goal-gold)]/20 bg-[var(--goal-gold)]/5 p-4 text-sm leading-6 text-[var(--goal-gold)]">
              <strong>Important:</strong> GoalPlace Index helps leagues prove operational quality to sponsors, athletes, and fans. It does not affect sporting standings.
            </div>
            <div id="league-standings">
              <LeagueStandingsTable standings={standings} />
            </div>
          </DashboardSection>

          <DashboardSection eyebrow="Schedule" title="Upcoming Fixtures">
            <DataTableCard className="hidden md:block">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-white/6 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Home</th>
                    <th className="px-4 py-3">Away</th>
                    <th className="px-4 py-3">Venue</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8 bg-white/[0.03]">
                  {upcomingFixtures.map((match) => (
                    <tr key={match.id} className="transition-colors hover:bg-white/[0.04]">
                      <td className="whitespace-nowrap p-4 text-slate-300">{formatDate(match.date)}</td>
                      <td className="whitespace-nowrap p-4 font-bold text-white">{teamName(teams, match.homeTeamId)}</td>
                      <td className="whitespace-nowrap p-4 font-bold text-white">{teamName(teams, match.awayTeamId)}</td>
                      <td className="whitespace-nowrap p-4 text-slate-300">{match.venue}</td>
                      <td className="whitespace-nowrap p-4"><StatusExplainerChip domain="match" status="Scheduled" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableCard>
            <div className="grid gap-3 md:hidden">
              {upcomingFixtures.map((match) => (
                <MobileDataCard
                  key={match.id}
                  title={`${teamName(teams, match.homeTeamId)} vs ${teamName(teams, match.awayTeamId)}`}
                  eyebrow={`${formatDate(match.date)} • ${match.venue}`}
                  meta={<StatusExplainerChip domain="match" status="Scheduled" />}
                />
              ))}
            </div>
          </DashboardSection>

          <DashboardSection eyebrow="History" title="Recent Results">
            <DataTableCard className="hidden md:block">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-white/6 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Match</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8 bg-white/[0.03]">
                  {recentResults.map((match) => (
                    <tr key={match.id} className="transition-colors hover:bg-white/[0.04]">
                      <td className="whitespace-nowrap p-4 text-slate-300">{formatDate(match.date)}</td>
                      <td className="whitespace-nowrap p-4 text-slate-300">{teamName(teams, match.homeTeamId)} vs {teamName(teams, match.awayTeamId)}</td>
                      <td className="whitespace-nowrap p-4 font-bold text-white">{match.score.home} - {match.score.away}</td>
                      <td className="whitespace-nowrap p-4"><StatusExplainerChip domain="match" status={matchOverrides[match.id] ?? match.verificationStatus} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableCard>
            <div className="grid gap-3 md:hidden">
              {recentResults.map((match) => (
                <MobileDataCard
                  key={match.id}
                  title={`${teamName(teams, match.homeTeamId)} vs ${teamName(teams, match.awayTeamId)}`}
                  eyebrow={formatDate(match.date)}
                  meta={<StatusExplainerChip domain="match" status={matchOverrides[match.id] ?? match.verificationStatus} />}
                >
                  <p className="font-display text-2xl font-black text-white">{match.score.home} - {match.score.away}</p>
                </MobileDataCard>
              ))}
            </div>
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Verification' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Matches" title="Match Verification Queue" description="Verify submitted match scores and event logs.">
            <div id="league-match-queue" />
            <DataTableCard className="hidden md:block">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-white/6 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Match</th>
                    <th className="px-4 py-3">Submitted Score</th>
                    <th className="px-4 py-3">Evidence</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8 bg-white/[0.03]">
                  {pendingMatches.map((match) => (
                    <tr key={match.id} className="transition-colors hover:bg-white/[0.04]">
                      <td className="whitespace-nowrap p-4 text-slate-300">{teamName(teams, match.homeTeamId)} vs {teamName(teams, match.awayTeamId)}</td>
                      <td className="whitespace-nowrap p-4 font-bold text-white">{match.score.home} - {match.score.away}</td>
                      <td className="whitespace-nowrap p-4 text-blue-300 underline cursor-pointer" onClick={() => openActionDrawer('Match Evidence', 'Review submitted score evidence for this match.', <div className="space-y-4"><DataCard><p className="font-bold text-white">{teamName(teams, match.homeTeamId)} vs {teamName(teams, match.awayTeamId)}</p><p className="mt-1 text-sm text-slate-300">Submitted score: {match.score.home} - {match.score.away}</p><p className="mt-2 text-sm text-slate-400">Attachment placeholder: score sheet, venue note, and team admin comment.</p></DataCard><Button className="w-full" onClick={() => { setDrawer(null); toast.success('Evidence reviewed locally.'); }}>Mark Evidence Reviewed</Button></div>)}>View attachment</td>
                      <td className="whitespace-nowrap p-4"><StatusExplainerChip domain="match" status="Pending Verification" /></td>
                      <td className="whitespace-nowrap p-4 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => updateMatch(match, 'verified')}>Approve Match Result</Button>
                        <Button variant="destructive" size="sm" onClick={() => updateMatch(match, 'disputed')}>Mark Result Disputed</Button>
                      </td>
                    </tr>
                  ))}
                  {pendingMatches.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-slate-400">Queue is empty.</td></tr>
                  )}
                </tbody>
              </table>
            </DataTableCard>
            <div className="grid gap-3 md:hidden">
              {pendingMatches.map((match) => (
                <MobileDataCard
                  key={match.id}
                  title={`${teamName(teams, match.homeTeamId)} vs ${teamName(teams, match.awayTeamId)}`}
                  eyebrow={`Submitted score ${match.score.home} - ${match.score.away}`}
                  meta={<StatusExplainerChip domain="match" status="Pending Verification" />}
                  actions={
                    <>
                      <Button size="sm" variant="outline" onClick={() => openActionDrawer('Match Evidence', 'Review submitted score evidence for this match.', <div className="space-y-4"><DataCard><p className="font-bold text-white">{teamName(teams, match.homeTeamId)} vs {teamName(teams, match.awayTeamId)}</p><p className="mt-1 text-sm text-slate-300">Submitted score: {match.score.home} - {match.score.away}</p><p className="mt-2 text-sm text-slate-400">Attachment placeholder: score sheet, venue note, and team admin comment.</p></DataCard><Button className="w-full" onClick={() => { setDrawer(null); toast.success('Evidence reviewed locally.'); }}>Mark Evidence Reviewed</Button></div>)}>View Evidence</Button>
                      <Button size="sm" variant="outline" onClick={() => updateMatch(match, 'verified')}>Approve</Button>
                      <Button size="sm" variant="destructive" onClick={() => updateMatch(match, 'disputed')}>Dispute</Button>
                    </>
                  }
                />
              ))}
              {pendingMatches.length === 0 && <DataCard className="text-center text-slate-400">Queue is empty.</DataCard>}
            </div>
          </DashboardSection>

          <DashboardSection eyebrow="Challenges" title="Challenge Verification" description="Verify if athletes achieved their support challenges during matches.">
            <div id="league-challenge-queue" />
            <DataTableCard className="hidden md:block">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-white/6 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Athlete</th>
                    <th className="px-4 py-3">Match</th>
                    <th className="px-4 py-3">Challenge</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8 bg-white/[0.03]">
                  {pendingChallenges.map((challenge) => {
                    const athlete = athletes.find((a) => a.id === challenge.athleteId);
                    const match = matches.find((m) => m.id === challenge.matchId);
                    return (
                      <tr key={challenge.id} className="transition-colors hover:bg-white/[0.04]">
                        <td className="whitespace-nowrap p-4 text-slate-300">{athlete?.name}</td>
                        <td className="whitespace-nowrap p-4 text-slate-300">{teamName(teams, match?.homeTeamId)} vs {teamName(teams, match?.awayTeamId)}</td>
                        <td className="whitespace-nowrap p-4 font-bold text-white">{challenge.type.replaceAll('_', ' ')}</td>
                        <td className="whitespace-nowrap p-4"><StatusExplainerChip domain="challenge" status="Pending Verification" /></td>
                        <td className="whitespace-nowrap p-4 flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setChallengeOverrides((prev) => ({...prev, [challenge.id]: 'verified'})); toast.success('Challenge verified. Support release review can continue.'); }}>Approve Challenge Result</Button>
                          <Button variant="destructive" size="sm" onClick={() => { setChallengeOverrides((prev) => ({...prev, [challenge.id]: 'rejected'})); toast.success('Challenge rejected. Support remains held for review.'); }}>Reject Challenge Result</Button>
                        </td>
                      </tr>
                    );
                  })}
                  {pendingChallenges.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-slate-400">No pending challenges.</td></tr>
                  )}
                </tbody>
              </table>
            </DataTableCard>
            <div className="grid gap-3 md:hidden">
              {pendingChallenges.map((challenge) => {
                const athlete = athletes.find((a) => a.id === challenge.athleteId);
                const match = matches.find((m) => m.id === challenge.matchId);
                return (
                  <MobileDataCard
                    key={challenge.id}
                    title={athlete?.name ?? 'Athlete pending'}
                    eyebrow={`${teamName(teams, match?.homeTeamId)} vs ${teamName(teams, match?.awayTeamId)}`}
                    meta={<StatusExplainerChip domain="challenge" status="Pending Verification" />}
                    actions={
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setChallengeOverrides((prev) => ({...prev, [challenge.id]: 'verified'})); toast.success('Challenge verified. Support release review can continue.'); }}>Approve</Button>
                        <Button size="sm" variant="destructive" onClick={() => { setChallengeOverrides((prev) => ({...prev, [challenge.id]: 'rejected'})); toast.success('Challenge rejected. Support remains held for review.'); }}>Reject</Button>
                      </>
                    }
                  >
                    <p className="font-bold text-white">{challenge.type.replaceAll('_', ' ')}</p>
                  </MobileDataCard>
                );
              })}
              {pendingChallenges.length === 0 && <DataCard className="text-center text-slate-400">No pending challenges.</DataCard>}
            </div>
          </DashboardSection>

          <DashboardSection eyebrow="Resolution" title="Disputes & Payouts" description="Resolve active disputes or review queued payouts for teams and athletes.">
            <div id="league-dispute-queue">
              <DataCard className="flex flex-col items-center justify-center text-center p-8">
                <CheckmarkCircle01Icon className="mb-4 size-8 text-[var(--goal-mint)]" />
                <h3 className="font-bold text-white">All Clear</h3>
                <p className="mt-2 text-sm text-slate-400">No active disputes or payouts currently require your review.</p>
                <Button variant="outline" className="mt-6" onClick={() => openActionDrawer('Resolution History', 'Recent dispute and payout review activity for this league.', <div className="space-y-4"><DataCard><p className="text-sm text-slate-300">No open disputes. Last review cycle is clear in this demo dataset.</p></DataCard><Button className="w-full" onClick={() => setDrawer(null)}>Close History</Button></div>)}>Review History</Button>
              </DataCard>
            </div>
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Sponsor Report' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Impact" title="Sponsor Visibility & Reporting">
            <div id="league-sponsor-impact" />
            <div className="grid gap-4 lg:grid-cols-2">
              <DataCard>
                <h3 className="font-display text-lg font-black text-white">Monthly Sponsor Report</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Generate the official GoalPlace256 impact report outlining verified match activity, audience reach, and how sponsor funds supported athletes this month.
                </p>
              </DataCard>
              <DataCard>
                <h3 className="font-display text-lg font-black text-white">GoalPlace Index Metrics</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Your current operational score is <strong>{selectedLeague.goalPlaceIndex}</strong>. Sponsors look at this index to ensure funds are deployed to actively managed, verified grassroots leagues.
                </p>
              </DataCard>
            </div>
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Settings' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Configuration" title="League Profile & Settings">
            <DataCard>
              <div id="league-settings-form" />
              <h3 className="font-display text-lg font-black text-white">General Information</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">League Name</span>
                  <input
                    defaultValue={selectedLeague.name}
                    className="h-11 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none focus:border-[var(--goal-emerald)]"
                  />
                </label>
                <label className="grid gap-2">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">City / Region</span>
                  <input
                    defaultValue={selectedLeague.city}
                    className="h-11 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none focus:border-[var(--goal-emerald)]"
                  />
                </label>
              </div>
              {(settingsSaved || partnerRequested) && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {settingsSaved && (
                    <div className="rounded-lg border border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/8 p-3">
                      <p className="text-sm font-bold text-[var(--goal-mint)]">League profile saved locally.</p>
                    </div>
                  )}
                  {partnerRequested && (
                    <div className="rounded-lg border border-[var(--goal-gold)]/25 bg-[var(--goal-gold)]/10 p-3">
                      <p className="text-sm font-bold text-[var(--goal-gold)]">Partner status request is pending platform review.</p>
                    </div>
                  )}
                </div>
              )}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button onClick={() => { setSettingsSaved(true); toast.success('Settings saved locally.'); }}>Save Profile</Button>
                <Button variant="outline" onClick={() => { setPartnerRequested(true); toast.success('Partner status request submitted locally.'); }}>Request Partner Status</Button>
              </div>
            </DataCard>
          </DashboardSection>
        </div>
      )}

      <AddTeamModal open={modalOpen === 'addTeam'} onOpenChange={(open) => !open && setModalOpen(null)} />
      <AddAthleteModal open={modalOpen === 'addAthlete'} onOpenChange={(open) => !open && setModalOpen(null)} />
      <CreateFixtureModal open={modalOpen === 'createFixture'} onOpenChange={(open) => !open && setModalOpen(null)} />
      <SubmitResultModal open={modalOpen === 'submitResult'} onOpenChange={(open) => !open && setModalOpen(null)} />
      <VerifyResultModal open={modalOpen === 'verifyResult'} onOpenChange={(open) => !open && setModalOpen(null)} />
      <CreateChallengeModal
        open={modalOpen === 'createChallenge'}
        onOpenChange={(isOpen) => setModalOpen(isOpen ? 'createChallenge' : null)}
      />
      <InviteTeamAdminModal
        open={modalOpen === 'inviteTeamAdmin'}
        onOpenChange={(isOpen) => setModalOpen(isOpen ? 'inviteTeamAdmin' : null)}
      />
      <CreateLeagueNoticeModal
        open={modalOpen === 'createNotice'}
        onOpenChange={(isOpen) => setModalOpen(isOpen ? 'createNotice' : null)}
        onSuccess={(type, message) => {
          setNotices(prev => [{ id: Math.random().toString(), type, message, date: new Date() }, ...prev]);
        }}
      />
      <SponsorReportModal open={modalOpen === 'sponsorReport'} onOpenChange={(open) => !open && setModalOpen(null)} />
      <DetailDrawer
        open={Boolean(drawer)}
        onOpenChange={(open) => !open && setDrawer(null)}
        title={drawer?.title ?? ''}
        description={drawer?.description}
      >
        {drawer?.body}
      </DetailDrawer>
    </PageContainer>
  );
}
