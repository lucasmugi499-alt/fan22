'use client';

import React, { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Award,
  Building2,
  CheckCircle2,
  HeartHandshake,
  LineChart,
  LockKeyhole,
  ShieldCheck,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge, TrustNote } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';
import { sponsorPackages } from '@/data/sponsorPackages';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { sports } from '@/lib/sportThemes';

const heroImage = '/images/goalplace256-hero.png';

const howItWorks = [
  {
    title: 'Discover verified sport',
    detail: 'Follow football, basketball, and rugby athletes, teams, fixtures, and league updates in one place.',
    icon: Trophy,
  },
  {
    title: 'Support real needs',
    detail: 'Fans and sponsors support athletes directly, with transparent context around teams, matches, and impact.',
    icon: HeartHandshake,
  },
  {
    title: 'Verify performance',
    detail: 'League admins and officials confirm results before standings, challenges, and awards signals update.',
    icon: ShieldCheck,
  },
];

export default function PublicLandingPage() {
  const router = useRouter();
  const { authStatus } = useAuth();
  const { athletes, leagues, matches } = useGoalPlaceData();

  useEffect(() => {
    if (authStatus === 'logged_in') {
      router.replace('/home');
    }
  }, [authStatus, router]);

  const totals = useMemo(
    () => ({
      athletes: athletes.length,
      leagues: leagues.length,
      matches: matches.length,
      support: athletes.reduce((sum, athlete) => sum + (athlete.totalEarnings ?? athlete.totalSupport ?? 0), 0),
    }),
    [athletes, leagues, matches]
  );

  if (authStatus === 'loading' || authStatus === 'logged_in') {
    return (
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center bg-[#05070A]">
        <div className="size-8 animate-spin rounded-full border-4 border-white/10 border-t-[var(--goal-emerald)]" />
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden bg-[#05070A]">
      <section className="relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,#05070A_0%,rgba(5,7,10,0.88)_34%,rgba(5,7,10,0.54)_68%,rgba(5,7,10,0.84)_100%)]" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-[#05070A] to-transparent" />

        <PageContainer className="relative z-10 pb-10 pt-12 md:pb-14 md:pt-16">
          <div className="max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="mb-5 inline-flex items-center gap-2 rounded-lg border border-white/12 bg-black/35 px-3 py-2 text-[11px] font-black uppercase tracking-[0.2em] text-[var(--goal-mint)] backdrop-blur-xl"
            >
              <Zap className="size-4" />
              Uganda&apos;s verified sports support platform
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05 }}
              className="font-heading text-5xl font-black leading-[0.92] text-white md:text-7xl lg:text-8xl"
            >
              GoalPlace256
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="mt-6 max-w-2xl text-base leading-7 text-slate-200 md:text-xl md:leading-9"
            >
              The mobile-first home for Ugandan football, basketball, and rugby, connecting verified athletes, teams, leagues, fans, and sponsors without letting paid tools affect sporting rankings.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.15 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            >
              <Button size="lg" onClick={() => router.push('/register?role=fan')}>
                Join as Fan
                <ArrowRight className="size-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/register?role=athlete')}>
                Register Athlete
              </Button>
              <Button size="lg" variant="secondary" onClick={() => router.push('/register?role=league-admin')}>
                Register League
              </Button>
              <Button size="lg" variant="gold" onClick={() => router.push('/register?role=sponsor')}>
                Become Sponsor
              </Button>
            </motion.div>
          </div>

          <div className="mt-12 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ImpactStatCard label="Verified athletes" value={String(totals.athletes)} icon={Users} />
            <ImpactStatCard label="League network" value={String(totals.leagues)} icon={ShieldCheck} tone="blue" />
            <ImpactStatCard label="Match records" value={String(totals.matches)} icon={Trophy} tone="gold" />
            <ImpactStatCard label="Support tracked" value={`${Math.round(totals.support / 1000000)}M UGX`} icon={HeartHandshake} tone="orange" />
          </div>
        </PageContainer>
      </section>

      <PageContainer className="space-y-20 pb-28 md:space-y-24">
        <section id="about" className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <SectionHeader
            eyebrow="About"
            title="A league-aware platform, not a scoreboard skin."
            description="GoalPlace256 separates public sporting records from platform quality signals, so fans can trust what they see and athletes can build opportunity around verified activity."
          />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['Standings', 'Match results only.'],
              ['GoalPlace Index', 'Verification, activity, media, support, and admin reliability.'],
              ['Awards', 'Recognition based on verified participation and community impact.'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <CheckCircle2 className="mb-4 size-5 text-[var(--goal-mint)]" />
                <h3 className="font-heading text-lg font-black text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how-it-works">
          <SectionHeader
            eyebrow="How It Works"
            title="From matchday moments to verified opportunity."
            description="Fans get discovery and recognition. Athletes get visibility. Leagues get a structured operating layer. Sponsors get measurable impact."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {howItWorks.map((item, index) => {
              const Icon = item.icon;
              return (
                <div key={item.title} className="rounded-xl border border-white/10 bg-white/[0.045] p-5">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex size-11 items-center justify-center rounded-lg border border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/10 text-[var(--goal-mint)]">
                      <Icon className="size-5" />
                    </div>
                    <span className="font-heading text-3xl font-black text-white/12">{index + 1}</span>
                  </div>
                  <h3 className="font-heading text-xl font-black text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{item.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="Sports Covered"
            title="Built for football, basketball, and rugby."
            description="Each sport gets its own stats, challenge examples, athlete profiles, match language, and discovery paths."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {sports.map((sport) => {
              const Icon = sport.icon;
              return (
                <div key={sport.slug} className={`relative overflow-hidden rounded-xl border border-white/10 bg-white/5 p-5 ${sport.edgeClass}`}>
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${sport.gradient}`} />
                  <Icon className="mb-5 size-8" style={{ color: sport.color }} />
                  <SportBadge sport={sport.name} />
                  <h3 className="mt-4 font-heading text-2xl font-black text-white">{sport.name}</h3>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {sport.challengeExamples.map((item) => (
                      <span key={item} className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-xs font-bold text-slate-300">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <SectionHeader
              eyebrow="Sponsor Impact"
              title="Give local support a boardroom-quality report."
              description="Sponsors can fund athlete support, team operations, league infrastructure, youth programs, and annual awards with transparent reporting."
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="gold" onClick={() => router.push('/register?role=sponsor')}>
                Become a Sponsor
              </Button>
              <Button variant="outline" onClick={() => router.push('/sponsors')}>
                View Packages
              </Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {sponsorPackages.slice(0, 4).map((item) => (
              <div key={item.name} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <Building2 className="mb-4 size-5 text-[var(--goal-gold)]" />
                <h3 className="font-heading text-lg font-black text-white">{item.name}</h3>
                <p className="mt-1 text-sm font-black text-[var(--goal-gold)]">{item.price}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <ImpactStatCard label="Trust layer" value="Rules-first" detail="Open writes are blocked. Admin actions require role claims." icon={LockKeyhole} />
          <ImpactStatCard label="Quality signal" value="Separate" detail="GoalPlace Index never changes match-result standings." icon={LineChart} tone="blue" />
          <ImpactStatCard label="Recognition" value="Annual" detail="Awards eligibility is tied to verified activity and community participation." icon={Award} tone="gold" />
        </section>

        <TrustNote />

        <section className="relative overflow-hidden rounded-xl border border-[var(--goal-emerald)]/25 bg-white/[0.045] p-6 text-center md:p-10">
          <h2 className="mx-auto max-w-3xl font-heading text-3xl font-black text-white md:text-5xl">
            Ready to build the verified future of Ugandan sport?
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
            Start as a fan, athlete, league admin, or sponsor. The app experience opens after login.
          </p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={() => router.push('/register')}>
              Sign Up
            </Button>
            <Button size="lg" variant="outline" onClick={() => router.push('/login')}>
              Login
            </Button>
          </div>
        </section>
      </PageContainer>
    </div>
  );
}
