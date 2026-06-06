'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, HeartHandshake, LineChart, Medal, ShieldCheck, Users } from 'lucide-react';
import { sponsorPackages } from '@/lib/mockData';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { SponsorInterestModal } from '@/components/modals/app-modals';
import { Button } from '@/components/ui/button';
import { FeedCard } from '@/components/ui/feed-card';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge, TrustNote } from '@/components/ui/product';
import { formatUGX, getInitials } from '@/lib/sportThemes';

export default function SponsorsPage() {
  const router = useRouter();
  const [interestOpen, setInterestOpen] = useState(false);
  const { athletes, feedPosts } = useGoalPlaceData();

  return (
    <PageContainer compact>
      <section className="glass-panel relative overflow-hidden rounded-xl p-5 md:p-10">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--goal-gold)]/18 via-transparent to-[var(--goal-emerald)]/16" />
        <div className="relative z-10 max-w-4xl">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--goal-gold)]">Sponsors</p>
          <h1 className="mt-3 font-heading text-4xl font-black tracking-tight text-white md:text-6xl">Sponsor the future of Ugandan sport.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
            Fund athletes, teams, leagues, women and youth programs, or annual recognition with a sports-tech platform built for transparent impact.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button variant="gold" onClick={() => setInterestOpen(true)}>Become a Sponsor</Button>
            <Button variant="outline" onClick={() => document.getElementById('packages')?.scrollIntoView({ behavior: 'smooth' })}>View Packages</Button>
            <Button variant="outline" onClick={() => router.push('/athletes')}>Sponsor Athlete</Button>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Athletes supported" value="128" icon={HeartHandshake} />
        <ImpactStatCard label="Community reach" value="24k" icon={Users} tone="gold" />
        <ImpactStatCard label="Verified reports" value="426" icon={ShieldCheck} tone="blue" />
        <ImpactStatCard label="Monthly growth" value="+38%" icon={LineChart} tone="orange" />
      </section>

      <section id="packages" className="mt-10">
        <SectionHeader
          eyebrow="Packages"
          title="Sponsorship packages"
          description="Choose a package shaped around athlete support, team operations, league infrastructure, or recognition moments."
        />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {sponsorPackages.map((item) => (
            <div key={item.name} className="glass-panel flex flex-col rounded-xl p-5">
              <Building2 className="mb-5 size-6 text-[var(--goal-gold)]" />
              <h3 className="font-heading text-xl font-black text-white">{item.name}</h3>
              <p className="mt-2 text-sm font-black text-[var(--goal-gold)]">{item.price}</p>
              <p className="mt-3 flex-1 text-sm leading-6 text-slate-400">{item.detail}</p>
              <Button className="mt-5" variant="outline" onClick={() => setInterestOpen(true)}>Request Details</Button>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <SectionHeader eyebrow="Featured Talent" title="Sponsor-ready athletes" />
        <div className="grid gap-4 md:grid-cols-3">
          {athletes.slice(0, 3).map((athlete) => (
            <button key={athlete.id} className="glass-panel rounded-xl p-4 text-left transition-all hover:-translate-y-1" onClick={() => router.push(`/athletes/${athlete.id}`)}>
              <div className="flex items-center gap-3">
                <div className="size-14 overflow-hidden rounded-xl border border-white/10 bg-white/8">
                  <ImageWithFallback
                    src={athlete.avatarUrl}
                    alt={athlete.name}
                    fallbackType="athlete"
                    initials={getInitials(athlete.name)}
                    sport={athlete.sport}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <SportBadge sport={athlete.sport} />
                  <h3 className="mt-2 font-heading text-lg font-black text-white">{athlete.name}</h3>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-400">{athlete.bio}</p>
              <p className="mt-3 text-sm font-black text-[var(--goal-mint)]">{formatUGX(athlete.totalEarnings)} verified support</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-[0.85fr_1.15fr]">
        <div>
          <SectionHeader
            eyebrow="Impact Feed"
            title="Sponsor impact moments"
            description="Brands can show credible support without turning the product into advertising clutter."
          />
          <div className="glass-panel rounded-xl p-5">
            <Medal className="mb-4 size-7 text-[var(--goal-gold)]" />
            <h3 className="font-heading text-2xl font-black text-white">Annual Awards visibility</h3>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Sponsors can fund athlete recognition, youth development, women and youth sport impact, or league operations with transparent reporting.
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {feedPosts.filter((post) => post.type === 'SponsorImpact' || post.type === 'AnnualAwards').map((post) => (
            <FeedCard key={post.id} post={post} onViewProfile={() => router.push('/sponsors')} onComment={() => setInterestOpen(true)} onSupport={() => router.push('/athletes')} />
          ))}
        </div>
      </section>

      <section className="mt-10">
        <TrustNote />
      </section>

      <SponsorInterestModal open={interestOpen} onOpenChange={setInterestOpen} />
    </PageContainer>
  );
}
