'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ActionToolbar, DataCard, DetailDrawer, PageContainer, SectionHeader, StatusExplainerChip } from '@/components/ui/product';
import { Button } from '@/components/ui/button';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { 
  Building03Icon, 
  Calendar01Icon, 
  Settings01Icon, 
  PlusSignIcon,
  ListViewIcon,
} from 'hugeicons-react';
import { Users, Trophy } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { AddAthleteModal, SubmitResultModal, UploadTeamUpdateModal, AddSupportNeedModal } from '@/components/modals/demo-modals';

type Tab = 'Overview' | 'Roster' | 'Fixtures & Results' | 'Athlete Updates' | 'Team Profile';
const TABS: { id: Tab; icon: React.ElementType }[] = [
  { id: 'Overview', icon: Building03Icon },
  { id: 'Roster', icon: Users },
  { id: 'Fixtures & Results', icon: Calendar01Icon },
  { id: 'Athlete Updates', icon: ListViewIcon },
  { id: 'Team Profile', icon: Settings01Icon },
];

function TeamAdminContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const queryTeamId = searchParams?.get('team');
  const queryLeagueId = searchParams?.get('league');

  const queryTab = searchParams?.get('tab');

  const routeKey = searchParams?.toString() ?? '';
  const [localTab, setLocalTabState] = useState<{ routeKey: string; tab: Tab | null }>({ routeKey, tab: null });
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<{ title: string; description: string; body: React.ReactNode } | null>(null);
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [profileUpdated, setProfileUpdated] = useState(false);
  const [rosterUpdated, setRosterUpdated] = useState(false);
  const [opponentConfirmed, setOpponentConfirmed] = useState(false);
  const [disputeFiled, setDisputeFiled] = useState(false);
  const [recentTeamUpdates, setRecentTeamUpdates] = useState<{title: string, message: string, timestamp: string}[]>([]);
  const [supportNeeds, setSupportNeeds] = useState<{athleteName: string, type: string, amount: string}[]>([]);
  const { teams, matches, athletes } = useGoalPlaceData();

  const queryTabMatch = queryTab
    ? TABS.find(t => t.id.toLowerCase().replace(/[^a-z0-9]/g, '') === queryTab.toLowerCase().replace(/[^a-z0-9]/g, ''))?.id ?? null
    : null;
  const activeTab = localTab.routeKey === routeKey && localTab.tab ? localTab.tab : queryTabMatch ?? 'Overview';
  const setActiveTab = (tab: Tab) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (tab === 'Overview') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const query = params.toString();
    setLocalTabState({ routeKey: query, tab });
    router.replace(`/team-admin${query ? `?${query}` : ''}`, { scroll: false });
  };

  const availableTeams = queryLeagueId ? teams.filter(t => t.leagueId === queryLeagueId) : teams;
  const selectedTeamId = queryTeamId || availableTeams[0]?.id || '';

  const team = teams.find(t => t.id === selectedTeamId) || null;
  const teamMatches = matches.filter(m => m.homeTeamId === team?.id || m.awayTeamId === team?.id);
  const teamAthletes = athletes.filter(a => a.teamId === team?.id);
  const rosterCompleteness = rosterUpdated ? 100 : team?.rosterCompleteness ?? Math.min(100, Math.max(40, teamAthletes.length * 18));
  const publicProfileCompleteness = profileUpdated ? 100 : team?.publicProfileCompleteness ?? 76;
  const teamStatus = verificationRequested ? 'Pending Verification' : team?.verificationStatus ?? (team?.verified ? 'Verified' : 'Needs Evidence');
  const pendingSubmissions = (team?.pendingSubmissions ?? 0) + teamMatches.filter((match) => match.status === 'Completed' && match.verificationStatus !== 'Verified').length;

  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || id;

  const handleRequestVerification = () => {
    setVerificationRequested(true);
    toast.success('Team verification request submitted. League Admin review is now pending.');
  };

  const handlePublishHighlight = () => {
    const update = {
      title: 'New team highlight queued',
      message: `${team?.name ?? 'Team'} added a highlight for league review and public feed publishing.`,
      timestamp: 'Just now',
    };
    setRecentTeamUpdates((current) => [update, ...current]);
    toast.success('Demo highlight published. It now appears in Recent Updates.');
  };

  const handleSaveProfile = () => {
    setProfileUpdated(true);
    setModalOpen(null);
    toast.success('Team profile changes saved in demo mode.');
  };

  const openActionDrawer = (title: string, description: string, body: React.ReactNode) => {
    setDrawer({ title, description, body });
  };

  const tabActions: Record<Tab, { label: string; icon: React.ElementType; variant?: 'default' | 'outline'; onClick: () => void }[]> = {
    Overview: [
      { label: 'Add Athlete', icon: PlusSignIcon, variant: 'outline', onClick: () => setModalOpen('addAthlete') },
      { label: 'Submit Result', icon: Trophy, variant: 'outline', onClick: () => setModalOpen('submitResult') },
      { label: 'Upload Team Update', icon: ListViewIcon, variant: 'outline', onClick: () => setModalOpen('uploadUpdate') },
    ],
    Roster: [
      { label: 'Add Athlete', icon: PlusSignIcon, onClick: () => setModalOpen('addAthlete') },
      { label: 'Update Roster', icon: Users, variant: 'outline', onClick: () => { setRosterUpdated(true); toast.success('Roster completeness updated locally.'); } },
      { label: 'Invite Athlete', icon: Users, variant: 'outline', onClick: () => openActionDrawer('Invite Athlete', 'Prepare a demo roster invitation for a player to join this team.', <div className="space-y-4"><DataCard><StatusExplainerChip domain="athlete" status="Pending Verification" showDetail /></DataCard><Button className="w-full" onClick={() => { setDrawer(null); toast.success('Athlete invitation queued in demo mode.'); }}>Queue Athlete Invitation</Button></div>) },
    ],
    'Fixtures & Results': [
      { label: 'Submit Result', icon: Trophy, onClick: () => setModalOpen('submitResult') },
      { label: 'Confirm Opponent Result', icon: Calendar01Icon, variant: 'outline', onClick: () => { setOpponentConfirmed(true); toast.success('Opponent result confirmation recorded locally.'); } },
      { label: 'Dispute Result', icon: Calendar01Icon, variant: 'outline', onClick: () => { setDisputeFiled(true); toast.success('Result dispute filed locally for league review.'); } },
    ],
    'Athlete Updates': [
      { label: 'Upload Team Update', icon: ListViewIcon, onClick: () => setModalOpen('uploadUpdate') },
      { label: 'Add Support Need', icon: PlusSignIcon, variant: 'outline', onClick: () => setModalOpen('addSupportNeed') },
      { label: 'Request Verification', icon: Settings01Icon, variant: 'outline', onClick: handleRequestVerification },
    ],
    'Team Profile': [
      { label: 'Edit Team Profile', icon: Settings01Icon, onClick: () => setModalOpen('editProfile') },
      { label: 'View Public Team Page', icon: Building03Icon, variant: 'outline', onClick: () => router.push(`/teams/${team?.id}`) },
    ],
  };

  if (!team) {
    return (
      <RoleGuard allowedRoles={['team_admin', 'league_admin', 'platform_admin', 'super_admin']}>
        <PageContainer compact className="pb-24 pt-6 md:pt-10">
          <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-white/10 bg-[#0A0D14] p-8 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-white/5 text-slate-400">
              <Building03Icon className="size-8" />
            </div>
            <h2 className="mb-2 font-display text-2xl font-black text-white">No Team Assigned</h2>
            <p className="mb-6 max-w-md text-slate-400">
              You do not currently have administrative access to any teams. Ask your League Admin to invite you to a team.
            </p>
            <Button onClick={() => router.push('/leagues')}>Explore Leagues</Button>
          </div>
        </PageContainer>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['team_admin', 'league_admin', 'platform_admin', 'super_admin']}>
      <PageContainer compact className="pb-24 pt-6 md:pt-10">
        
        {/* Header */}
        <div className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-xl bg-slate-800 text-white">
                <Building03Icon className="size-6" />
              </div>
              <div>
                <h1 className="font-display text-2xl font-black text-white md:text-3xl">
                  {team ? team.name : 'Team Console'}
                </h1>
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  <span>{team?.city || 'Kampala'}, Uganda</span>
                  <span className="text-slate-600">•</span>
                  <StatusExplainerChip domain="team" status={teamStatus} />
                </div>
              </div>
            </div>
            
            {availableTeams.length > 1 && (
              <label className="hidden md:block">
                <span className="sr-only">Select Team</span>
                <select
                  value={selectedTeamId}
                  onChange={(e) => {
                    router.push(`/team-admin?team=${e.target.value}`);
                  }}
                  className="h-11 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-bold text-white outline-none focus:border-[var(--goal-emerald)]"
                >
                  {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <p className="mt-2 mb-4 max-w-3xl text-sm leading-6 text-slate-400">
            Team Admins, coaches, and managers keep rosters, athlete profiles, photos, result submissions, and team updates current.
          </p>
          {availableTeams.length > 1 && (
            <div className="md:hidden mt-4">
              <select
                value={selectedTeamId}
                onChange={(e) => {
                  router.push(`/team-admin?team=${e.target.value}`);
                }}
                className="w-full h-11 rounded-lg border border-white/10 bg-white/6 px-3 text-sm font-bold text-white outline-none focus:border-[var(--goal-emerald)]"
              >
                {availableTeams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-3 flex space-x-1 overflow-x-auto rounded-xl bg-black/40 p-1 backdrop-blur-md">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2.5 text-sm font-bold transition-all ${
                  isActive 
                    ? 'bg-white/10 text-white shadow-sm' 
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Icon className={`size-4 ${isActive ? 'text-[var(--goal-mint)]' : ''}`} />
                {tab.id}
              </button>
            );
          })}
        </div>

        <ActionToolbar className="mb-8">
          {tabActions[activeTab].map((action) => {
            const Icon = action.icon;
            return (
              <Button key={action.label} size="sm" variant={action.variant} onClick={action.onClick}>
                <Icon className="size-4" />
                {action.label}
              </Button>
            );
          })}
        </ActionToolbar>

        {/* Tab Content */}
        <div className="min-h-[50vh]">
          {/* OVERVIEW */}
          {activeTab === 'Overview' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <div className="text-sm font-medium text-slate-400">Roster Completeness</div>
                  <div className="mt-2 text-2xl font-black text-white">{rosterCompleteness}%</div>
                  <div className="mt-3 h-1.5 rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[var(--goal-emerald)]" style={{ width: `${rosterCompleteness}%` }} />
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <div className="text-sm font-medium text-slate-400">Pending Submissions</div>
                  <div className="mt-2 text-2xl font-black text-white">{pendingSubmissions}</div>
                  <p className="mt-2 text-xs text-slate-500">Results and profile changes waiting for review.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <div className="text-sm font-medium text-slate-400">Total Support Pool</div>
                  <div className="mt-2 text-2xl font-black text-[var(--goal-mint)]">UGX {team?.totalSupport?.toLocaleString() || 0}</div>
                  <p className="mt-2 text-xs text-slate-500">Visible support only. Standings never use payment activity.</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <div className="text-sm font-medium text-slate-400">Verification Status</div>
                  <div className="mt-3">
                    <StatusExplainerChip domain="team" status={teamStatus} showDetail />
                  </div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-6">
                  <h2 className="mb-4 font-display text-lg font-black text-white">Operations Snapshot</h2>
                  <div className="grid gap-3 text-sm text-slate-300">
                    <div className="rounded-lg bg-white/5 p-3">
                      <span className="font-bold text-white">{teamAthletes.length}</span> athletes are attached to this team record.
                    </div>
                    <div className="rounded-lg bg-white/5 p-3">
                      <span className="font-bold text-white">{teamMatches.length}</span> fixtures or results are connected to this team.
                    </div>
                    <div className="rounded-lg bg-white/5 p-3">
                      Public profile completeness is <span className="font-bold text-white">{publicProfileCompleteness}%</span>.
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-6">
                  <h2 className="mb-4 font-display text-lg font-black text-white">Pending Tasks</h2>
                  <ul className="space-y-3">
                    <li className="flex flex-col gap-2 rounded-lg bg-white/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-slate-300">Submit result for recent match</span>
                      <Button size="sm" variant="ghost" className="h-8 text-[var(--goal-mint)]" onClick={() => setModalOpen('submitResult')}>Submit Match Result</Button>
                    </li>
                    <li className="flex flex-col gap-2 rounded-lg bg-white/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-slate-300">3 athletes missing profile photos</span>
                      <Button size="sm" variant="ghost" className="h-8 text-[var(--goal-mint)]" onClick={() => setActiveTab('Athlete Updates')}>Add Athlete Media</Button>
                    </li>
                    <li className="flex flex-col gap-2 rounded-lg bg-white/5 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-slate-300">Roster incomplete</span>
                      <Button size="sm" variant="ghost" className="h-8 text-[var(--goal-mint)]" onClick={() => setActiveTab('Roster')}>Complete Roster</Button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* ROSTER */}
          {activeTab === 'Roster' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-black text-white">Team Roster</h2>
              </div>
              {rosterUpdated && (
                <DataCard className="border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/8">
                  <p className="text-sm font-bold text-[var(--goal-mint)]">Roster update recorded locally.</p>
                  <p className="mt-1 text-sm text-slate-300">Roster completeness is now marked at 100% for this demo session.</p>
                </DataCard>
              )}
              <div className="rounded-xl border border-white/10 bg-[#0A0D14] overflow-hidden">
                {/* Desktop Table */}
                <div className="hidden md:block">
                  <table className="w-full text-left text-sm text-slate-300">
                    <thead className="bg-white/5 text-xs uppercase text-slate-400">
                      <tr>
                        <th className="px-6 py-4 font-black">Athlete</th>
                        <th className="px-6 py-4 font-black">Position</th>
                        <th className="px-6 py-4 font-black">Status</th>
                        <th className="px-6 py-4 font-black text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {teamAthletes.slice(0, 5).map(athlete => (
                        <tr key={athlete.id} className="hover:bg-white/[0.02]">
                          <td className="px-6 py-4">
                            <div className="font-medium text-white">{athlete.name}</div>
                            <div className="mt-1 text-xs text-slate-500">Profile {athlete.verified ? 100 : 82}% complete</div>
                          </td>
                          <td className="px-6 py-4">{athlete.position}</td>
                          <td className="px-6 py-4">
                            <StatusExplainerChip domain="athlete" status={athlete.verified ? 'Verified' : athlete.verificationStatus} />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => openActionDrawer('Edit Athlete Details', 'Review team-managed athlete profile fields before league verification.', <div className="space-y-4"><DataCard><div className="grid gap-3 sm:grid-cols-2"><div><p className="text-xs font-bold uppercase text-slate-500">Athlete</p><p className="mt-1 font-bold text-white">{athlete.name}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Position</p><p className="mt-1 font-bold text-white">{athlete.position}</p></div></div></DataCard><Button className="w-full" onClick={() => { setDrawer(null); toast.success(`${athlete.name} profile update staged locally.`); }}>Stage Athlete Update</Button></div>)}>Edit Athlete Details</Button>
                          </td>
                        </tr>
                      ))}
                      {teamAthletes.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-6 py-8 text-center text-slate-500">No athletes found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {/* Mobile Cards */}
                <div className="md:hidden divide-y divide-white/5">
                  {teamAthletes.slice(0, 5).map(athlete => (
                    <div key={athlete.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-white">{athlete.name}</div>
                          <div className="text-xs text-slate-400 mt-1">{athlete.position}</div>
                        </div>
                        <StatusExplainerChip domain="athlete" status={athlete.verified ? 'Verified' : athlete.verificationStatus} />
                      </div>
                      <div className="mt-3 h-1.5 rounded-full bg-white/10">
                        <div className="h-full rounded-full bg-[var(--goal-emerald)]" style={{ width: `${athlete.verified ? 100 : 82}%` }} />
                      </div>
                      <div className="mt-3 text-right">
                        <Button variant="ghost" size="sm" className="h-8 w-full border border-white/10 text-xs" onClick={() => openActionDrawer('Edit Athlete Details', 'Review team-managed athlete profile fields before league verification.', <div className="space-y-4"><DataCard><div className="grid gap-3"><div><p className="text-xs font-bold uppercase text-slate-500">Athlete</p><p className="mt-1 font-bold text-white">{athlete.name}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Position</p><p className="mt-1 font-bold text-white">{athlete.position}</p></div></div></DataCard><Button className="w-full" onClick={() => { setDrawer(null); toast.success(`${athlete.name} profile update staged locally.`); }}>Stage Athlete Update</Button></div>)}>Edit Athlete Details</Button>
                      </div>
                    </div>
                  ))}
                  {teamAthletes.length === 0 && (
                    <div className="p-8 text-center text-slate-500 text-sm">No athletes found.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* FIXTURES & RESULTS */}
          {activeTab === 'Fixtures & Results' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-black text-white">Fixtures & Results</h2>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-6">
                <p className="text-sm text-slate-400 mb-4">
                  Team Admins submit match results with evidence. League Admins verify results before standings or verified challenges update.
                </p>
                {(opponentConfirmed || disputeFiled) && (
                  <div className="mb-4 grid gap-3 md:grid-cols-2">
                    {opponentConfirmed && (
                      <DataCard className="border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/8">
                        <p className="text-sm font-bold text-[var(--goal-mint)]">Opponent confirmation recorded.</p>
                        <p className="mt-1 text-xs text-slate-300">This demo result is ready for league verification review.</p>
                      </DataCard>
                    )}
                    {disputeFiled && (
                      <DataCard className="border-orange-400/25 bg-orange-500/10">
                        <p className="text-sm font-bold text-orange-300">Result dispute filed.</p>
                        <p className="mt-1 text-xs text-slate-300">League Admin will see this as a verification review item.</p>
                      </DataCard>
                    )}
                  </div>
                )}
                <div className="space-y-4 md:space-y-0 md:grid md:gap-4 md:grid-cols-2">
                  {teamMatches.slice(0, 3).map(match => (
                    <div key={match.id} className="flex flex-col md:flex-row md:items-center justify-between rounded-lg border border-white/5 bg-white/5 p-4">
                      <div className="mb-3 md:mb-0">
                        <div className="text-xs font-bold text-slate-400">{new Date(match.date ?? match.scheduledAt).toLocaleDateString()}</div>
                        <div className="mt-1 font-medium text-white">{getTeamName(match.homeTeamId)} vs {getTeamName(match.awayTeamId)}</div>
                        <p className="mt-1 text-xs text-slate-500">Standing impact: only after league verification.</p>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
                        <StatusExplainerChip
                          domain="match"
                          status={match.verificationStatus === 'Verified' ? 'Verified' : match.status === 'Completed' ? 'Pending Verification' : match.status === 'Upcoming' ? 'Scheduled' : match.status}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 border border-white/10 text-xs md:border-0"
                          onClick={() => openActionDrawer('Match Evidence', 'Review the submitted score context before confirming or disputing.', <div className="space-y-4"><DataCard><div className="grid gap-3"><div><p className="text-xs font-bold uppercase text-slate-500">Match</p><p className="mt-1 font-bold text-white">{getTeamName(match.homeTeamId)} vs {getTeamName(match.awayTeamId)}</p></div><div><p className="text-xs font-bold uppercase text-slate-500">Evidence</p><p className="mt-1 text-sm text-slate-300">Score sheet, venue note, and team admin confirmation placeholder.</p></div></div></DataCard><Button className="w-full" onClick={() => { setDrawer(null); setOpponentConfirmed(true); toast.success('Match evidence confirmed locally.'); }}>Confirm Evidence Reviewed</Button></div>)}
                        >
                          Review Match Evidence
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ATHLETE UPDATES */}
          {activeTab === 'Athlete Updates' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-xl font-black text-white">Athlete Updates & Needs</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <h3 className="font-bold text-white">Highlight Upload Placeholders</h3>
                  <p className="mt-2 text-sm text-slate-400">Ensure athletes have match footage linked to their profile.</p>
                  <Button variant="outline" className="mt-4 w-full" onClick={handlePublishHighlight}>Publish Team Highlight</Button>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <h3 className="font-bold text-white">Verification Requests</h3>
                  <p className="mt-2 text-sm text-slate-400">Request league admin verification for athlete achievements.</p>
                  {verificationRequested ? (
                    <div className="mt-4 flex flex-col items-center justify-center rounded-lg bg-orange-500/20 py-3 px-4 text-center">
                      <span className="text-sm font-bold text-orange-400">Team verification request pending league review</span>
                      <span className="mt-1 text-xs text-orange-400/80">Submitted: Just now</span>
                      <span className="mt-2 text-xs text-orange-400/80 border-t border-orange-500/20 pt-2 w-full">Next step: League Admin reviews this under Verification.</span>
                    </div>
                  ) : (
                    <Button variant="outline" className="mt-4 w-full" onClick={handleRequestVerification}>Request Team Verification</Button>
                  )}
                </div>
              </div>

              {/* Local Demo State Rendering */}
              {(recentTeamUpdates.length > 0 || supportNeeds.length > 0) && (
                <div className="grid gap-4 md:grid-cols-2 mt-6">
                  {recentTeamUpdates.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                      <h3 className="font-bold text-white mb-4">Recent Updates (Demo)</h3>
                      <div className="space-y-3">
                        {recentTeamUpdates.map((update, i) => (
                          <div key={i} className="p-3 bg-white/5 rounded-lg border border-white/10">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-bold text-sm text-white">{update.title}</span>
                              <StatusExplainerChip domain="system" status="Submitted" />
                            </div>
                            <p className="text-xs text-slate-400">{update.message}</p>
                            <div className="text-[10px] text-slate-500 mt-2">{update.timestamp}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {supportNeeds.length > 0 && (
                    <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                      <h3 className="font-bold text-white mb-4">Support Needs (Demo)</h3>
                      <div className="space-y-3">
                        {supportNeeds.map((need, i) => (
                          <div key={i} className="p-3 bg-white/5 rounded-lg border border-white/10">
                            <div className="flex justify-between items-start mb-1">
                              <span className="font-bold text-sm text-white">{need.athleteName} - {need.type}</span>
                              <StatusExplainerChip domain="support" status="Pending" />
                            </div>
                            <p className="text-xs text-[var(--goal-mint)] font-bold">Target: {need.amount}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TEAM PROFILE */}
          {activeTab === 'Team Profile' && (
            <div className="space-y-6">
              <SectionHeader title="Team Profile" description="Manage your public team appearance and contact info." />
              <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Team Name</label>
                    <div className="mt-1 text-white font-medium">{team?.name}</div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Coach / Contact</label>
                    <div className="mt-1 text-white font-medium">{team?.teamAdminName || 'Not Set'}</div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Location</label>
                    <div className="mt-1 text-white font-medium">{team?.city}, {team?.country}</div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Public Completeness</label>
                    <div className="mt-1 text-white font-medium">{publicProfileCompleteness}%</div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-400 uppercase">Public Status</label>
                    <div className="mt-2"><StatusExplainerChip domain="team" status={teamStatus} /></div>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
        <AddAthleteModal 
          open={modalOpen === 'addAthlete'} 
          onOpenChange={(open) => !open && setModalOpen(null)} 
          currentTeamId={team.id}
          currentLeagueId={team.leagueId}
        />
        <SubmitResultModal 
          open={modalOpen === 'submitResult'} 
          onOpenChange={(open) => !open && setModalOpen(null)} 
          currentTeamId={team.id}
          currentLeagueId={team.leagueId}
        />
        <UploadTeamUpdateModal
          open={modalOpen === 'uploadUpdate'}
          onOpenChange={(open) => !open && setModalOpen(null)}
          currentTeamId={team.id}
          currentLeagueId={team.leagueId}
          onSuccess={(title, message) => setRecentTeamUpdates([{ title, message, timestamp: 'Just now' }, ...recentTeamUpdates])}
        />
        <AddSupportNeedModal
          open={modalOpen === 'addSupportNeed'}
          onOpenChange={(open) => !open && setModalOpen(null)}
          currentTeamId={team.id}
          onSuccess={(athleteName, type, amount) => setSupportNeeds([{ athleteName, type, amount }, ...supportNeeds])}
        />
        <DetailDrawer
          open={modalOpen === 'editProfile'}
          onOpenChange={(open) => !open && setModalOpen(null)}
          title="Edit Team Profile"
          description="Demo edits update the visible profile completeness and public status on this page."
        >
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold text-slate-300">
                Team display name
                <input
                  defaultValue={team.name}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-[var(--goal-emerald)]"
                />
              </label>
              <label className="text-sm font-bold text-slate-300">
                Coach or contact
                <input
                  defaultValue={team.teamAdminName ?? 'Team Manager'}
                  className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-[var(--goal-emerald)]"
                />
              </label>
            </div>
            <label className="text-sm font-bold text-slate-300">
              Public team description
              <textarea
                defaultValue={team.description}
                rows={4}
                className="mt-2 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-white outline-none focus:border-[var(--goal-emerald)]"
              />
            </label>
            <DataCard>
              <StatusExplainerChip domain="team" status={profileUpdated ? 'Verified' : 'Needs Evidence'} showDetail />
            </DataCard>
            <Button className="w-full" onClick={handleSaveProfile}>Save Team Profile Changes</Button>
          </div>
        </DetailDrawer>
        <DetailDrawer
          open={Boolean(drawer)}
          onOpenChange={(open) => !open && setDrawer(null)}
          title={drawer?.title ?? ''}
          description={drawer?.description}
        >
          {drawer?.body}
        </DetailDrawer>
      </PageContainer>
    </RoleGuard>
  );
}

export default function TeamAdminPage() {
  return <Suspense><TeamAdminContent /></Suspense>;
}
