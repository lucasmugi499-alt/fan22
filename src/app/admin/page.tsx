'use client';

import React, { useState } from 'react';
import { ClipboardCheck, Download, AlertTriangle, UserX, CheckCircle, HandCoins, Building2, Trophy, Landmark } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ImpactStatCard } from '@/components/ui/product';
import { Button } from '@/components/ui/button';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { toast } from 'sonner';

export default function AdminPage() {
  const { leagues, matches, athletes, teams } = useGoalPlaceData();
  const pendingMatches = matches.filter((match) => match.verificationStatus === 'Pending' || match.verificationStatus === 'pending').length;
  
  const [activeTab, setActiveTab] = useState('Overview');
  const tabs = [
    'Overview', 'Users', 'Leagues', 'Athletes', 'Teams', 'Verifications', 
    'Reports', 'Feed Moderation', 'Payout Review', 'Sponsors', 
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
              <h1 className="font-heading text-3xl font-black text-white md:text-4xl">Platform Control Center</h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => demoAction('Export Data')}>
                <Download className="size-4" /> Export Data
              </Button>
            </div>
          </div>
          
          <div className="mx-auto mt-6 flex max-w-7xl overflow-x-auto hide-scrollbar border-b border-white/5">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap px-4 py-3 text-sm font-bold border-b-2 transition-colors ${
                  activeTab === tab 
                    ? 'border-[var(--goal-emerald)] text-[var(--goal-mint)]' 
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[#05070A] p-4 md:p-8">
          <div className="mx-auto max-w-7xl space-y-8">
            
            {activeTab === 'Overview' && (
              <>
                <section className="grid gap-3 md:grid-cols-4">
                  <ImpactStatCard label="Leagues" value={String(leagues.length)} icon={Landmark} />
                  <ImpactStatCard label="Teams" value={String(teams.length)} icon={Building2} tone="blue" />
                  <ImpactStatCard label="Athletes" value={String(athletes.length)} icon={Trophy} tone="gold" />
                  <ImpactStatCard label="Pending Verifications" value={String(pendingMatches)} icon={ClipboardCheck} tone="orange" />
                </section>

                <section className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <CheckCircle className="mb-4 size-6 text-[var(--goal-mint)]" />
                    <h3 className="font-heading text-xl font-black text-white">Pending Approvals</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Review leagues, teams, and athletes requesting platform access.</p>
                    <div className="mt-4 flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => demoAction('Approve League')}>League</Button>
                      <Button size="sm" variant="outline" onClick={() => demoAction('Approve Team')}>Team</Button>
                      <Button size="sm" variant="outline" onClick={() => demoAction('Approve Athlete')}>Athlete</Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <AlertTriangle className="mb-4 size-6 text-orange-400" />
                    <h3 className="font-heading text-xl font-black text-white">Moderation Queue</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Handle reported content, feed moderation, and account suspensions.</p>
                    <div className="mt-4 flex gap-2 flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => demoAction('Review Report')}>Reports</Button>
                      <Button size="sm" variant="outline" onClick={() => demoAction('Moderate Feed Post')}>Feed</Button>
                      <Button size="sm" variant="destructive" onClick={() => demoAction('Suspend Account')}><UserX className="size-4 mr-1"/>Suspend</Button>
                    </div>
                  </div>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <HandCoins className="mb-4 size-6 text-[var(--goal-gold)]" />
                    <h3 className="font-heading text-xl font-black text-white">Platform Operations</h3>
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
            
            {activeTab !== 'Overview' && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
                <p className="font-heading text-xl font-black text-white">{activeTab}</p>
                <p className="mt-2 text-sm">This section is available in the platform admin view.</p>
                {activeTab === 'Awards' && (
                  <Button className="mt-4" onClick={() => demoAction('Manage Awards')}>Manage Awards</Button>
                )}
                {activeTab === 'Reports' && (
                  <Button className="mt-4" onClick={() => demoAction('Review Report')}>Review Reports</Button>
                )}
                {activeTab === 'Feed Moderation' && (
                  <Button className="mt-4" onClick={() => demoAction('Moderate Feed Post')}>Moderate Feed</Button>
                )}
                {activeTab === 'Payout Review' && (
                  <Button className="mt-4" onClick={() => demoAction('Review Payout')}>Review Payouts</Button>
                )}
                {activeTab === 'Verifications' && (
                  <Button className="mt-4" onClick={() => demoAction('Verify Match')}>Verify Matches</Button>
                )}
                {activeTab === 'Sponsors' && (
                  <Button className="mt-4" onClick={() => demoAction('Manage Sponsor Package')}>Manage Packages</Button>
                )}
                {activeTab === 'Users' && (
                  <Button className="mt-4" variant="destructive" onClick={() => demoAction('Suspend Account')}>Suspend Account</Button>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
