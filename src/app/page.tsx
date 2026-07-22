'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { 
  ArrowRight01Icon, 
  Building03Icon, 
  CheckmarkCircle01Icon, 
  UserGroupIcon, 
  ChartLineData01Icon, 
  LockKeyIcon, 
  ZapIcon, 
  UserIcon, 
  Shield01Icon,
  Message01Icon,
  DashboardSquare01Icon
} from 'hugeicons-react';
import { Trophy, Users } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { PageContainer, SectionHeader } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';
import { SportsGlobe, MobileNetworkOrb } from '@/components/ui/globe';
import { SectionReveal } from '@/components/ui/section-reveal';
import { AnimatedStatCard } from '@/components/ui/animated-stat-card';
import { BentoCard, GlowCard } from '@/components/ui/glass-card';
import { MagneticButton } from '@/components/ui/magnetic-button';

// Pilot-stage figures. Keep these conservative and sourced — this page is the public
// claim surface for a product whose entire pitch is verified data.
const proofMetrics = [
  { label: 'Verified Leagues', value: 10, icon: Building03Icon },
  { label: 'Active Teams', value: 40, icon: Users },
  { label: 'Talent Network', value: 120, icon: UserIcon },
  { label: 'Matches Logged', value: 40, icon: Trophy },
  { label: 'Support Pledged', value: 60, icon: ZapIcon },
  { label: 'Sponsors Engaged', value: 15, icon: ChartLineData01Icon },
];

