'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  Bell,
  LogOut,
  Medal,
  ShieldCheck,
  User,
  Wallet,
  Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { CommentsDrawer, PledgeModal, SupportModal } from '@/components/modals/app-modals';
import { Button } from '@/components/ui/button';
import { ChallengeCard } from '@/components/ui/challenge-card';
import { FeedCard } from '@/components/ui/feed-card';
import { MatchCard } from '@/components/ui/match-card';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';
import { Athlete } from '@/types';
import { formatUGX, sports } from '@/lib/sportThemes';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';

import { RoleQuickActions } from '@/components/ui/RoleQuickActions';
import { ROLE_CONFIGS } from '@/lib/auth/roleConfig';

function HomeContent() {
  const router = useRouter();
  const { currentUser, role, setDemoRole, logout, userProfile } = useAuth();
  const { athletes, challenges, feedPosts, matches } = useGoalPlaceData();
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);
  const [pledgeAthlete, setPledgeAthlete] = useState<Athlete | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const activeChallenges = useMemo(
    () => challenges.filter((challenge) => challenge.status === 'Active').slice(0, 3),
    [challenges]
  );
  const featuredAthletes = useMemo(
    () => [...athletes].sort((a, b) => b.supportersCount - a.supportersCount).slice(0, 4),
    [athletes]
  );
  const todayMatches = useMemo(
    () => matches.filter((match) => match.status === 'Live' || match.status === 'Upcoming').slice(0, 4),
    [matches]
  );
  const personalizedFeed = feedPosts.slice(0, 4);
  const configRole = role === 'team_admin' ? 'league_admin' : role === 'super_admin' ? 'platform_admin' : role === 'sponsor' ? 'fan' : (role || 'fan');
  const config = ROLE_CONFIGS[configRole] || ROLE_CONFIGS['fan'];

  const handleLogout = async () => {
    setDemoRole(null);
    await logout();
    toast.success('Logged out');
    router.push('/');
  };

  return (
    <PageContainer compact className="space-y-8">
      <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
        <div className="rounded-xl border border-white/10 bg-white/[0.045] p-5 md:p-7">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {sports.map((sport) => (
              <SportBadge key={sport.slug} sport={sport.name} />
            ))}
          </div>
          <h1 className="font-heading text-3xl font-black text-white md:text-5xl">
            Welcome back, {userProfile?.name?.split(' ')[0] ?? currentUser?.email?.split('@')[0] ?? 'member'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
            {config.dashboardSubtitle}
          </p>
          <div className="mt-6">
            <RoleQuickActions />
          </div>
        </div>

        <div className="rounded-xl border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/8 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--goal-mint)]">Account</p>
              <h2 className="mt-2 font-heading text-2xl font-black text-white">{userProfile?.name ?? 'GoalPlace256 User'}</h2>
              <p className="mt-1 text-sm font-bold text-slate-300">{config.label}</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/8 px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-[var(--goal-mint)]">
              {config.label}
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {config.role === 'fan' || config.role === 'athlete' ? (
              <Button variant="gold" onClick={() => router.push('/wallet')}>
                <Wallet className="size-4" />
                Wallet
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => router.push('/profile')}>
              <User className="size-4" />
              Profile
            </Button>
            <Button variant="outline" onClick={() => router.push('/settings')}>
              <Bell className="size-4" />
              Settings
            </Button>
            <Button variant="destructive" onClick={handleLogout} className={config.role !== 'fan' && config.role !== 'athlete' ? "sm:col-span-2" : ""}>
              <LogOut className="size-4" />
              Logout
            </Button>
          </div>
        </div>
      </section>

      {/* Role specific quick stats */}
      <section className="grid gap-3 md:grid-cols-4">
        {config.role === 'fan' && (
          <>
            <ImpactStatCard label="Wallet" value={formatUGX(userProfile?.walletBalance ?? 0)} icon={Wallet} />
            <ImpactStatCard label="GoalPlace Points" value={String(userProfile?.points ?? 0)} icon={Medal} tone="gold" />
            <ImpactStatCard label="Awards progress" value="Eligible" icon={Award} tone="blue" />
            <ImpactStatCard label="Active challenges" value={String(activeChallenges.length)} icon={Zap} tone="orange" />
          </>
        )}
        {config.role === 'athlete' && (
          <>
            <ImpactStatCard label="Total Support" value="1.2M UGX" icon={Wallet} />
            <ImpactStatCard label="Supporters" value="45" icon={User} tone="gold" />
            <ImpactStatCard label="Verification" value="Verified" icon={ShieldCheck} tone="blue" />
            <ImpactStatCard label="Active challenges" value={String(activeChallenges.length)} icon={Zap} tone="orange" />
          </>
        )}
        {config.role === 'league_admin' && (
          <>
            <ImpactStatCard label="Pending Verifications" value="12" icon={ShieldCheck} tone="orange" />
            <ImpactStatCard label="Matches this week" value="8" icon={Medal} tone="blue" />
            <ImpactStatCard label="Open Disputes" value="2" icon={Zap} tone="gold" />
            <ImpactStatCard label="System Status" value="Healthy" icon={Bell} />
          </>
        )}
        {config.role === 'platform_admin' && (
          <>
            <ImpactStatCard label="Pending Approvals" value="5" icon={ShieldCheck} tone="orange" />
            <ImpactStatCard label="Active Reports" value="14" icon={Bell} tone="gold" />
            <ImpactStatCard label="System Load" value="Normal" icon={Zap} tone="blue" />
            <ImpactStatCard label="Total Users" value="2,405" icon={User} />
          </>
        )}
      </section>

      <section>
        <SectionHeader
          eyebrow={config.role === 'fan' ? 'Matches' : config.role === 'league_admin' ? 'Fixtures' : 'Upcoming Matches'}
          title={config.role === 'league_admin' ? 'Recent & Upcoming Fixtures' : 'Live and upcoming matches'}
          description="Track the next moments from your sports network."
          action={<Button variant="outline" onClick={() => router.push('/matches')}>View All</Button>}
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {todayMatches.map((match) => (
            <MatchCard key={match.id} match={match} onView={() => router.push(`/matches/${match.id}`)} />
          ))}
        </div>
      </section>

      {config.role !== 'platform_admin' && (
        <section>
          <SectionHeader
            eyebrow="Challenges"
            title={config.role === 'league_admin' ? 'Challenge Queue' : 'Active performance challenges'}
            description="Pledge support to athlete outcomes that can be verified by officials."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {activeChallenges.map((challenge) => {
              const athlete = athletes.find((item) => item.id === challenge.athleteId) ?? featuredAthletes[0];
              return (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  onSupport={() => setPledgeAthlete(athlete)}
                />
              );
            })}
          </div>
        </section>
      )}

      <section className="grid gap-8 lg:grid-cols-[0.82fr_1.18fr]">
        <div>
          <SectionHeader
            eyebrow={config.role === 'fan' ? 'Your Feed' : config.role === 'athlete' ? 'Athlete Feed' : config.role === 'league_admin' ? 'League Feed' : 'Platform Feed'}
            title={config.role === 'platform_admin' ? 'System Alerts & Reports' : 'Personalized updates'}
            description={config.role === 'platform_admin' ? 'Monitor platform activity and moderation queues.' : 'Highlights and verified activity from athletes, teams, and leagues in your orbit.'}
          />
          <div className="rounded-xl border border-white/10 bg-white/5 p-4">
            <ShieldCheck className="mb-4 size-6 text-[var(--goal-mint)]" />
            <h3 className="font-heading text-xl font-black text-white">Verified by design</h3>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              League standings are based only on match results. Paid plans never affect sporting rankings.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {personalizedFeed.map((post) => {
            const postAthlete = athletes.find((athlete) => athlete.id === post.authorId) ?? featuredAthletes[0];
            return (
              <FeedCard
                key={post.id}
                post={post}
                onSupport={() => setSupportAthlete(postAthlete)}
                onComment={() => setCommentsOpen(true)}
                onViewProfile={() => router.push(post.authorType === 'Athlete' ? `/athletes/${post.authorId}` : '/feed')}
                onViewMatch={() => router.push('/matches/match_001')}
              />
            );
          })}
        </div>
      </section>

      {config.role === 'fan' && (
        <section className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
          <SectionHeader
            eyebrow="Awards"
            title="Annual awards progress"
            description="Recognition grows from verified sport activity, fan engagement, and transparent community support."
            action={<Button variant="outline" onClick={() => router.push('/awards')}>View Awards</Button>}
            className="mb-0"
          />
        </section>
      )}

      <SupportModal athlete={supportAthlete} open={Boolean(supportAthlete)} onOpenChange={(open) => !open && setSupportAthlete(null)} />
      <PledgeModal athlete={pledgeAthlete} open={Boolean(pledgeAthlete)} onOpenChange={(open) => !open && setPledgeAthlete(null)} />
      <CommentsDrawer open={commentsOpen} onOpenChange={setCommentsOpen} />
    </PageContainer>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <HomeContent />
    </ProtectedRoute>
  );
}
