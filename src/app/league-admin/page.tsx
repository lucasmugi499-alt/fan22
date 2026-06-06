'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Building03Icon, Calendar01Icon, CheckmarkCircle01Icon, Task01Icon, Flag01Icon, Coins01Icon, UserGroupIcon, Comment01Icon, PlusSignCircleIcon, Settings01Icon, SecurityCheckIcon, UserAdd01Icon } from 'hugeicons-react';
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
import { DataCard, ImpactStatCard, PageContainer, SectionHeader, SportBadge, TabStrip } from '@/components/ui/product';
import { dataProvider } from '@/data/dataProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { Match, VerificationStatus } from '@/types';

function normalizeVerificationStatus(status: VerificationStatus): VerificationStatus {
  if (status === 'Verified') return 'verified';
  if (status === 'Rejected') return 'rejected';
  if (status === 'Disputed') return 'disputed';
  return status;
}

export default function LeagueAdminPage() {
  return (
    <RoleGuard allowedRoles={['league_admin', 'platform_admin', 'super_admin']}>
      <LeagueAdminDashboard />
    </RoleGuard>
  );
}

function LeagueAdminDashboard() {
  const { leagues, teams, athletes, matches, challenges } = useGoalPlaceData();
  const [selectedLeagueId, setSelectedLeagueId] = useState(leagues[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState('Overview');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [postOpen, setPostOpen] = useState(false);
  
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

  const updateMatch = async (match: Match, status: VerificationStatus) => {
    setPendingId(match.id);
    try {
      await dataProvider.updateMatchVerification(match.id, normalizeVerificationStatus(status));
      toast.success(`Match marked ${status.toString().toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification update failed');
    } finally {
      setPendingId(null);
    }
  };

  const updateChallenge = async (challengeId: string, status: VerificationStatus) => {
    setPendingId(challengeId);
    try {
      await dataProvider.updateChallengeVerification(challengeId, normalizeVerificationStatus(status));
      toast.success(`Challenge marked ${status.toString().toLowerCase()}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Challenge update failed');
    } finally {
      setPendingId(null);
    }
  };

  const demoAction = (message: string, nextTab?: string) => {
    if (nextTab) setActiveTab(nextTab);
    toast.success(message);
  };

  if (!selectedLeague) {
    return (
      <PageContainer compact>
        <div className="glass-panel rounded-xl p-8 text-center text-slate-300">No leagues found.</div>
      </PageContainer>
    );
  }

  const pendingMatches = leagueMatches.filter(
    (match) => match.verificationStatus === 'Pending' || match.verificationStatus === 'pending' || match.verificationStatus === 'disputed'
  );
  const pendingChallenges = leagueChallenges.filter(
    (challenge) => challenge.verificationStatus === 'Pending' || challenge.verificationStatus === 'pending' || challenge.verificationStatus === 'disputed'
  );

  const tabs = [
    'Overview', 'League Profile', 'Teams', 'Athletes', 'Fixtures', 'Results', 
    'Verification Queue', 'Challenges', 'Standings', 'GoalPlace Index', 
    'Feed Posts', 'Disputes', 'Support/Payout Review', 'Sponsor Visibility', 'Settings'
  ];

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
      <div className="border-b border-white/10 bg-[#0A0D14] px-4 py-6 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <SportBadge sport={selectedLeague.sport} />
              <LeagueStatusBadge status={selectedLeague.status} />
            </div>
            <h1 className="font-display text-3xl font-black text-white md:text-4xl">League Admin Dashboard</h1>
          </div>
          <label className="grid min-w-64 gap-2">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Select League</span>
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
        </div>
        
        <TabStrip tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      </div>

      <div className="flex-1 overflow-y-auto bg-[#05070A] p-4 md:p-8">
        <div className="mx-auto max-w-7xl space-y-8">
          <section className="rounded-xl border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/8 p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <p className="max-w-3xl text-sm leading-6 text-slate-200">
                League standings are based only on match results. Paid plans never affect sporting rankings. GoalPlace Index is separate and measures verification, activity, engagement, and operational quality.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => demoAction('Demo fixture composer opened.', 'Fixtures')}>
                  <PlusSignCircleIcon className="size-4" />
                  Create Fixture
                </Button>
                <Button size="sm" variant="outline" onClick={() => demoAction('Team setup section opened.', 'Teams')}>
                  <UserAdd01Icon className="size-4" />
                  Add Team
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPostOpen(true)}>
                  <Comment01Icon className="size-4" />
                  Create League Post
                </Button>
                <Button size="sm" variant="gold" onClick={() => demoAction('Partner status request saved in demo mode.', 'Sponsor Visibility')}>
                  <UserGroupIcon className="size-4" />
                  Request Partner Status
                </Button>
              </div>
            </div>
          </section>
          
          {activeTab === 'Overview' && (
            <>
              <section className="grid gap-3 md:grid-cols-4">
                <ImpactStatCard label="Teams" value={String(leagueTeams.length)} icon={Users} />
                <ImpactStatCard label="Challenges" value={String(leagueChallenges.length)} icon={Calendar01Icon} tone="gold" />
                <ImpactStatCard label="Pending matches" value={String(pendingMatches.length)} icon={Task01Icon} tone="blue" />
                <ImpactStatCard label="GoalPlace Index" value={String(selectedLeague.goalPlaceIndex)} icon={SecurityCheckIcon} tone="orange" />
              </section>

              <section>
                <SectionHeader eyebrow="League Onboarding" title="Verification model" />
                <LeagueStatusRoadmap activeStatus={selectedLeague.status} />
              </section>

              <section className="grid gap-4 lg:grid-cols-3">
                {[
                  ['Create Fixture', 'Add the next scheduled match and assign participating teams.', Calendar01Icon, 'Fixtures'],
                  ['Verification Queue', 'Review match results and performance challenges awaiting approval.', Task01Icon, 'Verification Queue'],
                  ['Payout Review', 'Inspect support releases connected to verified challenges.', Coins01Icon, 'Payout Review'],
                ].map(([title, detail, Icon, tab]) => {
                  const ActionIcon = Icon as typeof Calendar01Icon;
                  return (
                    <button
                      key={title as string}
                      className="rounded-xl border border-white/10 bg-white/5 p-5 text-left transition-colors hover:border-[var(--goal-emerald)]/35 hover:bg-[var(--goal-emerald)]/8"
                      onClick={() => setActiveTab(tab as string)}
                    >
                      <ActionIcon className="mb-4 size-6 text-[var(--goal-mint)]" />
                      <h3 className="font-display text-xl font-black text-white">{title as string}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{detail as string}</p>
                    </button>
                  );
                })}
              </section>
            </>
          )}

          {activeTab === 'League Profile' && (
            <section className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <SectionHeader eyebrow="Profile" title={selectedLeague.name} className="mb-4" />
                <div className="space-y-3 text-sm text-slate-300">
                  <p>{selectedLeague.description}</p>
                  <p><span className="font-bold text-white">Season:</span> {selectedLeague.season}</p>
                  <p><span className="font-bold text-white">City:</span> {selectedLeague.city}</p>
                  <p><span className="font-bold text-white">Supporters:</span> {selectedLeague.supportersCount}</p>
                </div>
                <Button className="mt-5" variant="outline" onClick={() => demoAction('League profile update saved in demo mode.')}>
                  Save Profile
                </Button>
              </div>
              <LeagueStatusRoadmap activeStatus={selectedLeague.status} />
            </section>
          )}

          {activeTab === 'Teams' && (
            <section>
              <SectionHeader
                eyebrow="Teams"
                title="League teams"
                action={<Button onClick={() => demoAction('Demo team invitation created.')}>Add Team</Button>}
              />
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                {leagueTeams.map((team) => (
                  <DataCard key={team.id}>
                    <Building03Icon className="mb-4 size-5 text-[var(--goal-mint)]" />
                    <h3 className="font-display text-lg font-black text-white">{team.name}</h3>
                    <p className="mt-1 text-sm text-slate-400">{team.city}</p>
                    <p className="mt-3 text-xs font-bold text-slate-300">{team.wins}W {team.draws ?? 0}D {team.losses}L</p>
                  </DataCard>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'Athletes' && (
            <section>
              <SectionHeader 
                eyebrow="Athletes" 
                title="Athlete roster" 
                action={<Button onClick={() => demoAction('Demo athlete addition initiated.')}>Add Athlete</Button>}
              />
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {leagueAthletes.slice(0, 12).map((athlete) => (
                  <DataCard key={athlete.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h3 className="font-display text-lg font-black text-white">{athlete.name}</h3>
                      <p className="mt-1 text-sm text-slate-400">{athlete.position} - {athlete.city}</p>
                    </div>
                    <p className={`text-xs font-bold px-2 py-1 rounded bg-white/10 uppercase tracking-widest ${athlete.verified ? 'text-[var(--goal-mint)]' : 'text-slate-300'}`}>{athlete.verificationStatus}</p>
                  </DataCard>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'Fixtures' && (
            <section>
              <SectionHeader
                eyebrow="Fixtures"
                title="Fixture planner"
                description="Create fixtures, assign venues, and prepare verification rules before matchday."
                action={<Button onClick={() => demoAction('Demo fixture draft created.')}>Create Fixture</Button>}
              />
              <div className="space-y-3">
                {leagueMatches.map((match) => {
                  const homeTeam = teams.find(t => t.id === match.homeTeamId);
                  const awayTeam = teams.find(t => t.id === match.awayTeamId);
                  return (
                    <DataCard key={match.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="font-display text-lg font-black text-white">{homeTeam?.name ?? match.homeTeamId} <span className="text-slate-500 font-medium">vs</span> {awayTeam?.name ?? match.awayTeamId}</p>
                        <p className="mt-1 text-sm text-slate-400">{match.venue} • {match.city} • <span className="capitalize">{match.status}</span></p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => demoAction('Fixture settings opened')}>Edit Fixture</Button>
                    </DataCard>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === 'Results' && (
            <section>
              <SectionHeader 
                eyebrow="Results" 
                title="Result review" 
                action={<Button onClick={() => demoAction('Demo result submission initiated.')}>Submit Result</Button>}
              />
              <div className="space-y-3">
                {leagueMatches.map((match) => {
                  const homeTeam = teams.find(t => t.id === match.homeTeamId);
                  const awayTeam = teams.find(t => t.id === match.awayTeamId);
                  return (
                    <DataCard key={match.id} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-display text-lg font-black text-white">{homeTeam?.name ?? match.homeTeamId} <span className="text-[var(--goal-emerald)]">{match.score.home ?? '-'}</span> - <span className="text-[var(--goal-emerald)]">{match.score.away ?? '-'}</span> {awayTeam?.name ?? match.awayTeamId}</p>
                        <p className="mt-1 text-sm text-slate-400">{match.venue} | <span className="capitalize text-xs font-bold text-[var(--goal-mint)]">{match.verificationStatus}</span></p>
                      </div>
                      <Button size="sm" onClick={() => updateMatch(match, 'verified')} disabled={pendingId === match.id}>
                        Verify Result
                      </Button>
                    </DataCard>
                  );
                })}
              </div>
            </section>
          )}

          {activeTab === 'Standings' && (
            <section className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
              <div>
                <SectionHeader
                  eyebrow="League Standings"
                  title="Match-result table"
                  description="League standings are based only on match results. Paid tools never affect sporting rankings."
                />
                <LeagueStandingsTable standings={standings} />
                <LeagueIntegrityNote className="mt-4" />
              </div>
            </section>
          )}

          {activeTab === 'GoalPlace Index' && (
            <section className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
              <div>
                <SectionHeader
                  eyebrow="GoalPlace Index"
                  title="Platform quality index"
                  description="A separate rating based on compliance, transparency, and organizational health. This does not affect sporting standing."
                />
                <GoalPlaceIndexPanel league={selectedLeague} />
              </div>
            </section>
          )}

          {activeTab === 'Verification Queue' && (
            <section className="grid gap-8 xl:grid-cols-2">
              <div>
                <SectionHeader eyebrow="Verification" title="Match review queue" />
                <div className="space-y-3">
                  {pendingMatches.map((match) => (
                    <div key={match.id} className="glass-panel rounded-xl p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-display text-lg font-black text-white">{match.venue}</p>
                          <p className="mt-1 text-sm text-slate-400">{match.city} - {match.status}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => updateMatch(match, 'verified')} disabled={pendingId === match.id}>
                            <CheckmarkCircle01Icon className="size-4" />
                            Verify
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => updateMatch(match, 'disputed')} disabled={pendingId === match.id}>
                            Dispute
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {!pendingMatches.length && (
                    <div className="glass-panel rounded-xl p-5 text-sm text-slate-300">No match reviews pending.</div>
                  )}
                </div>
              </div>

              <div>
                <SectionHeader eyebrow="Challenges" title="Performance review queue" />
                <div className="space-y-3">
                  {pendingChallenges.map((challenge) => (
                    <div key={challenge.id} className="glass-panel rounded-xl p-4">
                      <p className="font-display text-lg font-black text-white">{challenge.targetDescription ?? challenge.description}</p>
                      <p className="mt-1 text-sm text-slate-400">{challenge.status} - {challenge.verificationStatus}</p>
                      <div className="mt-3 flex gap-2">
                        <Button size="sm" onClick={() => updateChallenge(challenge.id, 'verified')} disabled={pendingId === challenge.id}>
                          Verify
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => updateChallenge(challenge.id, 'rejected')} disabled={pendingId === challenge.id}>
                          Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                  {!pendingChallenges.length && (
                    <div className="glass-panel rounded-xl p-5 text-sm text-slate-300">No challenge reviews pending.</div>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeTab === 'Challenges' && (
            <section>
              <SectionHeader 
                eyebrow="Challenges" 
                title="Performance challenges" 
                action={<Button onClick={() => demoAction('Demo challenge creation initiated.')}>Create Challenge</Button>}
              />
              <div className="grid gap-3 md:grid-cols-2">
                {leagueChallenges.map((challenge) => (
                  <div key={challenge.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <h3 className="font-display text-lg font-black text-white">{challenge.targetDescription ?? challenge.description}</h3>
                    <p className="mt-1 text-sm text-slate-400">{challenge.status} - {challenge.verificationStatus}</p>
                    <Button className="mt-4" size="sm" onClick={() => updateChallenge(challenge.id, 'verified')} disabled={pendingId === challenge.id}>
                      Verify Challenge
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'Feed Posts' && (
            <section className="rounded-xl border border-white/10 bg-white/5 p-5">
              <SectionHeader
                eyebrow="Feed Posts"
                title="League communications"
                description="Publish fixture notes, verified result updates, sponsor moments, and athlete announcements."
                action={<Button onClick={() => setPostOpen(true)}>Create League Post</Button>}
              />
              <p className="text-sm leading-6 text-slate-300">Demo mode uses the shared post composer and records a provider-backed post action.</p>
            </section>
          )}

          {activeTab === 'Disputes' && (
            <section className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((item) => (
                <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-5">
                  <Flag01Icon className="mb-4 size-6 text-[var(--goal-gold)]" />
                  <h3 className="font-display text-xl font-black text-white">Result dispute #{item}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">Review notes, media, and admin response before closing the dispute.</p>
                  <Button className="mt-4" variant="outline" onClick={() => demoAction(`Dispute #${item} marked reviewed.`)}>
                    Review Dispute
                  </Button>
                </div>
              ))}
            </section>
          )}

          {activeTab === 'Support/Payout Review' && (
            <section className="rounded-xl border border-white/10 bg-white/5 p-5">
              <SectionHeader eyebrow="Support/Payout Review" title="Verified challenge releases" />
              <div className="grid gap-3 md:grid-cols-3">
                {leagueChallenges.slice(0, 3).map((challenge) => (
                  <div key={challenge.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <Coins01Icon className="mb-4 size-5 text-[var(--goal-gold)]" />
                    <p className="font-display text-lg font-black text-white">{challenge.totalPledged.toLocaleString()} UGX</p>
                    <p className="mt-1 text-sm text-slate-400">{challenge.targetDescription ?? challenge.description}</p>
                    <Button className="mt-4" size="sm" variant="gold" onClick={() => demoAction('Payout review approved in demo mode.')}>
                      Review Payout
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === 'Sponsor Visibility' && (
            <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                <UserGroupIcon className="mb-4 size-6 text-[var(--goal-gold)]" />
                <h3 className="font-display text-2xl font-black text-white">Partner league tools</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">Sponsor reporting, analytics, and priority support become available after partner review.</p>
                <Button className="mt-5" variant="gold" onClick={() => demoAction('Partner status request submitted.')}>
                  Request Partner Status
                </Button>
              </div>
              <GoalPlaceIndexPanel league={selectedLeague} />
            </section>
          )}

          {activeTab === 'Settings' && (
            <section className="rounded-xl border border-white/10 bg-white/5 p-5">
              <Settings01Icon className="mb-4 size-6 text-[var(--goal-mint)]" />
              <h3 className="font-display text-2xl font-black text-white">League settings</h3>
              <p className="mt-3 text-sm leading-6 text-slate-300">Configure moderation, verification rules, admin access, and public visibility.</p>
              <Button className="mt-5" variant="outline" onClick={() => demoAction('League settings saved in demo mode.')}>
                Save Settings
              </Button>
            </section>
          )}

        </div>
      </div>
      <CreatePostModal open={postOpen} onOpenChange={setPostOpen} />
    </div>
  );
}
