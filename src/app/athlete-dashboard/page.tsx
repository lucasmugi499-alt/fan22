'use client';

import React, { useSyncExternalStore } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Calendar, CheckCircle2, ImageUp, LineChart, ReceiptText, ShieldCheck, Trophy, Users } from 'lucide-react';
import { dashboardSeries, walletTransactions } from '@/lib/mockData';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { formatUGX } from '@/lib/sportThemes';
import { Button } from '@/components/ui/button';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { ChallengeCard } from '@/components/ui/challenge-card';
import { FeedCard } from '@/components/ui/feed-card';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge } from '@/components/ui/product';

export default function AthleteDashboardPage() {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const { currentUser } = useAuth();
  const { athletes, challenges, feedPosts } = useGoalPlaceData();
  const athlete = athletes.find((item) => item.userId === currentUser?.uid) ?? athletes[0];
  const athleteChallenges = athlete ? challenges.filter((challenge) => challenge.athleteId === athlete.id) : [];
  const athleteFeed = athlete ? feedPosts.filter((post) => post.authorId === athlete.id || post.sport === athlete.sport).slice(0, 2) : [];

  if (!athlete) {
    return (
      <RoleGuard allowedRoles={['athlete', 'platform_admin', 'super_admin']}>
        <PageContainer compact>
          <div className="glass-panel rounded-xl p-8 text-center text-slate-300">No athlete profile is linked yet.</div>
        </PageContainer>
      </RoleGuard>
    );
  }

  return (
    <RoleGuard allowedRoles={['athlete', 'platform_admin', 'super_admin']}>
      <PageContainer compact>
      <SectionHeader
        eyebrow="Athlete Dashboard"
        title={`Welcome, ${athlete.name}`}
        description="Manage your profile, verification, support, active challenges, highlights, feed posts, and payout history."
        action={<SportBadge sport={athlete.sport} />}
      />

      <div className="grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Profile completion" value="86%" icon={CheckCircle2} />
        <ImpactStatCard label="Verification" value="Verified" icon={ShieldCheck} tone="gold" />
        <ImpactStatCard label="Earnings" value={formatUGX(athlete.totalEarnings)} icon={Trophy} tone="blue" />
        <ImpactStatCard label="Supporters" value={String(athlete.supportersCount)} icon={Users} tone="orange" />
      </div>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="glass-panel rounded-xl p-5">
          <SectionHeader eyebrow="Growth" title="Supporter growth" className="mb-4" />
          <div className="h-72 w-full">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashboardSeries}>
                  <defs>
                    <linearGradient id="support" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00C46A" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#00C46A" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                  <XAxis dataKey="month" stroke="#94A3B8" tickLine={false} axisLine={false} />
                  <YAxis stroke="#94A3B8" tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#F8FAFC' }} />
                  <Area type="monotone" dataKey="support" stroke="#00C46A" fill="url(#support)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full rounded-xl border border-white/10 bg-white/5" />
            )}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="glass-panel rounded-xl p-5">
            <LineChart className="mb-4 size-6 text-[var(--goal-mint)]" />
            <h2 className="font-heading text-2xl font-black text-white">Profile completion</h2>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[86%] rounded-full bg-gradient-to-r from-[var(--goal-emerald)] to-[var(--goal-gold)]" />
            </div>
            <p className="mt-3 text-sm text-slate-400">Add two more highlights to reach premium profile readiness.</p>
          </div>
          <div className="glass-panel rounded-xl p-5">
            <Calendar className="mb-4 size-6 text-[var(--goal-gold)]" />
            <h2 className="font-heading text-2xl font-black text-white">Upcoming match</h2>
            <p className="mt-2 text-sm text-slate-400">Kisenyi FC vs Makindye Stars at KCCA Stadium.</p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader eyebrow="Challenges" title="Active challenges" />
        <div className="grid gap-4 md:grid-cols-3">
          {athleteChallenges.map((challenge) => (
            <ChallengeCard key={challenge.id} challenge={challenge} />
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="glass-panel rounded-xl p-5">
          <ImageUp className="mb-4 size-7 text-[var(--goal-mint)]" />
          <h2 className="font-heading text-2xl font-black text-white">Highlight uploads</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">Upload clips, training moments, and match highlights for fan discovery.</p>
          <Button className="mt-5">Upload Highlight</Button>
        </div>
        <div>
          <SectionHeader eyebrow="Feed Posts" title="Recent posts" />
          <div className="space-y-4">
            {athleteFeed.map((post) => (
              <FeedCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader eyebrow="Payout History" title="Payout history" />
        <div className="grid gap-3">
          {walletTransactions.slice(0, 3).map((transaction) => (
            <div key={transaction.id} className="glass-panel flex items-center gap-4 rounded-xl p-4">
              <ReceiptText className="size-5 text-[var(--goal-gold)]" />
              <div className="min-w-0 flex-1">
                <p className="font-heading text-base font-black text-white">{transaction.label}</p>
                <p className="text-xs text-slate-400">{transaction.date} - {transaction.status}</p>
              </div>
              <p className="font-heading text-sm font-black text-white">{Math.abs(transaction.amount).toLocaleString()} UGX</p>
            </div>
          ))}
        </div>
      </section>
      </PageContainer>
    </RoleGuard>
  );
}
