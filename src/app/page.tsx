'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Award,
  Building2,
  Coins,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { Athlete } from '@/types';
import { sponsorPackages } from '@/data/sponsorPackages';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { sports, formatUGX, getInitials, getSportTheme } from '@/lib/sportThemes';
import { Button } from '@/components/ui/button';
import { AthleteCard } from '@/components/ui/athlete-card';
import { ChallengeCard } from '@/components/ui/challenge-card';
import { FeedCard } from '@/components/ui/feed-card';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { MatchCard } from '@/components/ui/match-card';
import {
  BackgroundOrbs,
  GoalPlacePointsBadge,
  ImpactStatCard,
  PageContainer,
  SectionHeader,
  SportBadge,
  StadiumGlow,
  StickyStorySection,
  TrustNote,
} from '@/components/ui/product';
import {
  CommentsDrawer,
  PledgeModal,
  SponsorInterestModal,
  SupportModal,
} from '@/components/modals/app-modals';
import { useAuth } from '@/context/AuthProvider';
import { useAuthModal } from '@/components/auth/AuthRequiredModal';

export default function Home() {
  const { authStatus } = useAuth();
  
  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#05070A]">
        <div className="size-8 animate-spin rounded-full border-4 border-white/10 border-t-[var(--goal-emerald)]"></div>
      </div>
    );
  }

  if (authStatus === 'logged_in') {
    return <LoggedInHome />;
  }

  return <PublicHome />;
}

function LoggedInHome() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);
  const [pledgeAthlete, setPledgeAthlete] = useState<Athlete | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { athletes, challenges, feedPosts } = useGoalPlaceData();

  const activeChallenges = challenges.filter((c) => c.status === 'Active').slice(0, 3);
  const featuredAthletes = [...athletes].sort((a, b) => b.supportersCount - a.supportersCount).slice(0, 4);

  return (
    <div className="w-full overflow-hidden pb-20 pt-10">
      <PageContainer className="space-y-12">
        <section className="glass-panel rounded-2xl p-6 md:p-10">
          <h1 className="font-heading text-3xl font-black text-white md:text-5xl">Welcome back, {userProfile?.name?.split(' ')[0] || 'Fan'}!</h1>
          <p className="mt-3 text-slate-400">Here is your daily GoalPlace256 summary.</p>
          
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--goal-gold)]/20 bg-[var(--goal-gold)]/10 p-5">
              <div className="mb-2 flex items-center gap-2 text-[var(--goal-gold)]">
                <Coins className="size-5" />
                <span className="text-[10px] font-black uppercase tracking-wider">Points</span>
              </div>
              <p className="font-heading text-3xl font-black text-white">{userProfile?.points?.toLocaleString() || 0}</p>
            </div>
            <div className="rounded-xl border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/10 p-5">
              <div className="mb-2 flex items-center gap-2 text-[var(--goal-mint)]">
                <Wallet className="size-5" />
                <span className="text-[10px] font-black uppercase tracking-wider">Wallet</span>
              </div>
              <p className="font-heading text-3xl font-black text-white">{formatUGX(userProfile?.walletBalance || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Users className="size-5" />
                <span className="text-[10px] font-black uppercase tracking-wider">Following</span>
              </div>
              <p className="font-heading text-3xl font-black text-white">{userProfile?.followedAthletes?.length || 0}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Award className="size-5" />
                <span className="text-[10px] font-black uppercase tracking-wider">Awards</span>
              </div>
              <p className="font-heading text-xl font-black text-white mt-1">Eligible to Vote</p>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="For You"
            title="Active Challenges"
            description="Pledge support for verified performance rewards."
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

        <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <SectionHeader
              eyebrow="Your Feed"
              title="Personalized Updates"
              description="Highlights and results from the athletes and teams you follow."
            />
          </div>
          <div className="space-y-4">
            {feedPosts.slice(0, 5).map((post) => {
              const postAthlete = athletes.find((a) => a.id === post.authorId) ?? featuredAthletes[0];
              return (
                <FeedCard
                  key={post.id}
                  post={post}
                  onSupport={() => setSupportAthlete(postAthlete)}
                  onComment={() => setCommentsOpen(true)}
                  onViewProfile={() => router.push(post.authorType === 'Athlete' ? `/athletes/${post.authorId}` : '/feed')}
                  onViewMatch={() => router.push('/matches/m1')}
                />
              );
            })}
          </div>
        </section>

      </PageContainer>
      
      <SupportModal athlete={supportAthlete} open={Boolean(supportAthlete)} onOpenChange={(open) => !open && setSupportAthlete(null)} />
      <PledgeModal athlete={pledgeAthlete} open={Boolean(pledgeAthlete)} onOpenChange={(open) => !open && setPledgeAthlete(null)} />
      <CommentsDrawer open={commentsOpen} onOpenChange={setCommentsOpen} />
    </div>
  );
}

