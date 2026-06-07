'use client';

import React, { useMemo, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Activity01Icon,
  Building03Icon,
  Calendar01Icon,
  CheckmarkCircle01Icon,
  Comment01Icon,
  SecurityCheckIcon,
  Settings01Icon,
  Task01Icon,
  UserAdd01Icon,
  UserGroupIcon,
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
  ReviewDisputeDrawer,
  ReviewPayoutDrawer,
  InviteTeamAdminModal,
} from '@/components/modals/demo-modals';
import {
  ActionToolbar,
  AppPageHeader,
  DashboardSection,
  DashboardStatGrid,
  DataCard,
  DataTableCard,
  ImpactStatCard,
  MobileDataCard,
  PageContainer,
  SectionHeader,
  SportBadge,
  StatusBadge,
  TabStrip,
} from '@/components/ui/product';
import { dataProvider } from '@/data/dataProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { formatUGX } from '@/lib/sportThemes';
import { Athlete, Challenge, Match, Report, Team, VerificationStatus } from '@/types';

function normalizeVerificationStatus(status: VerificationStatus): VerificationStatus {
  if (status === 'Verified') return 'verified';
  if (status === 'Rejected') return 'rejected';
  if (status === 'Disputed') return 'disputed';
  return status;
}

function statusTone(status?: string): 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'gold' {
  const value = status?.toLowerCase() ?? '';
  if (value.includes('verified') || value.includes('active') || value.includes('completed')) return 'success';
  if (value.includes('pending') || value.includes('review')) return 'warning';
  if (value.includes('disputed') || value.includes('suspended') || value.includes('high')) return 'danger';
  if (value.includes('partner')) return 'gold';
  if (value.includes('scheduled') || value.includes('upcoming')) return 'info';
  return 'neutral';
}

