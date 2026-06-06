'use client';

import React, { useState } from 'react';
import { HeartHandshake, ShieldCheck, Trophy, User, Upload, Calendar, Video, Activity } from 'lucide-react';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ImpactStatCard, SportBadge } from '@/components/ui/product';
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
              <h1 className="font-heading text-3xl font-black text-white md:text-4xl">{athlete?.name ?? 'Athlete Command Center'}</h1>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => demoAction('Highlight upload opened')}>
                <Upload className="size-4" /> Upload Highlight
              </Button>
              <Button variant="outline" onClick={() => demoAction('Verification request submitted')}>
                <ShieldCheck className="size-4" /> Request Verification
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
                  <ImpactStatCard label="Total Support" value={formatUGX(athlete?.totalEarnings ?? athlete?.totalSupport ?? 0)} icon={HeartHandshake} />
                  <ImpactStatCard label="Supporters" value={String(athlete?.supportersCount ?? 0)} icon={User} tone="gold" />
                  <ImpactStatCard label="Active Challenges" value={String(athleteChallenges.length)} icon={Trophy} tone="orange" />
                  <ImpactStatCard label="Verification" value={athlete?.verified ? 'Verified' : 'Pending'} icon={ShieldCheck} tone="blue" />
                </section>
                
                <section className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Calendar className="mb-4 size-6 text-[var(--goal-mint)]" />
                    <h3 className="font-heading text-xl font-black text-white">Upcoming Matches</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">You have {upcomingMatches.length} upcoming scheduled fixtures.</p>
                    <Button className="mt-4" variant="outline" onClick={() => setActiveTab('Matches')}>View Schedule</Button>
                  </div>
                  
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Activity className="mb-4 size-6 text-[var(--goal-gold)]" />
                    <h3 className="font-heading text-xl font-black text-white">Recent Engagement</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Your latest feed post received 24 new interactions.</p>
                    <Button className="mt-4" variant="outline" onClick={() => demoAction('Feed opened')}>View Feed Activity</Button>
                  </div>
                  
                  <div className="rounded-xl border border-white/10 bg-white/5 p-5">
                    <Video className="mb-4 size-6 text-blue-400" />
                    <h3 className="font-heading text-xl font-black text-white">Highlight Activity</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Upload your latest match highlights to attract support.</p>
                    <Button className="mt-4" variant="outline" onClick={() => demoAction('Upload modal opened')}>Upload Media</Button>
                  </div>
                </section>
              </>
            )}
            
            {activeTab !== 'Overview' && (
              <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-slate-300">
                <p className="font-heading text-xl font-black text-white">{activeTab}</p>
                <p className="mt-2 text-sm">This section is available in the athlete view.</p>
              </div>
            )}

          </div>
        </div>
      </div>
    </RoleGuard>
  );
}
