'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Award, Calendar, HeartHandshake, MessageSquare, Wallet } from 'lucide-react';
import { mockCurrentUser } from '@/lib/mockData';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { Button } from '@/components/ui/button';
import { FeedCard } from '@/components/ui/feed-card';
import { GoalPlacePointsBadge, ImpactStatCard, PageContainer, SectionHeader } from '@/components/ui/product';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function DashboardPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { athletes, feedPosts, matches } = useGoalPlaceData();
  const profile = userProfile ?? mockCurrentUser;

  return (
    <ProtectedRoute>
      <PageContainer compact>
      <SectionHeader
        eyebrow="Fan Dashboard"
        title={`Good to see you, ${profile.name}`}
        description="Your daily command center for followed athletes, match reminders, wallet activity, and community moments."
        action={<GoalPlacePointsBadge points={profile.points} />}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Wallet" value={`${profile.walletBalance.toLocaleString()} UGX`} icon={Wallet} />
        <ImpactStatCard label="Followed athletes" value={String(profile.followedAthletes.length)} icon={HeartHandshake} tone="gold" />
        <ImpactStatCard label="Upcoming matches" value={String(matches.filter((match) => match.status === 'Upcoming').length)} icon={Calendar} tone="blue" />
        <ImpactStatCard label="Awards rank" value="#12" icon={Award} tone="orange" />
      </div>

      <section className="mt-8 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div className="glass-panel h-fit rounded-xl p-5">
          <h2 className="font-heading text-2xl font-black text-white">Quick Actions</h2>
          <div className="mt-5 grid gap-2">
            <Button onClick={() => router.push('/athletes')}>Support Athlete</Button>
            <Button variant="outline" onClick={() => router.push('/matches')}>View Matches</Button>
            <Button variant="secondary" onClick={() => router.push('/wallet')}>Open Wallet</Button>
            <Button variant="outline" onClick={() => router.push('/awards')}>View Awards</Button>
          </div>
        </div>
        <div>
          <SectionHeader eyebrow="Following" title="Latest from your community" />
          <div className="space-y-4">
            {feedPosts.slice(0, 3).map((post) => (
              <FeedCard key={post.id} post={post} onSupport={() => router.push('/athletes')} onComment={() => router.push('/feed')} />
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader eyebrow="Suggested Athletes" title="People to follow next" />
        <div className="grid gap-4 md:grid-cols-3">
          {athletes.slice(0, 3).map((athlete) => (
            <button key={athlete.id} className="glass-panel rounded-xl p-4 text-left" onClick={() => router.push(`/athletes/${athlete.id}`)}>
              <MessageSquare className="mb-4 size-5 text-[var(--goal-mint)]" />
              <h3 className="font-heading text-xl font-black text-white">{athlete.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{athlete.position} - {athlete.city}</p>
            </button>
          ))}
        </div>
      </section>
      </PageContainer>
    </ProtectedRoute>
  );
}
