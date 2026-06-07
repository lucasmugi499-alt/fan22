'use client';

import React, { useMemo, useState } from 'react';
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
import { CreatePostModal } from '@/components/modals/app-modals';
import { Button } from '@/components/ui/button';
import {
  GoalPlaceIndexPanel,
  LeagueIntegrityNote,
  LeagueStandingsTable,
  LeagueStatusBadge,
  LeagueStatusRoadmap,
} from '@/components/ui/league';
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
  SectionHeader,
  SportBadge,
  StatusBadge,
} from '@/components/ui/product';
import { dataProvider } from '@/data/dataProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { formatUGX } from '@/lib/sportThemes';
import { Athlete, Challenge, Match, Team, VerificationStatus } from '@/types';

type DrawerState = {
  title: string;
  description: string;
  body: React.ReactNode;
};

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

function challengeTitle(challenge: Challenge, athlete?: Athlete) {
  const base = challenge.type.replaceAll('_', ' ');
  const athleteLabel = athlete?.name.split(' ')[0] ?? 'Athlete';
  return `${athleteLabel}: ${base} target`;
}

function MiniMeta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-200">{value}</p>
    </div>
  );
}

function DrawerForm({
  fields,
  submitLabel,
  onSubmit,
}: {
  fields: { label: string; value: string }[];
  submitLabel: string;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-4">
      {fields.map((field) => (
        <label key={field.label} className="grid gap-2">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">{field.label}</span>
          <input
            defaultValue={field.value}
            className="h-11 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-semibold text-white outline-none focus:border-[var(--goal-emerald)]"
          />
        </label>
      ))}
      <div className="rounded-xl border border-[var(--goal-gold)]/20 bg-[var(--goal-gold)]/8 p-4 text-sm leading-6 text-slate-200">
        Demo workflow only. This records the admin action and keeps payment processing disabled.
      </div>
      <Button className="w-full" onClick={onSubmit}>{submitLabel}</Button>
    </div>
  );
}

export default function LeagueAdminPage() {
  return (
    <RoleGuard allowedRoles={['league_admin', 'platform_admin', 'super_admin']}>
      <LeagueAdminDashboard />
    </RoleGuard>
  );
}

