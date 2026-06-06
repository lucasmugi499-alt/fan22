'use client';

import React, { useState } from 'react';
import { UserGroupIcon, SecurityCheckIcon, UserIcon, Upload01Icon, Calendar01Icon, Video01Icon, Activity01Icon, PencilEdit01Icon, LockKeyIcon, Notification01Icon, CheckmarkCircle01Icon } from 'hugeicons-react';
import { Trophy } from '@phosphor-icons/react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { DataCard, ImpactStatCard, SportBadge, TabStrip } from '@/components/ui/product';
import { Button } from '@/components/ui/button';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { formatUGX } from '@/lib/sportThemes';
import { toast } from 'sonner';

export default function AthleteDashboardPage() {
  const { athletes, challenges, matches } = useGoalPlaceData();
  const athlete = athletes[0];
  const athleteChallenges = athlete ? challenges.filter((challenge) => challenge.athleteId === athlete.id) : [];
  const upcomingMatches = matches.filter(match => match.status === 'scheduled' || match.status === 'Upcoming').slice(0, 3);
  
  const [activeTab, setActiveTab] = useState('Overview');
  const tabs = ['Overview', 'Profile', 'Challenges', 'Matches', 'Media', 'Supporters', 'Settings'];

  const demoAction = (action: string) => {
    toast.success(`${action} successful in demo mode.`);
  };

  return (
    <RoleGuard allowedRoles={['athlete', 'platform_admin', 'super_admin']}>
      <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
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
            <div className="flex gap-2">
              <Button onClick={() => demoAction('Highlight upload opened')}>
                <Upload01Icon className="size-4" /> Upload Highlight
              </Button>
              <Button variant="outline" onClick={() => demoAction('Verification request submitted')}>
                <SecurityCheckIcon className="size-4" /> Request Verification
              </Button>
            </div>
          </div>
          
          <TabStrip tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
        </div>

        <div className="flex-1 overflow-y-auto bg-[#05070A] p-4 md:p-8">
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
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Calendar01Icon className="mb-4 size-6 text-[var(--goal-mint)]" />
                    <h3 className="font-display text-xl font-black text-white">Upcoming Matches</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">You have {upcomingMatches.length} upcoming scheduled fixtures.</p>
                    <Button className="mt-4" variant="outline" onClick={() => setActiveTab('Matches')}>View Schedule</Button>
                  </div>
                  
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Activity01Icon className="mb-4 size-6 text-[var(--goal-gold)]" />
                    <h3 className="font-display text-xl font-black text-white">Recent Engagement</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Your latest feed post received 24 new interactions.</p>
                    <Button className="mt-4" variant="outline" onClick={() => demoAction('Feed opened')}>View Feed Activity</Button>
                  </div>
                  
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Video01Icon className="mb-4 size-6 text-blue-400" />
                    <h3 className="font-display text-xl font-black text-white">Highlight Activity</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Upload your latest match highlights to attract support.</p>
                    <Button className="mt-4" variant="outline" onClick={() => demoAction('Upload modal opened')}>Upload Media</Button>
                  </div>
                </section>
              </>
            )}
            
            {activeTab === 'Profile' && (
              <div className="grid gap-6 lg:grid-cols-2">
                <DataCard>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-xl font-black text-white">Personal Information</h3>
                    <Button variant="outline" size="sm"><PencilEdit01Icon className="size-4" /> Edit</Button>
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
                    <Button variant="outline" size="sm"><PencilEdit01Icon className="size-4" /> Edit</Button>
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
                  <Button onClick={() => demoAction('New challenge proposed')}><Trophy className="size-4" /> Propose Challenge</Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {athleteChallenges.length > 0 ? athleteChallenges.map(c => (
                    <DataCard key={c.id}>
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{c.type}</span>
                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-widest ${c.status === 'open' ? 'bg-orange-500/20 text-orange-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{c.status}</span>
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
                    <div className="col-span-full text-center py-10 border border-white/10 border-dashed rounded-xl text-slate-400">No active challenges. Propose one to engage your supporters!</div>
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
                        <span className={`text-xs font-bold px-2 py-1 rounded bg-white/10 uppercase tracking-widest ${match.status === 'verified' ? 'text-[var(--goal-mint)]' : 'text-slate-300'}`}>{match.status}</span>
                        {match.status === 'scheduled' && <Button size="sm" variant="outline" onClick={() => demoAction('Match details viewed')}>View</Button>}
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
                  <Button onClick={() => demoAction('Media upload opened')}><Upload01Icon className="size-4" /> Upload</Button>
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
                    <Button variant="outline" className="w-full mt-2" onClick={() => demoAction('Privacy updated')}>Save Privacy</Button>
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
                    <Button variant="outline" className="w-full mt-2" onClick={() => demoAction('Notifications updated')}>Save Notifications</Button>
                  </div>
                </DataCard>
              </div>
            )}

          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