function formatDate(value?: string) {
  if (!value) return 'Date pending';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function teamName(teams: Team[], id?: string) {
  return teams.find((team) => team.id === id)?.name ?? 'Team pending';
}

function MiniMeta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-200">{value}</p>
    </div>
  );
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
  const { leagues, teams, athletes, matches, challenges, feedPosts, reports } = useGoalPlaceData();
  const initialLeague = searchParams?.get('league') || leagues[0]?.id || '';
  const [selectedLeagueId, setSelectedLeagueId] = useState(initialLeague);
  const [activeTab, setActiveTab] = useState('Overview');
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [matchOverrides, setMatchOverrides] = useState<Record<string, VerificationStatus>>({});
  const [challengeOverrides, setChallengeOverrides] = useState<Record<string, VerificationStatus>>({});

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
  const standings = useMemo(() => buildLeagueStandings(leagueTeams, leagueMatches), [leagueMatches, leagueTeams]);

  const tabs = [
    'Overview',
    'Teams & Athletes',
    'Fixtures & Results',
    'Verification',
    'Sponsor Report',
    'Settings',
  ];

  const quickActions = {
    createFixture: () => setModalOpen('createFixture'),
    addTeam: () => setModalOpen('addTeam'),
    addAthlete: () => setModalOpen('addAthlete'),
    verifyResult: () => setModalOpen('verifyResult'),
    submitResult: () => setModalOpen('submitResult'),
    createChallenge: () => setModalOpen('createChallenge'),
    verifyChallenge: () => toast.success('Verify Challenge modal opened in demo mode.'),
    createPost: () => toast.success('Create Post form opened in demo mode.'),
    inviteTeamAdmin: () => setModalOpen('inviteTeamAdmin'),
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
    return status === 'Pending' || status === 'pending' || status === 'disputed' || status === 'Disputed';
  });
  const pendingChallenges = leagueChallenges.filter((challenge) => {
    const status = challengeOverrides[challenge.id] ?? challenge.verificationStatus;
    return status === 'Pending' || status === 'pending' || status === 'disputed' || status === 'Disputed';
  });

  const upcomingFixtures = leagueMatches.filter((match) => match.status === 'Upcoming' || match.status === 'scheduled').slice(0, 4);
  const recentResults = leagueMatches.filter((match) => match.score.home !== null && match.score.away !== null).slice(0, 4);

  const urgentTasks = [
    { title: `${pendingMatches.length} match results awaiting decision`, detail: 'Review scores, venue notes, and submitted evidence.', action: () => setActiveTab('Verification') },
    { title: `${pendingChallenges.length} challenge outcomes pending`, detail: 'Confirm athlete achievements before support releases.', action: () => setActiveTab('Verification') },
    { title: 'Sponsor report due', detail: 'Generate impact report for current period.', action: () => setActiveTab('Sponsor Report') },
  ];

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
        <Button size="sm" onClick={quickActions.createFixture}><Calendar01Icon className="size-4" /> Create Fixture</Button>
        <Button size="sm" variant="outline" onClick={quickActions.addTeam}><Building03Icon className="size-4" /> Add Team</Button>
        <Button size="sm" variant="outline" onClick={quickActions.addAthlete}><UserAdd01Icon className="size-4" /> Add Athlete</Button>
        <Button size="sm" variant="outline" onClick={quickActions.submitResult}><Task01Icon className="size-4" /> Submit Result</Button>
        <Button size="sm" variant="outline" onClick={quickActions.verifyResult}><CheckmarkCircle01Icon className="size-4" /> Verify Result</Button>
        <Button size="sm" variant="outline" onClick={quickActions.createChallenge}><Trophy className="size-4" /> Create Challenge</Button>
        <Button size="sm" variant="outline" onClick={quickActions.createPost}><Comment01Icon className="size-4" /> Post to Feed</Button>
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
                  <Button className="mt-4 w-full" variant="outline" size="sm" onClick={task.action}>Review</Button>
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
        </div>
      )}

      {activeTab === 'Teams & Athletes' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Rosters" title="Teams" action={<Button size="sm" onClick={quickActions.inviteTeamAdmin}><UserAdd01Icon className="size-4 mr-2" /> Invite Team Admin</Button>}>
            <DataTableCard>
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
                        <td className="whitespace-nowrap p-4"><StatusBadge tone="success">Operational</StatusBadge></td>
                        <td className="whitespace-nowrap p-4 text-right space-x-2">
                          <Button variant="ghost" size="sm" onClick={() => router.push(`/team-admin?team=${team.id}`)}>Open Console</Button>
                          <Button variant="outline" size="sm" onClick={() => toast.success('Review drawer opened (Demo)')}>Review</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </DataTableCard>
          </DashboardSection>

          <DashboardSection eyebrow="Profiles" title="Athletes">
            <DataTableCard>
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
                      <td className="whitespace-nowrap p-4"><StatusBadge tone="info">Verified</StatusBadge></td>
                      <td className="whitespace-nowrap p-4">
                        <Button variant="outline" size="sm" onClick={() => toast.success('Profile opened.')}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableCard>
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Fixtures & Results' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Standings" title="Current Standings">
            <div className="mb-4 rounded-xl border border-[var(--goal-gold)]/20 bg-[var(--goal-gold)]/5 p-4 text-sm leading-6 text-[var(--goal-gold)]">
              <strong>Important:</strong> GoalPlace Index helps leagues prove operational quality to sponsors, athletes, and fans. It does not affect sporting standings.
            </div>
            <LeagueStandingsTable standings={standings} />
          </DashboardSection>

          <DashboardSection eyebrow="Schedule" title="Upcoming Fixtures">
            <DataTableCard>
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
                      <td className="whitespace-nowrap p-4"><StatusBadge tone="info">Scheduled</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableCard>
          </DashboardSection>

          <DashboardSection eyebrow="History" title="Recent Results">
            <DataTableCard>
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
                      <td className="whitespace-nowrap p-4"><StatusBadge tone={statusTone(matchOverrides[match.id] ?? match.verificationStatus)}>{matchOverrides[match.id] ?? match.verificationStatus}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </DataTableCard>
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Verification' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Matches" title="Match Verification Queue" description="Verify submitted match scores and event logs.">
            <DataTableCard>
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
                      <td className="whitespace-nowrap p-4 text-blue-300 underline cursor-pointer" onClick={() => toast.success('Viewing evidence in demo mode.')}>View attachment</td>
                      <td className="whitespace-nowrap p-4"><StatusBadge tone="warning">Pending</StatusBadge></td>
                      <td className="whitespace-nowrap p-4 flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => updateMatch(match, 'verified')}>Approve</Button>
                        <Button variant="destructive" size="sm" onClick={() => updateMatch(match, 'disputed')}>Dispute</Button>
                      </td>
                    </tr>
                  ))}
                  {pendingMatches.length === 0 && (
                    <tr><td colSpan={5} className="p-4 text-center text-slate-400">Queue is empty.</td></tr>
                  )}
                </tbody>
              </table>
            </DataTableCard>
          </DashboardSection>

          <DashboardSection eyebrow="Challenges" title="Challenge Verification" description="Verify if athletes achieved their support challenges during matches.">
            <DataTableCard>
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
                        <td className="whitespace-nowrap p-4"><StatusBadge tone="warning">Pending</StatusBadge></td>
                        <td className="whitespace-nowrap p-4 flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => { setChallengeOverrides((prev) => ({...prev, [challenge.id]: 'verified'})); toast.success('Challenge verified.'); }}>Approve</Button>
                          <Button variant="destructive" size="sm" onClick={() => { setChallengeOverrides((prev) => ({...prev, [challenge.id]: 'rejected'})); toast.success('Challenge rejected.'); }}>Reject</Button>
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
          </DashboardSection>

          <DashboardSection eyebrow="Resolution" title="Disputes & Payouts" description="Resolve active disputes or review queued payouts for teams and athletes.">
            <DataCard className="flex flex-col items-center justify-center text-center p-8">
              <CheckmarkCircle01Icon className="mb-4 size-8 text-[var(--goal-mint)]" />
              <h3 className="font-bold text-white">All Clear</h3>
              <p className="mt-2 text-sm text-slate-400">No active disputes or payouts currently require your review.</p>
              <Button variant="outline" className="mt-6" onClick={() => toast.success('Viewing resolution history...')}>Review History</Button>
            </DataCard>
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Sponsor Report' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Impact" title="Sponsor Visibility & Reporting">
            <div className="grid gap-4 lg:grid-cols-2">
              <DataCard>
                <h3 className="font-display text-lg font-black text-white">Monthly Sponsor Report</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Generate the official GoalPlace256 impact report outlining verified match activity, audience reach, and how sponsor funds supported athletes this month.
                </p>
                <Button className="mt-4" onClick={() => toast.success('Generating sponsor impact report...')}>Download PDF Report</Button>
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
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Button onClick={() => toast.success('Settings saved.')}>Save Profile</Button>
                <Button variant="outline" onClick={() => toast.success('Partner status request submitted.')}>Request Partner Status</Button>
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
      <CreateChallengeModal open={modalOpen === 'createChallenge'} onOpenChange={(open) => !open && setModalOpen(null)} />
      <InviteTeamAdminModal open={modalOpen === 'inviteTeamAdmin'} onOpenChange={(open) => !open && setModalOpen(null)} />
    </PageContainer>
  );
}
