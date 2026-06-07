'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { ArrowRight01Icon, Building03Icon, CheckmarkCircle01Icon, UserGroupIcon, ChartLineData01Icon, LockKeyIcon, SecurityCheckIcon, ZapIcon, UserIcon, Shield01Icon } from 'hugeicons-react';
import { Trophy, Users } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { ImpactStatCard, PageContainer, SectionHeader, TrustNote } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';

const heroImage = '/images/goalplace256-hero.png';

const proofMetrics = [
  { label: 'Leagues mapped', value: '10', icon: Building03Icon, tone: 'blue' as const },
  { label: 'Teams', value: '40', icon: Users, tone: 'emerald' as const },
  { label: 'Athletes', value: '120', icon: UserIcon, tone: 'emerald' as const },
  { label: 'Matches', value: '40', icon: Trophy, tone: 'gold' as const },
  { label: 'Support challenges', value: '60', icon: ZapIcon, tone: 'orange' as const },
  { label: 'Sponsor packages', value: '15', icon: ChartLineData01Icon, tone: 'gold' as const },
];

const roleValues = [
  {
    role: 'For Leagues',
    title: 'Run a credible league.',
    points: ['manage teams and athletes', 'publish fixtures and results', 'verify match outcomes', 'resolve disputes', 'build sponsor-ready records', 'track GoalPlace Index'],
    ctaLabel: 'Pilot with Your League',
    ctaLink: '/register?role=league-admin',
    icon: Building03Icon,
  },
  {
    role: 'For Athletes',
    title: 'Build a verified sports profile.',
    points: ['showcase stats and highlights', 'receive fan support', 'track verified challenges', 'show progress and needs', 'build a credible athlete portfolio'],
    ctaLabel: 'Register as Athlete',
    ctaLink: '/register?role=athlete',
    icon: Trophy,
  },
  {
    role: 'For Fans',
    title: 'Support real athletes with visible impact.',
    points: ['follow local matches', 'support athletes', 'unlock GoalPlace Points', 'appear on supporter leaderboards', 'see how support helps with transport, boots, meals, training, and recovery'],
    ctaLabel: 'Join as Fan',
    ctaLink: '/register?role=fan',
    icon: UserGroupIcon,
  },
  {
    role: 'For Sponsors',
    title: 'Turn sponsorship into measurable community impact.',
    points: ['sponsor athletes, teams, or leagues', 'see what your funds supported', 'view engagement and reach', 'download monthly impact reports', 'support women and youth sport'],
    ctaLabel: 'Sponsor a League',
    ctaLink: '/sponsors',
    icon: ChartLineData01Icon,
  },
];

