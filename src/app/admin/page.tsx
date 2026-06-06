'use client';

import React, { useState } from 'react';
import { Task01Icon, Download01Icon, Alert01Icon, UserRemove01Icon, CheckmarkCircle01Icon, Coins01Icon, Building03Icon, Building01Icon, SecurityCheckIcon, Flag01Icon, ZapIcon, Activity01Icon, LockKeyIcon, Notification01Icon, Comment01Icon, Briefcase01Icon } from 'hugeicons-react';
import { Trophy, Users } from '@phosphor-icons/react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { DataCard, ImpactStatCard, TabStrip, SectionHeader } from '@/components/ui/product';
import { Button } from '@/components/ui/button';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { toast } from 'sonner';

export default function AdminPage() {
  const { leagues, matches, athletes, teams } = useGoalPlaceData();
  const pendingMatches = matches.filter((match) => match.verificationStatus === 'Pending' || match.verificationStatus === 'pending').length;
  
  const [activeTab, setActiveTab] = useState('Overview');
  const tabs = [
    'Overview', 'Users', 'Leagues', 'Athletes', 'Teams', 'Verifications', 
    'Reports', 'Feed Moderation', 'Support/Payout Review', 'Sponsors', 
    'Awards', 'System Health', 'Settings'
  ];

  const demoAction = (action: string) => {
    toast.success(`${action} action triggered in demo mode.`);
  };

  return (
    <RoleGuard allowedRoles={['platform_admin', 'super_admin']}>
      <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden">
        <div className="border-b border-white/10 bg-[#0A0D14] px-4 py-6 md:px-8">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-bold text-red-400">
                  System Health: Operational
                </div>
              </div>
              <h1 className="font-display text-3xl font-black text-white md:text-4xl">Platform Control Center</h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => demoAction('Export Data')}>
                <Download01Icon className="size-4" /> Export Data
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
                  <ImpactStatCard label="Leagues" value={String(leagues.length)} icon={Building01Icon} />
                  <ImpactStatCard label="Teams" value={String(teams.length)} icon={Building03Icon} tone="blue" />
                  <ImpactStatCard label="Athletes" value={String(athletes.length)} icon={Trophy} tone="gold" />
                  <ImpactStatCard label="Pending Verifications" value={String(pendingMatches)} icon={Task01Icon} tone="orange" />
                </section>

                <section className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <CheckmarkCircle01Icon className="mb-4 size-6 text-[var(--goal-mint)]" />
                    <h3 className="font-display text-xl font-black text-white">Pending Approvals</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Review leagues, teams, and athletes requesting platform access.</p>
                    <div className="mt-4 flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => demoAction('Approve League')}>League</Button>
                      <Button size="sm" variant="outline" onClick={() => demoAction('Approve Team')}>Team</Button>
                      <Button size="sm" variant="outline" onClick={() => demoAction('Approve Athlete')}>Athlete</Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Alert01Icon className="mb-4 size-6 text-orange-400" />
                    <h3 className="font-display text-xl font-black text-white">Moderation Queue</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Handle reported content, feed moderation, and account suspensions.</p>
                    <div className="mt-4 flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => demoAction('Review Report')}>Reports</Button>
                      <Button size="sm" variant="outline" onClick={() => demoAction('Moderate Feed Post')}>Feed</Button>
                      <Button size="sm" variant="destructive" onClick={() => demoAction('Suspend Account')}><UserRemove01Icon className="size-4 mr-1"/>Suspend</Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Coins01Icon className="mb-4 size-6 text-[var(--goal-gold)]" />
                    <h3 className="font-display text-xl font-black text-white">Platform Operations</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Manage support payouts, verify matches, and configure sponsor packages.</p>
                    <div className="mt-4 flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => demoAction('Verify Match')}>Matches</Button>
                      <Button size="sm" variant="outline" onClick={() => demoAction('Review Payout')}>Payouts</Button>
                      <Button size="sm" variant="outline" onClick={() => demoAction('Manage Sponsor Package')}>Sponsors</Button>
                    </div>
                  </div>
                </section>
              </>
            )}
            
            {activeTab === 'Users' && (
              <section className="space-y-6">
                <SectionHeader eyebrow="User Management" title="Registered Accounts" action={<Button onClick={() => demoAction('Export Users')}><Download01Icon className="size-4" /> Export</Button>} />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <DataCard key={i} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-full bg-white/10 flex items-center justify-center font-bold text-white">U{i}</div>
                        <div>
                          <p className="font-bold text-white">User {i}</p>
                          <p className="text-sm text-slate-400">Fan • Joined 2 days ago</p>
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => demoAction(`Suspended User ${i}`)}><UserRemove01Icon className="size-4 mr-1"/>Suspend</Button>
                    </DataCard>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'Leagues' && (
              <section className="space-y-6">
                <SectionHeader eyebrow="Leagues" title="Platform Leagues" action={<Button onClick={() => demoAction('Create League')}>Create League</Button>} />
                <div className="grid gap-4 md:grid-cols-2">
                  {leagues.map(league => (
                    <DataCard key={league.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-lg text-white">{league.name}</p>
                        <p className="text-sm text-slate-400">{league.city} • <span className="capitalize">{league.status}</span></p>
                      </div>
                      <Button size="sm" onClick={() => demoAction(`Reviewed League ${league.name}`)}>Review</Button>
                    </DataCard>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'Athletes' && (
              <section className="space-y-6">
                <SectionHeader eyebrow="Athletes" title="Platform Athletes" />
                <div className="grid gap-4 md:grid-cols-3">
                  {athletes.slice(0, 9).map(athlete => (
                    <DataCard key={athlete.id} className="flex flex-col gap-3">
                      <div>
                        <p className="font-bold text-lg text-white">{athlete.name}</p>
                        <p className="text-sm text-slate-400">{athlete.sport} • {athlete.city}</p>
                      </div>
                      <div className="flex justify-between items-center mt-2 border-t border-white/10 pt-2">
                        <span className={`text-xs font-bold uppercase tracking-widest ${athlete.verified ? 'text-[var(--goal-mint)]' : 'text-orange-400'}`}>{athlete.verificationStatus}</span>
                        {!athlete.verified && <Button size="sm" onClick={() => demoAction(`Verified Athlete ${athlete.name}`)}>Verify</Button>}
                      </div>
                    </DataCard>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'Teams' && (
              <section className="space-y-6">
                <SectionHeader eyebrow="Teams" title="Platform Teams" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {teams.slice(0, 6).map(team => (
                    <DataCard key={team.id}>
                      <Building03Icon className="mb-3 size-5 text-blue-400" />
                      <p className="font-bold text-lg text-white">{team.name}</p>
                      <p className="text-sm text-slate-400 mb-4">{team.city} • <span className="capitalize">{team.sport}</span></p>
                      <Button className="w-full" variant="outline" size="sm" onClick={() => demoAction(`Managed Team ${team.name}`)}>Manage Team</Button>
                    </DataCard>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'Verifications' && (
              <section className="grid gap-8 lg:grid-cols-2">
                <div>
                  <SectionHeader eyebrow="Queue" title="Match Escalations" description="Match disputes escalated from League Admins." />
                  <div className="space-y-3">
                    {[1, 2].map(i => (
                      <DataCard key={i} className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-orange-400"><Alert01Icon className="size-4" /><span className="text-sm font-bold uppercase tracking-widest">Disputed Result</span></div>
                        <p className="font-bold text-white">Match #{i}00 - Escalated</p>
                        <p className="text-sm text-slate-400">Score mismatch reported by away team.</p>
                        <Button size="sm" variant="outline" className="self-start mt-2" onClick={() => demoAction(`Resolved Match Dispute ${i}`)}>Resolve Dispute</Button>
                      </DataCard>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionHeader eyebrow="Queue" title="Challenge Escalations" description="Performance challenges requiring platform review." />
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <DataCard key={i} className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-[var(--goal-gold)]"><SecurityCheckIcon className="size-4" /><span className="text-sm font-bold uppercase tracking-widest">Verification Review</span></div>
                        <p className="font-bold text-white">Challenge #{i}50 - High Value</p>
                        <p className="text-sm text-slate-400">1.5M UGX target achieved, pending final sign-off.</p>
                        <Button size="sm" variant="outline" className="self-start mt-2" onClick={() => demoAction(`Approved Challenge ${i}`)}>Approve Verification</Button>
                      </DataCard>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'Reports' && (
              <section className="space-y-6">
                <SectionHeader eyebrow="Moderation" title="User Reports" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[
                    { id: 1, type: 'Harassment', status: 'Pending Review', target: 'User #4092' },
                    { id: 2, type: 'Spam', status: 'Pending Review', target: 'Post #992' },
                    { id: 3, type: 'Inappropriate Media', status: 'Under Investigation', target: 'Athlete #12' },
                  ].map(report => (
                    <DataCard key={report.id} className="flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold px-2 py-1 bg-red-500/20 text-red-400 rounded uppercase">{report.type}</span>
                        <Flag01Icon className="size-4 text-slate-500" />
                      </div>
                      <div>
                        <p className="font-bold text-white">Target: {report.target}</p>
                        <p className="text-sm text-slate-400">{report.status}</p>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button size="sm" className="flex-1" onClick={() => demoAction(`Dismissed Report ${report.id}`)}>Dismiss</Button>
                        <Button size="sm" variant="destructive" className="flex-1" onClick={() => demoAction(`Took Action on Report ${report.id}`)}>Take Action</Button>
                      </div>
                    </DataCard>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'Feed Moderation' && (
              <section className="space-y-6">
                <SectionHeader eyebrow="Content" title="Global Feed Moderation" description="Review flagged posts from the global community feed." />
                <div className="space-y-4">
                  {[1, 2].map(i => (
                    <DataCard key={i} className="flex flex-col sm:flex-row gap-4 items-start justify-between">
                      <div className="flex gap-4 items-start">
                        <Comment01Icon className="size-5 text-slate-500 mt-1" />
                        <div>
                          <p className="font-bold text-white">Flagged Post #{i}</p>
                          <p className="text-sm text-slate-300 italic mt-1">&quot;This referee is totally bought off, terrible officiating...&quot;</p>
                          <p className="text-xs text-slate-500 mt-2">Flagged 4 times by users.</p>
                        </div>
                      </div>
                      <div className="flex sm:flex-col gap-2">
                        <Button size="sm" variant="destructive" onClick={() => demoAction(`Removed Post ${i}`)}>Remove Post</Button>
                        <Button size="sm" variant="outline" onClick={() => demoAction(`Approved Post ${i}`)}>Keep Post</Button>
                      </div>
                    </DataCard>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'Support/Payout Review' && (
              <section className="space-y-6">
                <SectionHeader eyebrow="Finance" title="Payout Authorizations" description="Final approval step for payouts to athletes and leagues." />
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {[
                    { id: 1, amount: '450,000 UGX', recipient: 'Athlete #12', type: 'Challenge Completion' },
                    { id: 2, amount: '1,200,000 UGX', recipient: 'League #3', type: 'Sponsorship Milestone' },
                    { id: 3, amount: '25,000 UGX', recipient: 'Athlete #88', type: 'Direct Support' },
                  ].map(payout => (
                    <DataCard key={payout.id}>
                      <Coins01Icon className="size-6 text-[var(--goal-mint)] mb-3" />
                      <p className="font-display text-xl font-black text-white">{payout.amount}</p>
                      <p className="text-sm text-slate-400">{payout.type}</p>
                      <p className="text-sm font-bold text-white mt-3 mb-4">To: {payout.recipient}</p>
                      <Button className="w-full" onClick={() => demoAction(`Authorized Payout ${payout.id}`)}>Authorize Release</Button>
                    </DataCard>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'Sponsors' && (
              <section className="space-y-6">
                <SectionHeader eyebrow="Partnerships" title="Sponsor Directory" description="Manage corporate partners and ad packages." action={<Button onClick={() => demoAction('Invite Sponsor')}>Invite Partner</Button>} />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map(i => (
                    <DataCard key={i}>
                      <Briefcase01Icon className="size-5 text-[var(--goal-gold)] mb-3" />
                      <p className="font-bold text-lg text-white">Corporate Partner {i}</p>
                      <p className="text-sm text-slate-400 mb-4">Tier: {i === 1 ? 'Platinum' : 'Gold'} • Status: Active</p>
                      <Button className="w-full" variant="outline" size="sm" onClick={() => demoAction(`Managed Partner ${i}`)}>Manage Package</Button>
                    </DataCard>
                  ))}
                </div>
              </section>
            )}

            {activeTab === 'Awards' && (
              <section className="grid gap-6 md:grid-cols-2">
                <DataCard>
                  <Trophy className="size-6 text-[var(--goal-gold)] mb-4" />
                  <h3 className="font-display text-xl font-black text-white">Annual Awards Configuration</h3>
                  <p className="text-sm text-slate-400 mt-2 mb-6">Manage award categories, voting windows, and nominees for the GoalPlace256 Annual Awards.</p>
                  <Button onClick={() => demoAction('Awards Config Opened')}>Configure Season</Button>
                </DataCard>
                <DataCard>
                  <Activity01Icon className="size-6 text-blue-400 mb-4" />
                  <h3 className="font-display text-xl font-black text-white">Voting Analytics</h3>
                  <p className="text-sm text-slate-400 mt-2 mb-6">Monitor community voting integrity and engagement metrics for the current awards cycle.</p>
                  <Button variant="outline" onClick={() => demoAction('Voting Analytics Opened')}>View Analytics</Button>
                </DataCard>
              </section>
            )}

            {activeTab === 'System Health' && (
              <section className="space-y-6">
                <SectionHeader eyebrow="Infrastructure" title="System Status" />
                <div className="grid gap-4 md:grid-cols-3">
                  <DataCard className="text-center">
                    <Activity01Icon className="size-8 mx-auto text-[var(--goal-mint)] mb-3" />
                    <p className="text-sm uppercase tracking-widest text-slate-500 font-bold">API Uptime</p>
                    <p className="font-display text-3xl font-black text-white mt-1">99.99%</p>
                  </DataCard>
                  <DataCard className="text-center">
                    <ZapIcon className="size-8 mx-auto text-[var(--goal-gold)] mb-3" />
                    <p className="text-sm uppercase tracking-widest text-slate-500 font-bold">Avg Latency</p>
                    <p className="font-display text-3xl font-black text-white mt-1">124ms</p>
                  </DataCard>
                  <DataCard className="text-center">
                    <Users className="size-8 mx-auto text-blue-400 mb-3" />
                    <p className="text-sm uppercase tracking-widest text-slate-500 font-bold">Active Sessions</p>
                    <p className="font-display text-3xl font-black text-white mt-1">4,092</p>
                  </DataCard>
                </div>
              </section>
            )}

            {activeTab === 'Settings' && (
              <section className="grid gap-6 md:grid-cols-2">
                <DataCard>
                  <div className="flex items-center gap-3 mb-4">
                    <LockKeyIcon className="size-5 text-slate-400" />
                    <h3 className="font-display text-xl font-black text-white">Security</h3>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between text-sm text-slate-300">
                      <span>Require 2FA for Admins</span>
                      <input type="checkbox" defaultChecked className="toggle" />
                    </label>
                    <label className="flex items-center justify-between text-sm text-slate-300">
                      <span>Log all moderation actions</span>
                      <input type="checkbox" defaultChecked className="toggle" />
                    </label>
                    <Button variant="outline" className="w-full mt-4" onClick={() => demoAction('Security updated')}>Save Security</Button>
                  </div>
                </DataCard>
                <DataCard>
                  <div className="flex items-center gap-3 mb-4">
                    <Notification01Icon className="size-5 text-slate-400" />
                    <h3 className="font-display text-xl font-black text-white">Global Alerts</h3>
                  </div>
                  <div className="space-y-3">
                    <label className="flex items-center justify-between text-sm text-slate-300">
                      <span>Enable platform maintenance banner</span>
                      <input type="checkbox" className="toggle" />
                    </label>
                    <Button variant="outline" className="w-full mt-4" onClick={() => demoAction('Alerts updated')}>Update Banner</Button>
                  </div>
                </DataCard>
              </section>
            )}

          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
