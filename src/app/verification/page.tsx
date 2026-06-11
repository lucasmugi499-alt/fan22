'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Shield01Icon, CheckmarkBadge01Icon, LockKeyIcon, ArrowRight01Icon, Building03Icon, UserGroupIcon, ChartLineData01Icon } from 'hugeicons-react';
import { Trophy } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { PageContainer, SectionHeader } from '@/components/ui/product';

export default function VerificationPage() {
  const router = useRouter();

  const benefits = [
    {
      title: 'For Leagues',
      description: 'Replace scattered WhatsApp messages and paper records with a single, verifiable operating system that attracts sponsorship.',
      icon: Building03Icon,
    },
    {
      title: 'For Athletes',
      description: 'Ensure your talent is never invisible. Build a permanent, verified record of your career that future scouts and academies can trust.',
      icon: Trophy,
    },
    {
      title: 'For Sponsors',
      description: 'Stop guessing about community impact. Support verified athletes and leagues with traceable, transparent reporting.',
      icon: ChartLineData01Icon,
    },
    {
      title: 'For Fans',
      description: 'Follow real clubs, back real players, and see exactly how your support changes a player’s trajectory.',
      icon: UserGroupIcon,
    },
  ];

  return (
    <div className="w-full overflow-hidden bg-[#05070A]">
      <PageContainer className="relative z-10 pb-20 pt-12 md:pb-24 md:pt-20">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-lg border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-[var(--goal-mint)]">
            <Shield01Icon className="size-4" />
            The Trust Layer
          </div>
          <h1 className="font-display text-4xl font-black leading-tight text-white md:text-6xl">
            Why Verification Matters
          </h1>
          <p className="mx-auto mt-6 text-base leading-7 text-slate-300 md:text-xl md:leading-9">
            Grassroots sport suffers from missing records, manipulated stats, fake profiles, and poor sponsor reporting. We are fixing the infrastructure.
          </p>
        </div>

        <section className="mt-16 grid gap-8 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 md:p-12">
            <h2 className="font-display text-2xl font-black text-white">The old way is broken</h2>
            <p className="mt-4 text-slate-300">
              Today, local leagues run on paper records and Facebook pages. WhatsApp can communicate, but it cannot create trusted, historical records.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                'Talented athletes remain invisible',
                'Performance history is lost or disputed',
                'Scouts cannot trust unverified data',
                'Sponsors hesitate to fund unmeasurable impact'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-400">
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-400">✕</div>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-[var(--goal-emerald)]/20 bg-gradient-to-br from-[#0A0D14] to-[var(--goal-emerald)]/10 p-8 md:p-12">
            <h2 className="font-display text-2xl font-black text-white flex items-center gap-3">
              <CheckmarkBadge01Icon className="text-[var(--goal-mint)] size-8" />
              The GoalPlace256 standard
            </h2>
            <p className="mt-4 text-slate-300">
              We create reviewed, timestamped, accountable, and traceable records. We are the verified talent infrastructure layer.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                'League-approved match results',
                'Authenticated athlete profiles',
                'Transparent support payouts',
                'Immutable historical performance data'
              ].map((item, i) => (
                <li key={i} className="flex items-center gap-3 text-slate-200">
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--goal-emerald)]/20 text-[var(--goal-mint)]">✓</div>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mt-16">
          <SectionHeader
            eyebrow="Ecosystem Benefits"
            title="A rising tide lifts all boats"
            description="When records are trusted, the entire ecosystem unlocks new value."
          />
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-8">
            {benefits.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="rounded-xl border border-white/10 bg-[#0A0D14] p-6">
                  <Icon className="mb-4 size-6 text-[var(--goal-mint)]" />
                  <h3 className="font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">{item.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-16 rounded-2xl border border-blue-500/20 bg-blue-500/10 p-8 text-center md:p-16">
          <Shield01Icon className="mx-auto mb-6 size-12 text-blue-400" />
          <h2 className="font-display text-3xl font-black text-white md:text-4xl">
            &quot;Verified by GoalPlace256&quot;
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-300">
            This is the ultimate trust badge for leagues, athletes, teams, sponsors, and future scouts. It means the data is real, the athlete is verified, and the impact is measurable.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button size="lg" onClick={() => router.push('/register?role=league-admin')}>
              Verify Your League
            </Button>
            <Button size="lg" variant="outline" onClick={() => router.push('/register?role=athlete')}>
              Create Verified Profile
            </Button>
          </div>
        </section>
      </PageContainer>
    </div>
  );
}
