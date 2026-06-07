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
import { AddAthleteModal, SubmitResultModal } from '@/components/modals/demo-modals';

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

  const [activeTab, setActiveTab] = useState<Tab>('Overview');
  const [modalOpen, setModalOpen] = useState<string | null>(null);
  const { teams, matches, athletes } = useGoalPlaceData();

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
    toast.success('Verification requested successfully.');
  };

  const handleUploadUpdate = () => {
    toast.success('Team update published to feed.');
  };

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
                    <Button variant="outline" onClick={handleUploadUpdate}><ListViewIcon className="mr-2 size-4" /> Upload Update</Button>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-6">
                  <h2 className="mb-4 font-display text-lg font-black text-white">Pending Tasks</h2>
                  <ul className="space-y-3">
                    <li className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
                      <span className="text-slate-300">Submit result for recent match</span>
                      <Button size="sm" variant="ghost" className="h-8 text-[var(--goal-mint)]">Submit</Button>
                    </li>
                    <li className="flex items-center justify-between rounded-lg bg-white/5 p-3 text-sm">
                      <span className="text-slate-300">3 athletes missing profile photos</span>
                      <Button size="sm" variant="ghost" className="h-8 text-[var(--goal-mint)]">Update</Button>
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
                <div className="space-y-4">
                  {teamMatches.slice(0, 3).map(match => (
                    <div key={match.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/5 p-4">
                      <div>
                        <div className="text-xs font-bold text-slate-400">{new Date(match.date || new Date()).toLocaleDateString()}</div>
                        <div className="mt-1 font-medium text-white">{getTeamName(match.homeTeamId)} vs {getTeamName(match.awayTeamId)}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${match.status === 'verified' ? 'bg-[var(--goal-emerald)]/10 text-[var(--goal-mint)]' : 'bg-orange-500/10 text-orange-400'}`}>
                          {match.status}
                        </span>
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
                <Button onClick={() => mockAction('Add Support Need')}><PlusSignIcon className="mr-2 size-4" /> Request Support</Button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <h3 className="font-bold text-white">Highlight Upload Placeholders</h3>
                  <p className="mt-2 text-sm text-slate-400">Ensure athletes have match footage linked to their profile.</p>
                  <Button variant="outline" className="mt-4 w-full" onClick={handleUploadUpdate}>Upload Highlight</Button>
                </div>
                <div className="rounded-xl border border-white/10 bg-[#0A0D14] p-5">
                  <h3 className="font-bold text-white">Verification Requests</h3>
                  <p className="mt-2 text-sm text-slate-400">Request league admin verification for athlete achievements.</p>
                  <Button variant="outline" className="mt-4 w-full" onClick={handleRequestVerification}>Request Verification</Button>
                </div>
              </div>
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
        <AddAthleteModal open={modalOpen === 'addAthlete'} onOpenChange={(open) => !open && setModalOpen(null)} />
        <SubmitResultModal open={modalOpen === 'submitResult'} onOpenChange={(open) => !open && setModalOpen(null)} />
      </PageContainer>
    </RoleGuard>
  );
}

export default function TeamAdminPage() {
  return <Suspense><TeamAdminContent /></Suspense>;
}