function LeagueAdminDashboard() {
  const { leagues, teams, athletes, matches, challenges, feedPosts } = useGoalPlaceData();
  const [selectedLeagueId, setSelectedLeagueId] = useState(leagues[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState('Overview');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
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
  const leaguePosts = feedPosts.filter((post) => post.relatedLeagueId === selectedLeague?.id || post.authorRole === 'league').slice(0, 5);

  const tabs = [
    'Overview',
    'League Profile',
    'Teams',
    'Athletes',
    'Fixtures',
    'Results',
    'Verification Queue',
    'Challenges',
    'Standings',
    'GoalPlace Index',
    'Feed Posts',
    'Disputes',
    'Support/Payout Review',
    'Sponsor Visibility',
    'Settings',
  ];

  const tabGroups = [
    { label: 'Overview', tabs: ['Overview', 'League Profile'] },
    { label: 'Operations', tabs: ['Teams', 'Athletes', 'Fixtures', 'Results'] },
    { label: 'Verification', tabs: ['Verification Queue', 'Challenges', 'Standings', 'GoalPlace Index'] },
    { label: 'Engagement', tabs: ['Feed Posts', 'Disputes', 'Support/Payout Review', 'Sponsor Visibility'] },
    { label: 'Settings', tabs: ['Settings'] },
  ];

  const openWorkflow = (title: string, description: string, submitLabel: string, nextTab: string, fields: { label: string; value: string }[]) => {
    setDrawer({
      title,
      description,
      body: (
        <DrawerForm
          fields={fields}
          submitLabel={submitLabel}
          onSubmit={() => {
            setActiveTab(nextTab);
            setDrawer(null);
            toast.success(`${title} saved in demo mode.`);
          }}
        />
      ),
    });
  };

  const quickActions = {
    createFixture: () => openWorkflow('Create Fixture', 'Draft the next league fixture with teams, time, and venue.', 'Save Fixture Draft', 'Fixtures', [
      { label: 'Home Team', value: leagueTeams[0]?.name ?? 'Home team' },
      { label: 'Away Team', value: leagueTeams[1]?.name ?? 'Away team' },
      { label: 'Venue', value: leagueMatches[0]?.venue ?? `${selectedLeague?.city ?? 'Kampala'} Community Ground` },
      { label: 'Kickoff', value: 'Saturday 4:00 PM' },
    ]),
    addTeam: () => openWorkflow('Add Team', 'Invite a team into this league and queue profile verification.', 'Send Team Invite', 'Teams', [
      { label: 'Team Name', value: `${selectedLeague?.city ?? 'Kampala'} Rising FC` },
      { label: 'City', value: selectedLeague?.city ?? 'Kampala' },
      { label: 'Admin Contact', value: 'league-admin@goalplace256.demo' },
    ]),
    addAthlete: () => openWorkflow('Add Athlete', 'Add an athlete profile and connect them to a team roster.', 'Create Athlete Draft', 'Athletes', [
      { label: 'Athlete Name', value: 'Aisha Nakyeyune' },
      { label: 'Team', value: leagueTeams[0]?.name ?? 'Team pending' },
      { label: 'Position', value: 'Forward' },
    ]),
    verifyResult: () => {
      setActiveTab('Verification Queue');
      toast.success('Verification queue opened. Select a match result to approve or dispute.');
    },
    createChallenge: () => openWorkflow('Create Challenge', 'Create a verified performance challenge linked to a match.', 'Save Challenge Draft', 'Challenges', [
      { label: 'Athlete', value: leagueAthletes[0]?.name ?? 'Athlete pending' },
      { label: 'Match', value: leagueMatches[0] ? `${teamName(teams, leagueMatches[0].homeTeamId)} vs ${teamName(teams, leagueMatches[0].awayTeamId)}` : 'Match pending' },
      { label: 'Target', value: 'Score or assist in the fixture' },
    ]),
  };

  const updateMatch = async (match: Match, status: VerificationStatus) => {
    setPendingId(match.id);
    try {
      const nextStatus = normalizeVerificationStatus(status);
      await dataProvider.updateMatchVerification(match.id, nextStatus);
      setMatchOverrides((items) => ({ ...items, [match.id]: nextStatus }));
      toast.success(`Match marked ${nextStatus}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification update failed');
    } finally {
      setPendingId(null);
    }
  };

  const updateChallenge = async (challengeId: string, status: VerificationStatus) => {
    setPendingId(challengeId);
    try {
      const nextStatus = normalizeVerificationStatus(status);
      await dataProvider.updateChallengeVerification(challengeId, nextStatus);
      setChallengeOverrides((items) => ({ ...items, [challengeId]: nextStatus }));
      toast.success(`Challenge marked ${nextStatus}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Challenge update failed');
    } finally {
      setPendingId(null);
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
    { title: `${pendingMatches.length} match results awaiting decision`, detail: 'Review scores, venue notes, and submitted evidence.', tab: 'Verification Queue' },
    { title: `${pendingChallenges.length} challenge outcomes pending`, detail: 'Confirm athlete achievements before support releases.', tab: 'Challenges' },
    { title: 'Partner status request available', detail: 'Upgrade request is separate from sporting standings.', tab: 'Sponsor Visibility' },
  ];
  const teamRequests = leagueTeams.slice(0, 2).map((team, index) => ({
    id: `team_request_${team.id}`,
    team,
    submittedBy: index === 0 ? 'League secretary' : 'Team manager',
    status: index === 0 ? 'Pending profile review' : 'Needs roster proof',
  }));
  const athleteAchievements = leagueChallenges.slice(0, 3).map((challenge) => ({
    challenge,
    athlete: athletes.find((athlete) => athlete.id === challenge.athleteId),
    match: matches.find((match) => match.id === challenge.matchId),
  }));
  const disputes = leagueMatches.slice(0, 3).map((match, index) => ({
    id: `dispute_${match.id}`,
    type: index === 0 ? 'Score review' : index === 1 ? 'Challenge evidence' : 'Player eligibility',
    match,
    parties: `${teamName(teams, match.homeTeamId)} / ${teamName(teams, match.awayTeamId)}`,
    severity: index === 0 ? 'High' : index === 1 ? 'Medium' : 'Low',
    status: index === 0 ? 'Open' : 'Reviewing',
    updated: index === 0 ? '18m ago' : `${index + 2}h ago`,
  }));
  const payoutReviews = leagueChallenges.slice(0, 4).map((challenge, index) => {
    const athlete = athletes.find((item) => item.id === challenge.athleteId);
    const amount = challenge.totalPledged;
    const fee = Math.round(amount * 0.03);
    return {
      id: `payout_${challenge.id}`,
      athlete,
      team: teams.find((team) => team.id === athlete?.teamId),
      amount,
      fee,
      net: amount - fee,
      status: index === 0 ? 'Ready for review' : 'Evidence pending',
      challenge,
    };
  });

  return (
    <PageContainer compact className="space-y-6">
      <AppPageHeader
        eyebrow="League operating desk"
        title={selectedLeague.name}
        description="Run fixtures, rosters, verification queues, support reviews, league posts, and partner reporting from one production-grade workspace."
        meta={
          <>
            <SportBadge sport={selectedLeague.sport} />
            <LeagueStatusBadge status={selectedLeague.status} />
            <StatusBadge tone="info">{selectedLeague.season}</StatusBadge>
            <StatusBadge>{selectedLeague.city}</StatusBadge>
          </>
        }
        actions={
          <label className="grid min-w-64 gap-2">
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

      <AdminTabBar tabs={tabs} groups={tabGroups} activeTab={activeTab} onTabChange={setActiveTab} />

      <DashboardStatGrid>
        <ImpactStatCard label="Teams" value={String(leagueTeams.length)} detail={`${leagueAthletes.length} rostered athletes`} icon={Users} />
        <ImpactStatCard label="Upcoming fixtures" value={String(upcomingFixtures.length)} detail="Published and draft matchdays" icon={Calendar01Icon} tone="blue" />
        <ImpactStatCard label="Pending reviews" value={String(pendingMatches.length + pendingChallenges.length)} detail="Results and challenge outcomes" icon={Task01Icon} tone="orange" />
        <ImpactStatCard label="GoalPlace Index" value={String(selectedLeague.goalPlaceIndex)} detail="Separate from standings" icon={SecurityCheckIcon} tone="gold" />
      </DashboardStatGrid>

      <ActionToolbar>
        <Button size="sm" onClick={quickActions.createFixture}><Calendar01Icon className="size-4" /> Create Fixture</Button>
        <Button size="sm" variant="outline" onClick={quickActions.addTeam}><Building03Icon className="size-4" /> Add Team</Button>
        <Button size="sm" variant="outline" onClick={quickActions.addAthlete}><UserAdd01Icon className="size-4" /> Add Athlete</Button>
        <Button size="sm" variant="outline" onClick={quickActions.verifyResult}><CheckmarkCircle01Icon className="size-4" /> Verify Result</Button>
        <Button size="sm" variant="outline" onClick={quickActions.createChallenge}><Trophy className="size-4" /> Create Challenge</Button>
        <Button size="sm" variant="outline" onClick={() => setPostOpen(true)}><Comment01Icon className="size-4" /> Create League Post</Button>
        <Button size="sm" variant="gold" onClick={() => { setActiveTab('Sponsor Visibility'); toast.success('Partner status request noted for demo review.'); }}><UserGroupIcon className="size-4" /> Request Partner Status</Button>
      </ActionToolbar>

      <LeagueIntegrityNote />

      {activeTab === 'Overview' && (
        <div className="space-y-8">
          <DashboardSection eyebrow="Today" title="Urgent league tasks">
            <div className="grid gap-4 lg:grid-cols-3">
              {urgentTasks.map((task) => (
                <button key={task.title} className="rounded-xl border border-white/10 bg-white/[0.045] p-5 text-left transition-colors hover:border-[var(--goal-emerald)]/35 hover:bg-[var(--goal-emerald)]/8" onClick={() => setActiveTab(task.tab)}>
                  <Task01Icon className="mb-4 size-6 text-[var(--goal-mint)]" />
                  <h3 className="font-display text-lg font-black text-white">{task.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{task.detail}</p>
                </button>
              ))}
            </div>
          </DashboardSection>

          <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
            <DashboardSection eyebrow="Fixtures" title="Upcoming fixtures">
              <div className="space-y-3">
                {upcomingFixtures.map((match) => (
                  <MobileDataCard
                    key={match.id}
                    title={`${teamName(teams, match.homeTeamId)} vs ${teamName(teams, match.awayTeamId)}`}
                    eyebrow={formatDate(match.scheduledAt)}
                    meta={<StatusBadge tone={statusTone(match.status)}>{match.status}</StatusBadge>}
                    actions={<Button size="sm" variant="outline" onClick={() => { setActiveTab('Fixtures'); toast.success('Fixture opened in demo mode.'); }}>Open</Button>}
                  >
                    <div className="grid grid-cols-2 gap-3">
                      <MiniMeta label="Venue" value={match.venue} />
                      <MiniMeta label="Challenges" value="Available" />
                    </div>
                  </MobileDataCard>
                ))}
              </div>
            </DashboardSection>

            <DashboardSection eyebrow="Activity" title="Recent admin activity">
              <div className="space-y-3">
                {[
                  'Result evidence uploaded for match review.',
                  'Two athlete profiles reached 80% completion.',
                  'League post draft prepared for fixture weekend.',
                  'Sponsor visibility metrics refreshed.',
                ].map((item, index) => (
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

          <DashboardSection eyebrow="Onboarding" title="League status roadmap">
            <LeagueStatusRoadmap activeStatus={selectedLeague.status} />
          </DashboardSection>
        </div>
      )}

      {activeTab === 'League Profile' && (
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
          <DataCard>
            <SectionHeader eyebrow="Profile" title={selectedLeague.name} className="mb-4" />
            <div className="space-y-4 text-sm">
              <MiniMeta label="Description" value={selectedLeague.description} />
              <MiniMeta label="Season" value={selectedLeague.season} />
              <MiniMeta label="City" value={selectedLeague.city} />
              <MiniMeta label="Support activity" value={formatUGX(selectedLeague.totalSupport)} />
            </div>
            <Button className="mt-5" variant="outline" onClick={() => toast.success('League profile saved in demo mode.')}>Save Profile</Button>
          </DataCard>
          <LeagueStatusRoadmap activeStatus={selectedLeague.status} />
        </div>
      )}

      {activeTab === 'Teams' && (
        <DashboardSection eyebrow="Teams" title="League teams" action={<Button onClick={quickActions.addTeam}>Add Team</Button>}>
          <DataTableCard className="hidden lg:block">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-white/6 text-[11px] uppercase tracking-[0.16em] text-slate-400">
                <tr><th className="px-4 py-3">Team</th><th>City</th><th>Record</th><th>Athletes</th><th>Support</th><th>Status</th><th className="px-4">Actions</th></tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {leagueTeams.map((team) => (
                  <tr key={team.id}>
                    <td className="px-4 py-4 font-bold text-white">{team.name}</td>
                    <td className="text-slate-300">{team.city}</td>
                    <td className="text-slate-300">{team.wins}W {team.draws ?? 0}D {team.losses}L</td>
                    <td className="text-slate-300">{leagueAthletes.filter((athlete) => athlete.teamId === team.id).length}</td>
                    <td className="text-slate-300">{formatUGX(team.supportPool ?? team.totalSupport)}</td>
                    <td><StatusBadge tone={team.verified ? 'success' : 'warning'}>{team.verified ? 'Verified' : 'Review'}</StatusBadge></td>
                    <td className="px-4"><Button size="sm" variant="outline" onClick={() => toast.success(`${team.name} opened in demo mode.`)}>Manage</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableCard>
          <div className="grid gap-3 lg:hidden">
            {leagueTeams.map((team) => (
              <MobileDataCard key={team.id} title={team.name} eyebrow={team.city} meta={<StatusBadge tone={team.verified ? 'success' : 'warning'}>{team.verified ? 'Verified' : 'Review'}</StatusBadge>} actions={<Button size="sm" variant="outline" onClick={() => toast.success(`${team.name} opened in demo mode.`)}>Manage</Button>}>
                <div className="grid grid-cols-2 gap-3">
                  <MiniMeta label="Record" value={`${team.wins}W ${team.draws ?? 0}D ${team.losses}L`} />
                  <MiniMeta label="Support" value={formatUGX(team.supportPool ?? team.totalSupport)} />
                </div>
              </MobileDataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Athletes' && (
        <DashboardSection eyebrow="Athletes" title="Athlete roster" action={<Button onClick={quickActions.addAthlete}>Add Athlete</Button>}>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {leagueAthletes.slice(0, 12).map((athlete) => (
              <DataCard key={athlete.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-black text-white">{athlete.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{teamName(teams, athlete.teamId)} • {athlete.position}</p>
                  </div>
                  <StatusBadge tone={statusTone(athlete.verificationStatus)}>{athlete.verificationStatus}</StatusBadge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <MiniMeta label="Profile" value={`${athlete.verified ? 92 : 68}%`} />
                  <MiniMeta label="Support" value={formatUGX(athlete.totalEarnings ?? athlete.totalSupport)} />
                  <MiniMeta label="Challenges" value={leagueChallenges.filter((challenge) => challenge.athleteId === athlete.id).length} />
                </div>
                <Button className="mt-4" size="sm" variant="outline" onClick={() => toast.success(`${athlete.name} profile opened.`)}>View Profile</Button>
              </DataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Fixtures' && (
        <DashboardSection eyebrow="Fixtures" title="Fixture planner" description="Create fixtures, assign venues, and prepare challenge availability before matchday." action={<Button onClick={quickActions.createFixture}>Create Fixture</Button>}>
          <div className="space-y-3">
            {leagueMatches.map((match) => (
              <MobileDataCard
                key={match.id}
                title={`${teamName(teams, match.homeTeamId)} vs ${teamName(teams, match.awayTeamId)}`}
                eyebrow={formatDate(match.scheduledAt)}
                meta={<StatusBadge tone={statusTone(match.status)}>{match.status}</StatusBadge>}
                actions={<><Button size="sm" variant="outline" onClick={() => toast.success('Fixture editor opened in demo mode.')}>Edit</Button><Button size="sm" variant="outline" onClick={quickActions.createChallenge}>Challenge</Button></>}
              >
                <div className="grid gap-3 sm:grid-cols-3">
                  <MiniMeta label="Venue" value={match.venue} />
                  <MiniMeta label="City" value={match.city} />
                  <MiniMeta label="Challenges" value={leagueChallenges.filter((challenge) => challenge.matchId === match.id).length} />
                </div>
              </MobileDataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Results' && (
        <DashboardSection eyebrow="Results" title="Result review" action={<Button onClick={quickActions.verifyResult}>Submit Result</Button>}>
          <div className="space-y-3">
            {recentResults.map((match) => {
              const visibleStatus = matchOverrides[match.id] ?? match.verificationStatus;
              return (
                <MobileDataCard
                  key={match.id}
                  title={`${teamName(teams, match.homeTeamId)} ${match.score.home ?? '-'} - ${match.score.away ?? '-'} ${teamName(teams, match.awayTeamId)}`}
                  eyebrow={`${match.venue} • submitted by ${selectedLeague.name}`}
                  meta={<StatusBadge tone={statusTone(String(visibleStatus))}>{visibleStatus}</StatusBadge>}
                  actions={<><Button size="sm" onClick={() => updateMatch(match, 'verified')} disabled={pendingId === match.id}>Verify Result</Button><Button size="sm" variant="outline" onClick={() => updateMatch(match, 'disputed')} disabled={pendingId === match.id}>Dispute</Button></>}
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MiniMeta label="Evidence" value="Score sheet + media" />
                    <MiniMeta label="Submitted" value="42m ago" />
                    <MiniMeta label="Support" value={formatUGX(match.totalSupport)} />
                  </div>
                </MobileDataCard>
              );
            })}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Verification Queue' && (
        <div className="grid gap-8 xl:grid-cols-2">
          <DashboardSection eyebrow="Match Results" title="Match result reviews">
            <div className="space-y-3">
              {pendingMatches.map((match) => (
                <MobileDataCard key={match.id} title={`${teamName(teams, match.homeTeamId)} vs ${teamName(teams, match.awayTeamId)}`} eyebrow={`${match.venue} • submitted 28m ago`} meta={<StatusBadge tone={statusTone(String(matchOverrides[match.id] ?? match.verificationStatus))}>{matchOverrides[match.id] ?? match.verificationStatus}</StatusBadge>} actions={<><Button size="sm" onClick={() => updateMatch(match, 'verified')} disabled={pendingId === match.id}>Verify</Button><Button size="sm" variant="outline" onClick={() => updateMatch(match, 'disputed')} disabled={pendingId === match.id}>Dispute</Button></>}>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniMeta label="Score/status" value={match.score.home === null ? 'Scheduled' : `${match.score.home}-${match.score.away}`} />
                    <MiniMeta label="Evidence" value="Media + score sheet" />
                  </div>
                </MobileDataCard>
              ))}
            </div>
          </DashboardSection>
          <DashboardSection eyebrow="Athlete Achievements" title="Challenge result reviews">
            <div className="space-y-3">
              {athleteAchievements.map(({ challenge, athlete, match }) => (
                <MobileDataCard key={challenge.id} title={challengeTitle(challenge, athlete)} eyebrow={`${teamName(teams, match?.homeTeamId)} vs ${teamName(teams, match?.awayTeamId)}`} meta={<StatusBadge tone={statusTone(String(challengeOverrides[challenge.id] ?? challenge.verificationStatus))}>{challengeOverrides[challenge.id] ?? challenge.verificationStatus}</StatusBadge>} actions={<><Button size="sm" onClick={() => updateChallenge(challenge.id, 'verified')} disabled={pendingId === challenge.id}>Verify</Button><Button size="sm" variant="outline" onClick={() => updateChallenge(challenge.id, 'rejected')} disabled={pendingId === challenge.id}>Reject</Button></>}>
                  <div className="grid grid-cols-2 gap-3">
                    <MiniMeta label="Target" value={challenge.targetDescription ?? challenge.description} />
                    <MiniMeta label="Supporters" value={challenge.supportersCount} />
                  </div>
                </MobileDataCard>
              ))}
            </div>
          </DashboardSection>
          <DashboardSection eyebrow="Team Requests" title="Team profile requests">
            <div className="space-y-3">
              {teamRequests.map((request) => (
                <MobileDataCard key={request.id} title={request.team.name} eyebrow={`Submitted by ${request.submittedBy}`} meta={<StatusBadge tone="warning">{request.status}</StatusBadge>} actions={<Button size="sm" variant="outline" onClick={() => toast.success(`${request.team.name} request reviewed.`)}>Review Request</Button>}>
                  <MiniMeta label="City" value={request.team.city} />
                </MobileDataCard>
              ))}
            </div>
          </DashboardSection>
          <DashboardSection eyebrow="Challenge Results" title="High-value support checks">
            <div className="space-y-3">
              {payoutReviews.slice(0, 2).map((payout) => (
                <MobileDataCard key={payout.id} title={payout.athlete?.name ?? 'Athlete'} eyebrow={payout.challenge.targetDescription ?? payout.challenge.description} meta={<StatusBadge tone="gold">{formatUGX(payout.amount)}</StatusBadge>} actions={<Button size="sm" variant="gold" onClick={() => { setActiveTab('Support/Payout Review'); toast.success('Support review opened.'); }}>Review Support</Button>}>
                  <MiniMeta label="Net amount" value={formatUGX(payout.net)} />
                </MobileDataCard>
              ))}
            </div>
          </DashboardSection>
        </div>
      )}

      {activeTab === 'Challenges' && (
        <DashboardSection eyebrow="Challenges" title="Performance challenges" action={<Button onClick={quickActions.createChallenge}>Create Challenge</Button>}>
          <div className="grid gap-3 md:grid-cols-2">
            {leagueChallenges.map((challenge) => {
              const athlete = athletes.find((item) => item.id === challenge.athleteId);
              const match = matches.find((item) => item.id === challenge.matchId);
              const visibleStatus = challengeOverrides[challenge.id] ?? challenge.verificationStatus;
              return (
                <DataCard key={challenge.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <SportBadge sport={challenge.sport} />
                      <h3 className="mt-3 font-display text-lg font-black text-white">{challengeTitle(challenge, athlete)}</h3>
                      <p className="mt-1 text-sm text-slate-400">{teamName(teams, match?.homeTeamId)} vs {teamName(teams, match?.awayTeamId)} • {formatDate(match?.scheduledAt)}</p>
                    </div>
                    <StatusBadge tone={statusTone(String(visibleStatus))}>{visibleStatus}</StatusBadge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <MiniMeta label="Target" value={challenge.targetDescription ?? challenge.description} />
                    <MiniMeta label="Pledged" value={formatUGX(challenge.totalPledged)} />
                    <MiniMeta label="Supporters" value={challenge.supportersCount} />
                    <MiniMeta label="Action" value={<button className="text-[var(--goal-mint)]" onClick={() => updateChallenge(challenge.id, 'verified')}>Verify</button>} />
                  </div>
                </DataCard>
              );
            })}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Standings' && (
        <DashboardSection eyebrow="League Standings" title="Match-result table" description="Standings are based only on match results. Paid plans never affect sporting ranking.">
          <LeagueStandingsTable standings={standings} />
        </DashboardSection>
      )}

      {activeTab === 'GoalPlace Index' && (
        <DashboardSection eyebrow="GoalPlace Index" title="Platform quality index" description="Separate from standings and based on verification, match completion, profile completion, engagement, support activity, admin reliability, and media uploads.">
          <GoalPlaceIndexPanel league={selectedLeague} />
        </DashboardSection>
      )}

      {activeTab === 'Feed Posts' && (
        <DashboardSection eyebrow="Feed Posts" title="League communications" description="Recent league posts, engagement, and visibility status." action={<Button onClick={() => setPostOpen(true)}>Create League Post</Button>}>
          <div className="grid gap-3">
            {leaguePosts.map((post) => (
              <MobileDataCard key={post.id} title={post.caption.slice(0, 72)} eyebrow={`${post.authorName} • ${formatDate(post.createdAt)}`} meta={<StatusBadge tone={post.status === 'active' ? 'success' : 'warning'}>{post.status}</StatusBadge>} actions={<Button size="sm" variant="outline" onClick={() => toast.success('Post analytics opened in demo mode.')}>View Post</Button>}>
                <div className="grid grid-cols-3 gap-3">
                  <MiniMeta label="Likes" value={post.likesCount} />
                  <MiniMeta label="Comments" value={post.commentsCount} />
                  <MiniMeta label="Shares" value={post.sharesCount} />
                </div>
              </MobileDataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Disputes' && (
        <DashboardSection eyebrow="Disputes" title="Dispute records">
          <div className="grid gap-3 lg:grid-cols-3">
            {disputes.map((dispute) => (
              <MobileDataCard key={dispute.id} title={dispute.type} eyebrow={dispute.parties} meta={<StatusBadge tone={statusTone(dispute.severity)}>{dispute.severity}</StatusBadge>} actions={<Button size="sm" variant="outline" onClick={() => setDrawer({ title: dispute.type, description: 'Review notes, parties, evidence, and last admin action.', body: <div className="space-y-4"><MiniMeta label="Status" value={dispute.status} /><MiniMeta label="Last update" value={dispute.updated} /><Button onClick={() => { setDrawer(null); toast.success('Dispute marked reviewed in demo mode.'); }}>Mark Reviewed</Button></div> })}>Review Dispute</Button>}>
                <div className="grid grid-cols-2 gap-3">
                  <MiniMeta label="Status" value={dispute.status} />
                  <MiniMeta label="Updated" value={dispute.updated} />
                </div>
              </MobileDataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Support/Payout Review' && (
        <DashboardSection eyebrow="Support/Payout Review" title="Verified support release review" description="Demo payout review only. Real payment processing is not enabled yet.">
          <div className="grid gap-3 lg:grid-cols-2">
            {payoutReviews.map((payout) => (
              <DataCard key={payout.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-display text-lg font-black text-white">{payout.athlete?.name ?? 'Athlete pending'}</h3>
                    <p className="mt-1 text-sm text-slate-400">{payout.team?.name ?? 'Team pending'} • {payout.challenge.targetDescription ?? payout.challenge.description}</p>
                  </div>
                  <StatusBadge tone="warning">{payout.status}</StatusBadge>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <MiniMeta label="Amount" value={formatUGX(payout.amount)} />
                  <MiniMeta label="Platform fee" value={formatUGX(payout.fee)} />
                  <MiniMeta label="Net" value={formatUGX(payout.net)} />
                </div>
                <Button className="mt-4" size="sm" variant="gold" onClick={() => toast.success('Support release approved in demo mode. Real payments remain disabled.')}>Approve Demo Review</Button>
              </DataCard>
            ))}
          </div>
        </DashboardSection>
      )}

      {activeTab === 'Sponsor Visibility' && (
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <DataCard>
            <UserGroupIcon className="mb-4 size-6 text-[var(--goal-gold)]" />
            <h3 className="font-display text-2xl font-black text-white">Partner league tools</h3>
            <p className="mt-3 text-sm leading-6 text-slate-300">Sponsor reporting, analytics, and priority support become available after partner review. Paid tools never affect standings.</p>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <MiniMeta label="Placements" value="8" />
              <MiniMeta label="Reach" value="24K" />
              <MiniMeta label="Reports" value="Ready" />
            </div>
            <Button className="mt-5" variant="gold" onClick={() => toast.success('Partner status request submitted in demo mode.')}>Request Partner Status</Button>
          </DataCard>
          <GoalPlaceIndexPanel league={selectedLeague} />
        </div>
      )}

      {activeTab === 'Settings' && (
        <DashboardSection eyebrow="Settings" title="League settings and admin controls">
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ['Verification rules', 'Referee confirmation, league admin approval, and challenge evidence settings.'],
              ['Admin users', 'Invite coordinators and restrict result verification rights.'],
              ['Notifications', 'Configure fixture reminders, dispute alerts, and payout review messages.'],
              ['Status request', 'Request verified or partner review without affecting sport rankings.'],
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

      <CreatePostModal open={postOpen} onOpenChange={setPostOpen} />
      <DetailDrawer open={Boolean(drawer)} onOpenChange={(open) => !open && setDrawer(null)} title={drawer?.title ?? ''} description={drawer?.description}>
        {drawer?.body}
      </DetailDrawer>
    </PageContainer>
  );
}
