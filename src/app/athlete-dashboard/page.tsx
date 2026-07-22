'use client';

import React, { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserGroupIcon, SecurityCheckIcon, UserIcon, Upload01Icon, Calendar01Icon, Video01Icon, Activity01Icon, PencilEdit01Icon, LockKeyIcon, Notification01Icon } from 'hugeicons-react';
import { Trophy } from '@phosphor-icons/react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { CreatePostModal } from '@/components/modals/app-modals';
import { DataCard, DetailDrawer, EmptyState, ImpactStatCard, SportBadge, StatusBadge, StatusExplainerChip, TabStrip, VerificationStatusCard } from '@/components/ui/product';
import { Button } from '@/components/ui/button';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { formatUGX } from '@/lib/sportThemes';
import { toast } from 'sonner';

export default function AthleteDashboardPage() {
  return (
    <RoleGuard allowedRoles={['athlete', 'platform_admin', 'super_admin']}>
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Loading athlete dashboard...</div>}>
        <AthleteDashboard />
      </Suspense>
    </RoleGuard>
  );
}

function AthleteDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { athletes, challenges, matches } = useGoalPlaceData();
  const athlete = athletes[0];
  const athleteChallenges = athlete ? challenges.filter((challenge) => challenge.athleteId === athlete.id) : [];
  const upcomingMatches = matches.filter(match => match.status === 'scheduled').slice(0, 3);
  const nextMatch = upcomingMatches[0];
  const profileCompleteness = athlete?.verified ? 92 : 74;
  const verificationSteps: Array<[string, string]> = [
    ['Identity', 'Complete'],
    ['League roster', athlete?.verified ? 'Complete' : 'Reviewing'],
    ['Media review', 'Pending upload'],
  ];
  const statRows = Object.entries(athlete?.stats ?? {}).slice(0, 4);
  
  const tabs = useMemo(() => ['Overview', 'Profile', 'Challenges', 'Matches', 'Media', 'Supporters', 'Settings'], []);
  const routeTab = searchParams?.get('tab');
  const routeKey = searchParams?.toString() ?? '';
  const [localTab, setLocalTab] = useState<{ routeKey: string; tab: string | null }>({ routeKey, tab: null });
  const activeTab = localTab.routeKey === routeKey && localTab.tab
    ? localTab.tab
    : routeTab && tabs.includes(routeTab)
      ? routeTab
      : 'Overview';
  const setActiveTab = (tab: string) => setLocalTab({ routeKey, tab });
  const [postOpen, setPostOpen] = useState(false);
  const [drawer, setDrawer] = useState<{ title: string; description: string; body: React.ReactNode } | null>(null);

  const demoAction = (action: string, nextTab?: string) => {
    if (nextTab) setActiveTab(nextTab);
    toast.success(`${action} successful in demo mode.`);
  };

  const openDrawer = (title: string, description: string, fields: [string, React.ReactNode][]) => {
    setDrawer({
      title,
      description,
      body: (
        <div className="space-y-4">
          {fields.map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
              <p className="mt-1 text-sm font-bold text-slate-200">{value}</p>
            </div>
          ))}
          <Button className="w-full" onClick={() => { setDrawer(null); toast.success(`${title} recorded in demo mode.`); }}>Confirm Demo Action</Button>
        </div>
      ),
    });
  };

  return (
      <div className="min-h-[calc(100dvh-4rem)] bg-[#05070A]">
        <div className="border-b border-white/10 bg-[#0A0D14] px-4 py-6 md:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {athlete && <SportBadge sport={athlete.sport} />}
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white">
                  Profile: 85% Complete
                </div>
              </div>
              <h1 className="font-display text-3xl font-black text-white md:text-4xl">{athlete?.name ?? 'Athlete Command Center'}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => openDrawer('Publish Highlight', 'Upload placeholder for match clips and scouting media.', [['Media type', 'Video highlight'], ['Match', upcomingMatches[0]?.venue ?? 'Next fixture'], ['Visibility', 'Public after moderation']])}>
                <Upload01Icon className="size-4" /> Publish Highlight
              </Button>
              <Button variant="outline" onClick={() => demoAction('Verification request submitted')}>
                <SecurityCheckIcon className="size-4" /> Request Athlete Verification
              </Button>
              <Button variant="outline" onClick={() => setPostOpen(true)}>
                <Video01Icon className="size-4" /> Create Athlete Post
              </Button>
              <Button variant="outline" onClick={() => setActiveTab('Supporters')}>
                <UserGroupIcon className="size-4" /> Open Supporters
              </Button>
              <Button variant="outline" onClick={() => setActiveTab('Challenges')}>
                <Trophy className="size-4" /> Open Challenges
              </Button>
              <Button variant="gold" onClick={() => athlete ? router.push(`/athletes/${athlete.id}`) : demoAction('Public profile opened')}>
                Preview Public Profile
              </Button>
            </div>
          </div>
          
          <TabStrip tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        <div className="p-5 md:p-8 xl:px-16">
          <div className="mx-auto max-w-7xl space-y-8">
            
            {activeTab === 'Overview' && (
              <>
                <section className="grid gap-3 md:grid-cols-4">
                  <ImpactStatCard label="Total Support" value={formatUGX(athlete?.totalEarnings ?? athlete?.totalSupport ?? 0)} icon={UserGroupIcon} />
                  <ImpactStatCard label="Supporters" value={String(athlete?.supportersCount ?? 0)} icon={UserIcon} tone="gold" />
                  <ImpactStatCard label="Active Challenges" value={String(athleteChallenges.length)} icon={Trophy} tone="orange" />
                  <ImpactStatCard label="Verification" value={athlete?.verified ? 'Verified' : 'Pending'} icon={SecurityCheckIcon} tone="blue" />
                </section>
                
                <section className="grid gap-4 lg:grid-cols-3">
                  <VerificationStatusCard
                    title="Athlete Portfolio Score"
                    progress={profileCompleteness}
                    steps={verificationSteps}
                    status={<StatusBadge tone={athlete?.verified ? 'success' : 'warning'}>{athlete?.verified ? 'Verified' : 'Pending Review'}</StatusBadge>}
                    action={<Button className="w-full" variant="gold" onClick={() => athlete ? router.push(`/athletes/${athlete.id}`) : demoAction('Public profile opened')}>Preview Public Profile</Button>}
                  />

                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Calendar01Icon className="mb-4 size-6 text-[var(--goal-mint)]" />
                    <h3 className="font-display text-xl font-black text-white">Next Match</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{nextMatch ? `${new Date(nextMatch.scheduledAt).toLocaleDateString()} at ${nextMatch.venue}` : 'No upcoming fixture assigned yet.'}</p>
                    <Button className="mt-4" variant="outline" onClick={() => setActiveTab('Matches')}>View Match Schedule</Button>
                  </div>
                  
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Activity01Icon className="mb-4 size-6 text-[var(--goal-gold)]" />
                    <h3 className="font-display text-xl font-black text-white">Supporter Comments</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">&quot;The work rate showed today. Keep building toward the next fixture.&quot;</p>
                    <Button className="mt-4" variant="outline" onClick={() => demoAction('Support feed opened')}>Open Support Activity</Button>
                  </div>
                  
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Video01Icon className="mb-4 size-6 text-blue-400" />
                    <h3 className="font-display text-xl font-black text-white">Highlight Activity</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Upload your latest match highlights to attract support.</p>
                    <Button className="mt-4" variant="outline" onClick={() => openDrawer('Publish Highlight', 'Demo upload placeholder for highlight clips and images.', [['Accepted media', 'Images and video clips'], ['Moderation', 'League review before public visibility']])}>Publish Highlight</Button>
                  </div>
                </section>

                <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
                  <DataCard>
                    <h3 className="font-display text-xl font-black text-white">Sport Stats</h3>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      {(statRows.length ? statRows : [['Appearances', 8], ['Goals', 3], ['Assists', 2], ['Minutes', 640]]).map(([label, value]) => (
                        <div key={String(label)} className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{String(label)}</p>
                          <p className="mt-1 font-display text-2xl font-black text-white">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  </DataCard>
                  <DataCard>
                    <h3 className="font-display text-xl font-black text-white">Active Challenges</h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {athleteChallenges.slice(0, 2).length > 0 ? athleteChallenges.slice(0, 2).map((challenge) => (
                        <div key={challenge.id} className="rounded-lg border border-white/10 bg-black/20 p-3">
                          <p className="font-bold text-white">{challenge.targetDescription ?? challenge.description}</p>
                          <p className="mt-1 text-sm text-slate-400">{formatUGX(challenge.totalPledged)} pledged • {challenge.supportersCount} supporters</p>
                        </div>
                      )) : (
                        <EmptyState title="No active challenges yet" description="Propose a verified performance challenge so supporters can back a clear next goal." />
                      )}
                    </div>
                  </DataCard>
                </section>
              </>
            )}
            
            {activeTab === 'Profile' && (
              <div className="grid gap-6 lg:grid-cols-2">
                <DataCard>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-xl font-black text-white">Personal Information</h3>
                    <Button variant="outline" size="sm" onClick={() => openDrawer('Edit Personal Info', 'Update public athlete identity and contact information.', [['Name', athlete?.name ?? 'Athlete'], ['Location', `${athlete?.city}, ${athlete?.country}`], ['Bio', athlete?.bio ?? 'Profile bio']])}><PencilEdit01Icon className="size-4" /> Edit Personal Info</Button>
                  </div>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between border-b border-white/10 pb-2"><span className="text-slate-400">Full Name</span><span className="text-white font-medium">{athlete?.name}</span></div>
                    <div className="flex justify-between border-b border-white/10 pb-2"><span className="text-slate-400">Location</span><span className="text-white font-medium">{athlete?.city}, {athlete?.country}</span></div>
                    <div className="flex justify-between border-b border-white/10 pb-2"><span className="text-slate-400">Sport</span><span className="text-white font-medium capitalize">{athlete?.sport}</span></div>
                    <div className="flex justify-between pb-2"><span className="text-slate-400">Bio</span><span className="text-white font-medium text-right max-w-xs">{athlete?.bio ?? 'Passionate athlete ready for the next challenge.'}</span></div>
                  </div>
                </DataCard>
                <DataCard>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-xl font-black text-white">Athletic Profile</h3>
                    <Button variant="outline" size="sm" onClick={() => openDrawer('Edit Athletic Details', 'Update measurable sport profile details.', [['Position', athlete?.position ?? 'Forward'], ['Height', '180 cm'], ['Strong foot/hand', 'Right']])}><PencilEdit01Icon className="size-4" /> Edit Athletic Details</Button>
                  </div>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between border-b border-white/10 pb-2"><span className="text-slate-400">Position</span><span className="text-white font-medium">{athlete?.position ?? 'Forward'}</span></div>
                    <div className="flex justify-between border-b border-white/10 pb-2"><span className="text-slate-400">Height</span><span className="text-white font-medium">180 cm</span></div>
                    <div className="flex justify-between border-b border-white/10 pb-2"><span className="text-slate-400">Weight</span><span className="text-white font-medium">75 kg</span></div>
                    <div className="flex justify-between pb-2"><span className="text-slate-400">Strong Foot/Hand</span><span className="text-white font-medium">Right</span></div>
                  </div>
                </DataCard>
              </div>
            )}

            {activeTab === 'Challenges' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-display text-xl font-black text-white">Your Challenges</h3>
                  <Button onClick={() => openDrawer('Propose Verified Challenge', 'Draft a verified performance challenge for supporters.', [['Athlete', athlete?.name ?? 'Athlete'], ['Target', 'Score or assist in next match'], ['Review', 'League admin approval required']])}><Trophy className="size-4" /> Propose Verified Challenge</Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {athleteChallenges.length > 0 ? athleteChallenges.map(c => (
                    <DataCard key={c.id}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{c.type}</span>
                        <StatusExplainerChip domain="challenge" status={c.status} />
                      </div>
                      <p className="font-display text-lg font-black text-white">{c.description}</p>
                      <div className="mt-4 flex justify-between items-center border-t border-white/10 pt-3">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Pledged</p>
                          <p className="font-bold text-[var(--goal-mint)]">{formatUGX(c.totalPledged)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Supporters</p>
                          <p className="font-bold text-white">{c.supportersCount}</p>
                        </div>
                      </div>
                    </DataCard>
                  )) : (
                    <EmptyState title="No active challenges yet" description="Propose one verified match goal to engage your supporters and build your visibility score." />
                  )}
                </div>
              </div>
            )}

            {activeTab === 'Matches' && (
              <div className="space-y-6">
                <h3 className="font-display text-xl font-black text-white">Upcoming & Recent Matches</h3>
                <div className="space-y-3">
                  {matches.slice(0, 5).map(match => (
                    <DataCard key={match.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-white text-lg">{match.homeTeamId} <span className="text-slate-500 text-sm mx-2">vs</span> {match.awayTeamId}</p>
                        <p className="mt-1 text-sm text-slate-400 flex items-center gap-2">
                          <Calendar01Icon className="size-4" /> {new Date(match.scheduledAt).toLocaleDateString()} • {match.venue}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <StatusExplainerChip domain="match" status={match.status === 'scheduled' ? 'Scheduled' : match.status} />
                        {(match.status === 'scheduled') && <Button size="sm" variant="outline" onClick={() => openDrawer('Match Details', 'Upcoming fixture context and preparation notes.', [['Venue', match.venue], ['Date', new Date(match.scheduledAt).toLocaleDateString()], ['Status', match.status]])}>View Match Details</Button>}
                      </div>
                    </DataCard>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'Media' && (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-display text-xl font-black text-white">Highlights & Media</h3>
                  <Button onClick={() => openDrawer('Publish Media', 'Demo upload placeholder for highlight clips and images.', [['Accepted media', 'Images and video clips'], ['Moderation', 'League review before public visibility']])}><Upload01Icon className="size-4" /> Publish Media</Button>
                </div>
                <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="aspect-video bg-black/40 border border-white/10 rounded-xl flex flex-col items-center justify-center text-slate-500 hover:text-white hover:border-white/30 transition-colors cursor-pointer" onClick={() => demoAction('Played highlight')}>
                      <Video01Icon className="size-8 mb-2" />
                      <span className="text-xs font-bold">Highlight {i}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'Supporters' && (
              <div className="space-y-6">
                <h3 className="font-display text-xl font-black text-white">Your Top Supporters</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {[1, 2, 3, 4].map(i => (
                    <DataCard key={i} className="flex items-center gap-4">
                      <div className="size-12 rounded-full bg-gradient-to-br from-[var(--goal-mint)] to-blue-500 flex items-center justify-center text-black font-black text-lg">S{i}</div>
                      <div>
                        <p className="font-bold text-white">Supporter {i}</p>
                        <p className="text-sm text-slate-400">Backed 3 challenges</p>
                      </div>
                    </DataCard>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'Settings' && (
              <div className="grid gap-6 md:grid-cols-2">
                <DataCard>
                  <div className="flex items-center gap-3 mb-4">
                    <LockKeyIcon className="size-5 text-slate-400" />
                    <h3 className="font-display text-xl font-black text-white">Privacy</h3>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between text-sm text-slate-300">
                      <span>Make profile public</span>
                      <input type="checkbox" defaultChecked className="toggle" />
                    </label>
                    <label className="flex items-center justify-between text-sm text-slate-300">
                      <span>Show earnings</span>
                      <input type="checkbox" className="toggle" />
                    </label>
                    <Button variant="outline" className="w-full mt-2" onClick={() => demoAction('Privacy updated')}>Save Athlete Privacy</Button>
                  </div>
                </DataCard>
                <DataCard>
                  <div className="flex items-center gap-3 mb-4">
                    <Notification01Icon className="size-5 text-slate-400" />
                    <h3 className="font-display text-xl font-black text-white">Notifications</h3>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between text-sm text-slate-300">
                      <span>Email updates</span>
                      <input type="checkbox" defaultChecked className="toggle" />
                    </label>
                    <label className="flex items-center justify-between text-sm text-slate-300">
                      <span>New pledges SMS</span>
                      <input type="checkbox" defaultChecked className="toggle" />
                    </label>
                    <Button variant="outline" className="w-full mt-2" onClick={() => demoAction('Notifications updated')}>Save Athlete Notifications</Button>
                  </div>
                </DataCard>
              </div>
            )}

            <section className="rounded-xl border border-[var(--goal-gold)]/20 bg-[var(--goal-gold)]/8 p-5">
              <h3 className="font-display text-xl font-black text-white">Support/Payout History</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">Demo payout reviews only. Real payment processing is not enabled.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {[
                  ['Direct support', formatUGX(125000), 'Pending review'],
                  ['Challenge release', formatUGX(athleteChallenges[0]?.totalPledged ?? 45000), 'Evidence pending'],
                  ['Monthly support', formatUGX(86000), 'Demo only'],
                ].map(([type, amount, status]) => (
                  <div key={type} className="rounded-lg border border-white/10 bg-black/20 p-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{type}</p>
                    <p className="mt-1 font-display text-xl font-black text-white">{amount}</p>
                    <p className="mt-1 text-xs font-bold text-[var(--goal-gold)]">{status}</p>
                  </div>
                ))}
              </div>
            </section>

          </div>
        </div>
        <CreatePostModal open={postOpen} onOpenChange={setPostOpen} />
        <DetailDrawer open={Boolean(drawer)} onOpenChange={(open) => !open && setDrawer(null)} title={drawer?.title ?? ''} description={drawer?.description}>
          {drawer?.body}
        </DetailDrawer>
      </div>
  );
}
