'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { PageContainer, SectionHeader } from '@/components/ui/product';
import { Button } from '@/components/ui/button';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { 
  Building03Icon, 
  Calendar01Icon, 
  CheckmarkBadge01Icon, 
  Settings01Icon, 
  UserGroupIcon, 
  PlusSignIcon,
  ListViewIcon,
  UserIcon,
  SecurityCheckIcon
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

  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const [verificationRequested, setVerificationRequested] = useState(false);
  const [recentTeamUpdates, setRecentTeamUpdates] = useState<{title: string, message: string, timestamp: string}[]>([]);
  const [supportNeeds, setSupportNeeds] = useState<{athleteName: string, type: string, amount: string}[]>([]);
  const { teams, matches, athletes } = useGoalPlaceData();

  useEffect(() => {
    if (queryTab) {
      const match = TABS.find(t => t.id.toLowerCase().replace(/[^a-z0-9]/g, '') === queryTab.toLowerCase().replace(/[^a-z0-9]/g, ''));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (match) setActiveTab(match.id);
    }
  }, [queryTab]);

  const availableTeams = queryLeagueId ? teams.filter(t => t.leagueId === queryLeagueId) : teams;
  const selectedTeamId = queryTeamId || availableTeams[0]?.id || '';

  const team = teams.find(t => t.id === selectedTeamId) || null;
  const teamMatches = matches.filter(m => m.homeTeamId === team?.id || m.awayTeamId === team?.id);
  const teamAthletes = athletes.filter(a => a.teamId === team?.id);

  const getTeamName = (id: string) => teams.find(t => t.id === id)?.name || id;

  const mockAction = (actionName: string) => {
    toast.success(`${actionName} modal opened (Demo)`);
  };

  const handleRequestVerification = () => {
    setVerificationRequested(true);
    toast.success('Verification requested successfully.');
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
                  <span className="flex items-center gap-1 text-[var(--goal-mint)]">
                    <CheckmarkBadge01Icon className="size-4" /> Verified
                  </span>
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
        <div className="mb-8 flex space-x-1 overflow-x-auto rounded-xl bg-black/40 p-1 backdrop-blur-md">
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

        {/* Tab Content */}
        <div className="min-h-[50vh]">
          {/* OVERVIEW */}
          {activeTab === 'Overview' && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <div className="text-sm font-medium text-slate-400">Roster Completeness</div>
                  <div className="mt-2 text-2xl font-black text-white">{team?.rosterCompleteness || 0}%</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <div className="text-sm font-medium text-slate-400">Pending Submissions</div>
                  <div className="mt-2 text-2xl font-black text-white">{team?.pendingSubmissions || 0}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <div className="text-sm font-medium text-slate-400">Total Support Pool</div>
                  <div className="mt-2 text-2xl font-black text-[var(--goal-mint)]">UGX {team?.totalSupport?.toLocaleString() || 0}</div>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <div className="text-sm font-medium text-slate-400">Verification Status</div>
                  <div className="mt-2 text-lg font-black text-white">{team?.verificationStatus || 'Verified'}</div>
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-6">
                  <h2 className="mb-4 font-display text-lg font-black text-white">Quick Actions</h2>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => setModalOpen('addAthlete')}><PlusSignIcon className="mr-2 size-4" /> Add Athlete</Button>
                    <Button variant="outline" onClick={() => setModalOpen('submitResult')}><Trophy className="mr-2 size-4" /> Submit Result</Button>
                    <Button variant="outline" onClick={() => setModalOpen('uploadUpdate')}><ListViewIcon className="mr-2 size-4" /> Upload Update</Button>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-6">
                  <h2 className="mb-4 font-display text-lg font-black text-white">Pending Tasks</h2>
                  <ul className="space-y-3">
                    <li className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
                      <span className="text-slate-300">Submit result for recent match</span>
                      <Button size="sm" variant="ghost" className="h-8 text-[var(--goal-mint)]" onClick={() => setModalOpen('submitResult')}>Submit</Button>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
                      <span className="text-slate-300">3 athletes missing profile photos</span>
                      <Button size="sm" variant="ghost" className="h-8 text-[var(--goal-mint)]" onClick={() => setActiveTab('Athlete Updates')}>Update</Button>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
                      <span className="text-slate-300">Roster incomplete</span>
                      <Button size="sm" variant="ghost" className="h-8 text-[var(--goal-mint)]" onClick={() => setActiveTab('Roster')}>Complete</Button>
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
                <Button onClick={() => setModalOpen('addAthlete')}><PlusSignIcon className="mr-2 size-4" /> Add Athlete</Button>
              </div>
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
                          <td className="px-6 py-4 font-medium text-white">{athlete.name}</td>
                          <td className="px-6 py-4">{athlete.position}</td>
                          <td className="px-6 py-4">
                            <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                              Verified
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <Button variant="ghost" size="sm" className="h-8 text-xs">Edit</Button>
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
                        <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-400">
                          Verified
                        </span>
                      </div>
                      <div className="mt-3 text-right">
                        <Button variant="ghost" size="sm" className="h-8 text-xs w-full border border-white/10">Edit Profile</Button>
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
                <Button onClick={() => setModalOpen('submitResult')}><Trophy className="mr-2 size-4" /> Submit Result</Button>
              </div>
              <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-6">
                <p className="text-sm text-slate-400 mb-4">
                  Note: Team Admins can submit match results, but final verification is performed by League Admins.
                </p>
                <div className="space-y-4 md:space-y-0 md:grid md:gap-4 md:grid-cols-2">
                  {teamMatches.slice(0, 3).map(match => (
                    <div key={match.id} className="flex flex-col md:flex-row md:items-center justify-between rounded-lg border border-white/5 bg-white/5 p-4">
                      <div className="mb-3 md:mb-0">
                        <div className="text-xs font-bold text-slate-400">{new Date(match.date || new Date()).toLocaleDateString()}</div>
                        <div className="mt-1 font-medium text-white">{getTeamName(match.homeTeamId)} vs {getTeamName(match.awayTeamId)}</div>
                      </div>
                      <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[10px] md:text-xs font-bold ${match.status === 'verified' ? 'bg-[var(--goal-emerald)]/10 text-[var(--goal-mint)]' : 'bg-orange-500/10 text-orange-400'}`}>
                          {match.status}
                        </span>
                        <Button variant="ghost" size="sm" className="h-8 text-xs border border-white/10 md:border-0 md:hidden">Details</Button>
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
                <Button onClick={() => setModalOpen('addSupportNeed')}><PlusSignIcon className="mr-2 size-4" /> Request Support</Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <h3 className="font-bold text-white">Highlight Upload Placeholders</h3>
                  <p className="mt-2 text-sm text-slate-400">Ensure athletes have match footage linked to their profile.</p>
                  <Button variant="outline" className="mt-4 w-full" onClick={() => mockAction('Upload Highlight')}>Upload Highlight</Button>
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
                    <Button variant="outline" className="mt-4 w-full" onClick={handleRequestVerification}>Request Verification</Button>
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
                              <span className="text-[10px] uppercase text-slate-500 bg-white/10 px-2 py-0.5 rounded-full">Published Demo</span>
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
                    <div className="mt-1 text-white font-medium">{team?.publicProfileCompleteness || 0}%</div>
                  </div>
                </div>
                <div className="mt-8 flex gap-4">
                  <Button onClick={() => mockAction('Edit Team Profile')}>Edit Profile</Button>
                  <Button variant="outline" onClick={() => router.push(`/teams/${team?.id}`)}>View Public Team Page</Button>
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
      </PageContainer>
    </RoleGuard>
  );
}

export default function TeamAdminPage() {
  return <Suspense><TeamAdminContent /></Suspense>;
}