function PublicHome() {
  const router = useRouter();
  const [sponsorOpen, setSponsorOpen] = useState(false);

  // We can use framer-motion for simple scroll reveal
  const fadeUp: any = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } }
  };

  return (
    <div className="w-full overflow-hidden bg-[#05070A]">
      {/* 1. Cinematic Hero */}
      <section className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden pt-16 md:pt-0">
        <StadiumGlow />
        <BackgroundOrbs />
        
        <PageContainer className="relative z-10 flex flex-col items-center justify-center text-center">
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-[var(--goal-mint)] backdrop-blur-xl"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-gradient-to-br from-[var(--goal-emerald)] to-[var(--goal-emerald-dark)] text-[10px] text-white">
              GP
            </span>
            Uganda&apos;s Sports Platform
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="max-w-5xl text-balance font-heading text-[clamp(2.5rem,8vw,6.5rem)] font-black leading-[0.95] tracking-tight text-white"
          >
            Back the athletes.<br />
            <span className="bg-gradient-to-r from-[var(--goal-mint)] to-[var(--goal-gold)] bg-clip-text text-transparent">Build the game.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="mt-6 max-w-2xl text-base leading-relaxed text-slate-300 md:text-xl md:leading-8"
          >
            Sign in to follow athletes, view full match activity, and support Uganda&apos;s grassroots sports community. The future of local sports is verified and fan-driven.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <Button size="lg" className="h-14 rounded-xl px-8 text-sm" onClick={() => router.push('/login')}>Login</Button>
            <Button size="lg" variant="outline" className="h-14 rounded-xl px-8 text-sm" onClick={() => router.push('/register?role=fan')}>Join as Fan</Button>
            <Button size="lg" variant="secondary" className="h-14 rounded-xl px-8 text-sm" onClick={() => router.push('/register?role=athlete')}>Register Athlete</Button>
            <Button size="lg" variant="secondary" className="h-14 rounded-xl px-8 text-sm hidden md:flex" onClick={() => router.push('/register?role=league-admin')}>Register League</Button>
            <Button size="lg" variant="gold" className="h-14 rounded-xl px-8 text-sm hidden md:flex" onClick={() => router.push('/register?role=sponsor')}>Become Sponsor</Button>
          </motion.div>
        </PageContainer>
        
        {/* Subtle Parallax Scroll Indicator */}
        <motion.div 
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 1 }}
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Scroll to Discover</span>
          <div className="h-10 w-[1px] bg-gradient-to-b from-slate-500 to-transparent"></div>
        </motion.div>
      </section>

      <PageContainer className="space-y-24 pb-32">
        {/* 2. What GoalPlace256 Is & 3. Sports Covered */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp as any}>
          <SectionHeader
            eyebrow="The Ecosystem"
            title="A unified platform for grassroots sports."
            description="We are building the definitive digital home for Uganda's emerging talent across three core pillars."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {sports.map((sport) => {
              const Icon = sport.icon;
              return (
                <div key={sport.slug} className={`glass-panel group relative overflow-hidden rounded-2xl p-8 transition-all duration-500 hover:-translate-y-2 ${sport.edgeClass}`}>
                  <div className={`absolute inset-0 bg-gradient-to-br ${sport.mutedGradient} opacity-40 transition-opacity group-hover:opacity-60`} />
                  <div className="relative z-10">
                    <Icon className="size-8 mb-6" style={{ color: sport.color }} />
                    <h3 className="font-heading text-2xl font-black text-white">{sport.name}</h3>
                    <p className="mt-3 text-sm leading-6 text-slate-300">Discover verified athletes, live scores, and community moments.</p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.section>

        {/* 4. How It Works (Sticky Story) */}
        <StickyStorySection />

        {/* Locked Preview: 5. Verified Performance Rewards */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp} className="relative">
          <SectionHeader
            eyebrow="Direct Support"
            title="Verified Performance Rewards"
            description="Fans and sponsors pledge money to athletes for specific achievements. Payouts only happen when officials verify the result."
          />
          <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.02] p-2">
            <div className="pointer-events-none grid gap-4 opacity-30 blur-[2px] md:grid-cols-3 select-none">
              {[1, 2, 3].map(i => (
                <div key={i} className="glass-panel h-[280px] rounded-2xl border border-white/10 bg-white/5 p-6">
                  <div className="h-4 w-1/3 rounded bg-white/20 mb-4"></div>
                  <div className="h-8 w-2/3 rounded bg-white/20 mb-4"></div>
                  <div className="h-24 w-full rounded bg-white/10"></div>
                </div>
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#05070A]/60 p-6 text-center backdrop-blur-sm">
              <div className="mb-4 rounded-full bg-white/10 p-4">
                <Wallet className="size-8 text-[var(--goal-emerald)]" />
              </div>
              <h3 className="font-heading text-2xl font-black text-white">Unlock Live Challenges</h3>
              <p className="mt-2 max-w-sm text-sm text-slate-300">Sign in to view real-time performance challenges, pledge support to your favorite athletes, and track verified payouts.</p>
              <Button className="mt-6" onClick={() => router.push('/login')}>Sign in to view</Button>
            </div>
          </div>
        </motion.section>

        {/* 6. GoalPlace Points */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp} className="grid gap-8 lg:grid-cols-2">
          <div className="glass-panel relative overflow-hidden rounded-3xl p-8 md:p-12">
            <div className="absolute -right-20 -top-20 size-64 rounded-full bg-[var(--goal-gold)]/20 blur-[80px]"></div>
            <GoalPlacePointsBadge points={0} />
            <h2 className="mt-8 font-heading text-4xl font-black text-white">GoalPlace Points</h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">
              Earn loyalty and recognition points for supporting athletes, engaging with verified moments, and participating in the Annual Awards race. Your support has measurable impact.
            </p>
          </div>
          <div className="glass-panel relative overflow-hidden rounded-3xl p-8 md:p-12">
            <div className="absolute -left-20 -bottom-20 size-64 rounded-full bg-[var(--goal-mint)]/20 blur-[80px]"></div>
            <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-[var(--goal-gold)]/10 text-[var(--goal-gold)]">
              <Award className="size-7" />
            </div>
            <h2 className="font-heading text-4xl font-black text-white">Annual Awards</h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">
              Fans, athletes, teams, and leagues get a year-end spotlight. Your activity on the platform determines the nominees and the winners.
            </p>
          </div>
        </motion.section>

        {/* 7. League Verification (Locked Match Center) */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp} className="relative">
          <SectionHeader
            eyebrow="Official Data"
            title="League Verification"
            description="Verified league admins confirm match results, athlete appearances, and achievements so the data you see is 100% accurate."
          />
          <div className="relative overflow-hidden rounded-3xl border border-white/5 bg-white/[0.02] p-2">
            <div className="pointer-events-none flex gap-4 opacity-30 blur-[2px] select-none">
              {[1, 2, 3].map(i => (
                <div key={i} className="glass-panel h-[180px] w-[300px] rounded-2xl border border-white/10 bg-white/5 p-6"></div>
              ))}
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#05070A]/60 p-6 text-center backdrop-blur-sm">
              <div className="mb-4 rounded-full bg-white/10 p-4">
                <ShieldCheck className="size-8 text-[var(--goal-gold)]" />
              </div>
              <h3 className="font-heading text-2xl font-black text-white">Explore Verified Leagues</h3>
              <p className="mt-2 max-w-sm text-sm text-slate-300">Sign in to browse official fixtures, view verified match results, and see live league standings.</p>
              <Button className="mt-6" onClick={() => router.push('/login')}>Sign in to view</Button>
            </div>
          </div>
        </motion.section>

        {/* 8. Sponsor Impact */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp} className="glass-panel relative overflow-hidden rounded-3xl p-8 md:p-12">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--goal-gold)]/12 via-transparent to-[var(--goal-emerald)]/12" />
          <div className="relative z-10 grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-[var(--goal-gold)]">Sponsor Impact</p>
              <h2 className="mt-4 font-heading text-4xl font-black leading-tight text-white md:text-5xl">Local brands build real sporting infrastructure.</h2>
              <p className="mt-6 text-lg leading-relaxed text-slate-300">
                Sponsor athletes, teams, leagues, youth programs, or the Annual Awards with transparent demographic reporting and direct ROI.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button variant="gold" size="lg" onClick={() => router.push('/register?role=sponsor')}>Become a Sponsor</Button>
                <Button variant="outline" size="lg" onClick={() => router.push('/sponsors')}>View Packages</Button>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {sponsorPackages.slice(0, 4).map((item) => (
                <div key={item.name} className="rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-md">
                  <Building2 className="mb-4 size-6 text-[var(--goal-gold)]" />
                  <h3 className="font-heading text-lg font-black text-white">{item.name}</h3>
                  <p className="mt-1 text-sm font-bold text-[var(--goal-gold)]">{item.price}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.section>

        {/* 9. Trust and Compliance */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp as any}>
          <TrustNote />
        </motion.section>

        {/* 10. Final CTA */}
        <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp} className="relative overflow-hidden rounded-3xl border border-[var(--goal-emerald)]/30 bg-gradient-to-br from-[var(--goal-emerald)]/20 via-[#111827] to-[#111827] p-10 text-center md:p-20 shadow-[0_0_80px_rgba(0,196,106,0.1)]">
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-[var(--goal-emerald)]/50 bg-[var(--goal-emerald)]/20 text-[var(--goal-mint)]">
            <HeartHandshake className="size-8" />
          </div>
          <h2 className="mx-auto mt-8 max-w-4xl font-heading text-4xl font-black text-white md:text-6xl">Ready to shape the game in Uganda?</h2>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
            Join as a fan to support athletes, register as an athlete to build your profile, or help organize verified league activity.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button size="lg" className="h-14 px-8" onClick={() => router.push('/register?role=fan')}>Join as Fan</Button>
            <Button size="lg" variant="outline" className="h-14 px-8" onClick={() => router.push('/register?role=athlete')}>Register Athlete</Button>
            <Button size="lg" variant="secondary" className="h-14 px-8" onClick={() => router.push('/register?role=league-admin')}>Register League</Button>
          </div>
        </motion.section>
      </PageContainer>
    </div>
  );
}