export default function PublicLandingPage() {
  const router = useRouter();
  const { authStatus } = useAuth();

  useEffect(() => {
    if (authStatus === 'logged_in') {
      router.replace('/home');
    }
  }, [authStatus, router]);

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
          className="absolute inset-0 bg-cover bg-center opacity-40"
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
              <ZapIcon className="size-4" />
              The trusted operating layer for grassroots sport in Uganda.
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05 }}
              className="font-display text-5xl font-black leading-[0.92] text-white md:text-7xl lg:text-8xl"
            >
              Verified leagues.<br />Visible athletes.<br />Measurable impact.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="mt-6 max-w-2xl text-base leading-7 text-slate-200 md:text-xl md:leading-9"
            >
              GoalPlace256 helps grassroots leagues run verified competitions, showcase athletes, and turn fan and sponsor support into transparent community impact.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.15 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"
            >
              <Button size="lg" onClick={() => router.push('/register?role=league-admin')}>
                Pilot with Your League
              </Button>
              <Button size="lg" variant="gold" onClick={() => router.push('/sponsors')}>
                Sponsor a League
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/register?role=fan')}>
                Join as Fan
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/register?role=athlete')}>
                Register as Athlete
              </Button>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.45, delay: 0.3 }}
              className="mt-6"
            >
              <Button variant="ghost" className="text-slate-400 hover:text-white" onClick={() => {
                document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' });
              }}>
                See How It Works <ArrowRight01Icon className="size-4 ml-2" />
              </Button>
            </motion.div>
          </div>

          <div className="mt-12 grid max-w-5xl gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {proofMetrics.map((metric) => (
              <ImpactStatCard key={metric.label} label={metric.label} value={metric.value} icon={metric.icon} tone={metric.tone} />
            ))}
          </div>
        </PageContainer>
      </section>

      <PageContainer className="space-y-20 pb-28 md:space-y-24">
        <section id="how-it-works">
          <SectionHeader
            eyebrow="The Ecosystem"
            title="A unified layer for grassroots sport."
            description="GoalPlace256 connects four key groups to build a verified and transparent sports ecosystem."
          />
          <div className="grid gap-4 md:grid-cols-2">
            {roleValues.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.role} className="rounded-xl border border-white/10 bg-white/[0.045] p-6 md:p-8">
                  <div className="mb-5 flex items-center justify-between">
                    <div className="flex size-11 items-center justify-center rounded-lg border border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/10 text-[var(--goal-mint)]">
                      <Icon className="size-5" />
                    </div>
                    <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--goal-mint)]">{item.role}</span>
                  </div>
                  <h3 className="font-display text-2xl font-black text-white">{item.title}</h3>
                  <ul className="mt-5 space-y-3">
                    {item.points.map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm leading-6 text-slate-300">
                        <CheckmarkCircle01Icon className="mt-1 size-4 shrink-0 text-white/40" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="mt-8 w-full sm:w-auto" variant={item.role === 'For Sponsors' ? 'gold' : 'default'} onClick={() => router.push(item.ctaLink)}>
                    {item.ctaLabel}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>

        <section id="why-verified-records-matter" className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
          <div>
            <SectionHeader
              eyebrow="The Problem"
              title="Why verified records matter"
              description="Grassroots sport often relies on scattered notes, Whatsapp groups, and unverified word-of-mouth. This breaks the ecosystem."
            />
            <ul className="mt-6 space-y-4">
              {[
                'Local sport lacks trusted records.',
                'Athletes lose visibility to fans and scouts.',
                'Sponsors cannot measure their true impact.',
                'Fans do not know where their support actually goes.',
              ].map((point) => (
                <li key={point} className="flex items-start gap-3 text-base leading-6 text-slate-200">
                  <LockKeyIcon className="mt-0.5 size-5 shrink-0 text-[var(--goal-mint)]" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[var(--goal-emerald)]/20 bg-gradient-to-br from-[#05070A] to-[var(--goal-emerald)]/10 p-6 md:p-10">
            <Shield01Icon className="mb-6 size-10 text-[var(--goal-mint)]" />
            <h3 className="font-display text-2xl font-black text-white">The GoalPlace256 Solution</h3>
            <p className="mt-3 text-base leading-7 text-slate-300">
              We create a <strong>verified operating layer</strong>. Everything from match results and athlete stats to support payouts and sponsor reports is tracked, verified, and transparent.
            </p>
            <div className="mt-8 rounded-xl border border-white/10 bg-black/40 p-5">
              <h4 className="font-bold text-[var(--goal-mint)]">Trust Statement</h4>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Paid support never affects league standings. Standings are based only on match results. The GoalPlace Index is separate and measures verification, activity, engagement, and operational quality.
              </p>
            </div>
          </div>
        </section>

        <section id="pilot-program" className="relative overflow-hidden rounded-xl border border-blue-500/30 bg-blue-500/10 p-6 text-center md:p-12">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.15),transparent_50%)]" />
          <div className="relative z-10">
            <span className="mb-4 inline-block rounded-full bg-blue-500/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-blue-300">
              Invest & Partner
            </span>
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-black text-white md:text-5xl">
              90-Day Pilot Program
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
              We are onboarding 1–3 local leagues to validate verified league operations, athlete profile creation, fan support behavior, and sponsor impact reporting.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" onClick={() => router.push('/pilot')}>
                Start a Pilot
              </Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/pilot')}>
                View Success Metrics
              </Button>
            </div>
          </div>
        </section>
      </PageContainer>
    </div>
  );
}