export default function PublicLandingPage() {
  const router = useRouter();
  const { authStatus } = useAuth();

  useEffect(() => {
    if (authStatus === 'logged_in') {
      router.replace('/home');
    }
  }, [authStatus, router]);

  // Only logged-in visitors get the spinner, and only for the moment before the redirect
  // above fires. Rendering the marketing page during `loading` is what puts the copy in
  // the server-rendered HTML — this is the public acquisition page, so it has to be
  // readable without JavaScript and indexable by crawlers.
  if (authStatus === 'logged_in') {
    return (
      <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center bg-[#05070A]">
        <div className="size-8 animate-spin rounded-full border-4 border-white/10 border-t-[var(--goal-emerald)]" />
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden bg-[#05070A]">
      {/* 1. Hero: Cinematic Sports Network */}
      <section className="relative isolate flex min-h-[calc(100svh-4rem)] items-center overflow-hidden">
        {/* Dynamic Backgrounds */}
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,rgba(0,196,106,0.15),transparent_50%)]" />
        <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(245,185,66,0.1),transparent_50%)]" />
        
        <PageContainer className="relative z-10 flex flex-col md:flex-row items-center gap-10">
          <div className="flex-1 space-y-8">
            {/* Hero entrance is CSS-driven (see `.animate-rise-in`) so the copy paints
                immediately instead of waiting on hydration. */}
            <div
              className="animate-rise-in inline-flex items-center gap-2 rounded-full border border-[var(--goal-emerald)]/30 bg-[var(--goal-emerald)]/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-[var(--goal-mint)] backdrop-blur-xl shadow-[0_0_20px_rgba(0,196,106,0.2)]"
            >
              <Shield01Icon className="size-4 animate-pulse" />
              <span>Verified Sports Layer</span>
            </div>

            <h1
              className="animate-rise-in font-display text-5xl font-black leading-[1.1] text-white md:text-6xl lg:text-7xl"
              style={{ animationDelay: '0.1s' }}
            >
              Where grassroots sport becomes <br className="hidden md:block" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-500">
                verified, visible, and fundable.
              </span>
            </h1>

            <p
              className="animate-rise-in max-w-2xl text-lg leading-relaxed text-slate-300 md:text-xl"
              style={{ animationDelay: '0.2s' }}
            >
              GoalPlace256 is the operating system for verified grassroots sport in Africa. We turn scattered match notes into professional digital records, connecting athletes to real opportunities.
            </p>

            <div
              className="animate-rise-in flex flex-col sm:flex-row gap-4 pt-4"
              style={{ animationDelay: '0.3s' }}
            >
              <MagneticButton 
                onClick={() => router.push('/register?role=league_admin')}
                className="group relative inline-flex min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--goal-mint)]/50 bg-gradient-to-r from-[var(--goal-emerald)] to-[var(--goal-mint)] px-6 py-3.5 text-base font-black text-[#031008] shadow-[0_0_30px_rgba(0,196,106,0.3)] transition-all hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(0,196,106,0.5)]"
              >
                Pilot with Your League <ArrowRight01Icon className="size-5 transition-transform group-hover:translate-x-1" />
              </MagneticButton>
              <Button size="lg" variant="outline" className="rounded-xl px-6 py-3.5 text-base" onClick={() => router.push('/register?role=athlete')}>
                Register as Athlete
              </Button>
            </div>
          </div>

          <div className="flex-1 w-full relative h-[400px] md:h-[600px] flex items-center justify-center">
            <MobileNetworkOrb />
            <div className="absolute inset-0 pointer-events-none hidden md:block">
              <SportsGlobe />
            </div>
            
            {/* Live-looking proof metrics floating over the globe */}
            <div
              className="animate-rise-in absolute hidden md:flex top-[15%] right-[10%] glass-panel rounded-xl p-3 items-center gap-3 backdrop-blur-xl border border-[var(--goal-emerald)]/30"
              style={{ animationDelay: '0.8s' }}
            >
              <div className="size-8 rounded-full bg-[var(--goal-emerald)]/20 flex items-center justify-center">
                <CheckmarkCircle01Icon className="size-4 text-[var(--goal-mint)]" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Live Verification</p>
                <p className="text-sm font-bold text-white">Match 025 Confirmed</p>
              </div>
            </div>

            <div
              className="animate-rise-in absolute hidden md:flex bottom-[20%] left-[5%] glass-panel rounded-xl p-3 items-center gap-3 backdrop-blur-xl border border-[var(--goal-gold)]/30"
              style={{ animationDelay: '1s' }}
            >
              <div className="size-8 rounded-full bg-[var(--goal-gold)]/20 flex items-center justify-center">
                <ZapIcon className="size-4 text-[var(--goal-gold)]" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Sponsor Impact</p>
                <p className="text-sm font-bold text-white">12 Pairs of Boots Funded</p>
              </div>
            </div>
          </div>
        </PageContainer>
      </section>

      <PageContainer className="space-y-32 pb-32">
        {/* 2. Problem Section */}
        <SectionReveal>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div>
              <SectionHeader
                eyebrow="The Current Reality"
                title="Grassroots sport is invisible."
                description="Millions of talented athletes play every week, but their records live in scattered WhatsApp groups and notebooks. Without verified data, talent remains hidden, and sponsors cannot trust where their money goes."
              />
              <ul className="mt-8 space-y-6">
                {[
                  { title: 'Lost Records', desc: 'Match results disappear in chat histories.', icon: Message01Icon },
                  { title: 'Invisible Athletes', desc: 'Scouts cannot find players without official stats.', icon: UserIcon },
                  { title: 'Sponsor Distrust', desc: 'Brands avoid funding due to lack of transparency.', icon: LockKeyIcon },
                ].map((point) => (
                  <li key={point.title} className="flex items-start gap-4">
                    <div className="mt-1 flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/5 border border-white/10 text-slate-400">
                      <point.icon className="size-5" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-white">{point.title}</h4>
                      <p className="mt-1 text-sm text-slate-400 leading-relaxed">{point.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="relative h-[400px] rounded-2xl border border-red-500/20 bg-gradient-to-br from-[#05070A] to-red-900/10 p-8 overflow-hidden flex items-center justify-center">
              <div className="absolute inset-0 bg-[url('/placeholders/noise.png')] opacity-10 mix-blend-overlay" />
              <div className="glass-panel w-full max-w-sm rounded-xl p-5 border border-red-500/30 transform rotate-[-2deg]">
                <div className="flex items-center gap-3 mb-4">
                  <div className="size-8 rounded-full bg-slate-800" />
                  <div className="h-4 w-24 rounded bg-slate-800" />
                </div>
                <div className="space-y-2">
                  <div className="h-3 w-full rounded bg-slate-800" />
                  <div className="h-3 w-5/6 rounded bg-slate-800" />
                  <div className="h-3 w-4/6 rounded bg-slate-800" />
                </div>
                <div className="mt-6 flex justify-center">
                  <span className="text-xs font-black uppercase tracking-widest text-red-500">Unverified Record</span>
                </div>
              </div>
            </div>
          </div>
        </SectionReveal>

        {/* 3. Bento Solution Grid */}
        <SectionReveal>
          <SectionHeader
            eyebrow="The Solution"
            title="A unified ecosystem for all."
            description="We provide specific, powerful tools for every participant in the grassroots sports network."
            className="text-center md:items-center mx-auto"
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[250px]">
            {/* Leagues */}
            <BentoCard className="md:col-span-2 md:row-span-2 bg-gradient-to-br from-[var(--goal-emerald)]/10 to-transparent border-[var(--goal-emerald)]/20 justify-end group">
              <div className="absolute top-6 left-6 size-12 rounded-xl bg-[var(--goal-emerald)]/20 flex items-center justify-center border border-[var(--goal-emerald)]/30 transition-transform group-hover:scale-110">
                <DashboardSquare01Icon className="size-6 text-[var(--goal-mint)]" />
              </div>
              <h3 className="font-display text-3xl font-black text-white">League Operations</h3>
              <p className="mt-3 text-base text-slate-300 max-w-md">Run a professional league with verified fixtures, instant standings, and automated sponsor reporting.</p>
            </BentoCard>

            {/* Athletes */}
            <BentoCard className="bg-gradient-to-bl from-blue-500/10 to-transparent border-blue-500/20 justify-end group">
              <div className="absolute top-6 right-6 size-10 rounded-xl bg-blue-500/20 flex items-center justify-center border border-blue-500/30 transition-transform group-hover:scale-110">
                <UserIcon className="size-5 text-blue-300" />
              </div>
              <h3 className="font-display text-xl font-black text-white">Athletes</h3>
              <p className="mt-2 text-sm text-slate-300">Build a verified portfolio backed by official league data.</p>
            </BentoCard>

            {/* Teams */}
            <BentoCard className="bg-gradient-to-tr from-purple-500/10 to-transparent border-purple-500/20 justify-end group">
              <div className="absolute top-6 left-6 size-10 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30 transition-transform group-hover:scale-110">
                <Users className="size-5 text-purple-300" />
              </div>
              <h3 className="font-display text-xl font-black text-white">Teams</h3>
              <p className="mt-2 text-sm text-slate-300">Manage rosters and submit match results effortlessly.</p>
            </BentoCard>

            {/* Sponsors */}
            <BentoCard className="md:col-span-2 bg-gradient-to-tl from-[var(--goal-gold)]/10 to-transparent border-[var(--goal-gold)]/20 justify-end group">
              <div className="absolute top-6 left-6 size-12 rounded-xl bg-[var(--goal-gold)]/20 flex items-center justify-center border border-[var(--goal-gold)]/30 transition-transform group-hover:scale-110">
                <ChartLineData01Icon className="size-6 text-[var(--goal-gold)]" />
              </div>
              <h3 className="font-display text-2xl font-black text-white">Sponsor Impact</h3>
              <p className="mt-2 text-base text-slate-300 max-w-lg">Fund grassroots sport with complete transparency. See exactly where your contribution goes with verified receipts.</p>
            </BentoCard>

            {/* Fans */}
            <BentoCard className="bg-white/5 border-white/10 justify-end group">
              <div className="absolute top-6 right-6 size-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20 transition-transform group-hover:scale-110">
                <UserGroupIcon className="size-5 text-white" />
              </div>
              <h3 className="font-display text-xl font-black text-white">Fans</h3>
              <p className="mt-2 text-sm text-slate-300">Support your local heroes directly.</p>
            </BentoCard>
          </div>
        </SectionReveal>

        {/* 4. Verification Story */}
        <SectionReveal>
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <div className="order-2 lg:order-1 relative h-[500px] flex flex-col justify-center gap-6">
              {[
                { step: '1', title: 'Result Submitted', desc: 'Team admin uploads final score and evidence.', align: 'self-start' },
                { step: '2', title: 'League Review', desc: 'League admin cross-checks with officials.', align: 'self-center' },
                { step: '3', title: 'Verified Signal', desc: 'Result becomes official and immutable.', align: 'self-end', glow: true },
              ].map((item, idx) => (
                <motion.div
                  key={item.step}
                  data-reveal
                  initial={{ opacity: 0, x: item.align === 'self-start' ? -50 : item.align === 'self-end' ? 50 : 0, y: item.align === 'self-center' ? 50 : 0 }}
                  whileInView={{ opacity: 1, x: 0, y: 0 }}
                  viewport={{ once: true, margin: '-20%' }}
                  transition={{ delay: idx * 0.2, duration: 0.6 }}
                  className={item.align}
                >
                  <GlowCard color={item.glow ? "var(--goal-emerald)" : "rgba(255,255,255,0.1)"} className="w-[300px]">
                    <div className="p-5 flex items-start gap-4">
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--goal-emerald)]/20 font-black text-[var(--goal-mint)]">
                        {item.step}
                      </span>
                      <div>
                        <h4 className="font-bold text-white">{item.title}</h4>
                        <p className="mt-1 text-xs text-slate-400">{item.desc}</p>
                      </div>
                    </div>
                  </GlowCard>
                </motion.div>
              ))}
            </div>
            <div className="order-1 lg:order-2">
              <SectionHeader
                eyebrow="The Core Engine"
                title="Trust through Verification."
                description="The entire platform is built around a rigorous verification engine. No more disputed scores. No more fake profiles. Just reliable, scoutable, fundable data."
              />
              <Button variant="outline" className="mt-6" onClick={() => router.push('/verification')}>
                Read Verification Policy
              </Button>
            </div>
          </div>
        </SectionReveal>

        {/* 5. Live Ecosystem Preview (Stats) */}
        <SectionReveal>
          <SectionHeader
            eyebrow="Where We Are Today"
            title="Pilot network, real records."
            description="Early numbers from leagues already running on GoalPlace256."
            className="text-center md:items-center mx-auto"
          />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {proofMetrics.map((metric) => (
              <AnimatedStatCard key={metric.label} title={metric.label} value={metric.value} suffix="+" icon={metric.icon} />
            ))}
          </div>
        </SectionReveal>

        {/* 8. Pilot CTA */}
        <SectionReveal>
          <div className="relative overflow-hidden rounded-3xl border border-[var(--goal-emerald)]/30 bg-gradient-to-b from-[var(--goal-emerald)]/10 to-[#05070A] p-8 md:p-16 text-center shadow-[0_0_80px_rgba(0,196,106,0.1)]">
            <div className="absolute inset-0 bg-[url('/placeholders/noise.png')] opacity-10 mix-blend-overlay" />
            <div className="relative z-10 max-w-2xl mx-auto">
              <Shield01Icon className="size-16 text-[var(--goal-mint)] mx-auto mb-6 drop-shadow-[0_0_15px_rgba(77,255,179,0.5)]" />
              <h2 className="font-display text-4xl font-black text-white md:text-5xl lg:text-6xl tracking-tight">
                Ready to professionalize your league?
              </h2>
              <p className="mt-6 text-lg text-slate-300 leading-relaxed">
                Join our 90-day pilot program to digitize your operations, verify your athletes, and attract sponsors with transparent reporting.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
                <MagneticButton 
                  onClick={() => router.push('/register?role=league_admin')}
                  className="group relative inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-black text-[#05070A] transition-all hover:bg-slate-200 hover:scale-105"
                >
                  Start Pilot Program <ArrowRight01Icon className="size-5 transition-transform group-hover:translate-x-1" />
                </MagneticButton>
                <Button size="lg" variant="outline" className="px-8 py-4 text-base rounded-xl" onClick={() => router.push('/sponsors')}>
                  I want to sponsor a league
                </Button>
              </div>
            </div>
          </div>
        </SectionReveal>
      </PageContainer>
    </div>
  );
}
