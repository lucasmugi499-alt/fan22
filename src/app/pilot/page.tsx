'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Building03Icon, CheckmarkCircle01Icon, ChartLineData01Icon, Shield01Icon, ZapIcon, Coins01Icon } from 'hugeicons-react';
import { Button } from '@/components/ui/button';
import { PageContainer, SectionHeader } from '@/components/ui/product';
import { toast } from 'sonner';

export default function PilotProgramPage() {
  const router = useRouter();

  const pilotStructure = [
    'Onboard League Admin',
    'Add Teams',
    'Invite Team Admins',
    'Complete Rosters',
    'Publish Fixtures',
    'Submit Results',
    'Verify Results',
    'Generate Sponsor Report',
  ];

  const successMetrics = [
    { label: 'Teams onboarded', icon: CheckmarkCircle01Icon },
    { label: 'Team admins activated', icon: CheckmarkCircle01Icon },
    { label: 'Athlete profiles completed', icon: CheckmarkCircle01Icon },
    { label: 'Fixtures published', icon: CheckmarkCircle01Icon },
    { label: 'Results verified', icon: CheckmarkCircle01Icon },
    { label: 'Sponsor report delivered', icon: CheckmarkCircle01Icon },
    { label: 'Fan support activity', icon: CheckmarkCircle01Icon },
    { label: 'Dispute resolution time', icon: CheckmarkCircle01Icon },
  ];

  const revenueModel = [
    { title: 'League SaaS', detail: 'Subscription fees for the grassroots operating system (Future phase).', icon: Building03Icon },
    { title: 'Sponsor Packages', detail: 'Direct brand sponsorships driven by transparent impact reporting with a platform cut.', icon: ChartLineData01Icon },
    { title: 'Data & Scouting Access', detail: 'Verified performance data access for international scouts and academies (Future phase).', icon: ZapIcon },
    { title: 'Event Sponsorship', detail: 'Title sponsorship for Annual Awards and key tournaments.', icon: Shield01Icon },
  ];

  return (
    <div className="w-full overflow-hidden bg-[#05070A]">
      <PageContainer className="relative z-10 pb-20 pt-12 md:pb-24 md:pt-20">
        <div className="mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="mb-6 inline-flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-blue-300"
          >
            <Shield01Icon className="size-4" />
            Investor Readiness
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.05 }}
            className="font-display text-4xl font-black leading-tight text-white md:text-6xl"
          >
            90-Day GoalPlace256 Pilot
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.1 }}
            className="mx-auto mt-6 max-w-2xl text-base leading-7 text-slate-300 md:text-xl md:leading-9"
          >
            <strong>Goal:</strong> Validate GoalPlace256 as the operating system for grassroots sports leagues. Prove that a local league can successfully onboard teams, let Team Admins manage rosters, publish fixtures, verify results, and generate transparent sponsor reports.
          </motion.p>
        </div>

        <div className="mt-16 grid gap-8 lg:grid-cols-2">
          {/* Structure Section */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:p-10">
            <h2 className="font-display text-2xl font-black text-white">Pilot Structure</h2>
            <ul className="mt-6 space-y-4">
              {pilotStructure.map((item, i) => (
                <li key={i} className="flex items-start gap-4 text-base leading-6 text-slate-200">
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-[var(--goal-mint)]">
                    {i + 1}
                  </div>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Success Metrics Section */}
          <section className="rounded-2xl border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/5 p-6 md:p-10">
            <h2 className="font-display text-2xl font-black text-[var(--goal-mint)]">Pilot Success Metrics</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {successMetrics.map((metric) => {
                const Icon = metric.icon;
                return (
                  <div key={metric.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-medium text-slate-200">
                    <Icon className="size-4 shrink-0 text-[var(--goal-mint)]" />
                    <span>{metric.label}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Revenue Model Section */}
        <section className="mt-12 rounded-2xl border border-white/10 bg-[#0B1117] p-6 md:p-12">
          <SectionHeader
            eyebrow="Business Model"
            title="Revenue Model Preview"
            description="How GoalPlace256 scales from a trusted operating layer into a sustainable business."
            className="text-center"
          />
          <div className="mx-auto mt-10 grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {revenueModel.map((model) => {
              const Icon = model.icon;
              return (
                <div key={model.title} className="rounded-xl border border-white/10 bg-white/5 p-5 text-left">
                  <Icon className="mb-4 size-6 text-[var(--goal-gold)]" />
                  <h3 className="font-display text-lg font-black text-white">{model.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-400">{model.detail}</p>
                </div>
              );
            })}
          </div>
        </section>

        <div className="mt-16 text-center">
          <Button size="lg" className="px-10" onClick={() => toast.success('Pilot partnership inquiry initiated in demo mode.')}>
            Discuss Pilot Partnership
          </Button>
        </div>
      </PageContainer>
    </div>
  );
}
