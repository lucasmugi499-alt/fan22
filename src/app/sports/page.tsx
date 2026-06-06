'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { SportSlug, getSportTheme, sports } from '@/lib/sportThemes';
import { buttonVariants } from '@/components/ui/button';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge, TrustNote } from '@/components/ui/product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';

function normalizeSport(slug?: string) {
  if (slug === 'basketball') return 'Basketball';
  if (slug === 'rugby') return 'Rugby';
  return 'Football';
}

export default function SportsPage() {
  const searchParams = useSearchParams();
  const { athletes, challenges, matches } = useGoalPlaceData();
  const selectedSport = normalizeSport(searchParams.get('sport') ?? undefined);
  const theme = getSportTheme(selectedSport);
  const sportAthletes = athletes.filter((athlete) => athlete.sport === selectedSport);
  const sportMatches = matches.filter((match) => match.sport === selectedSport);
  const sportChallenges = challenges.filter((challenge) => sportAthletes.some((athlete) => athlete.id === challenge.athleteId));

  return (
    <PageContainer compact>
      <SectionHeader
        eyebrow="Sports"
        title="Sports ecosystem"
        description="Football, basketball, and rugby each get sport-specific cards, stats, challenges, fallbacks, and discovery paths."
      />

      <div className="mb-6 hide-scrollbar flex gap-2 overflow-x-auto">
        {sports.map((sport) => (
          <Link key={sport.slug} href={`/sports?sport=${sport.slug as SportSlug}`} className={buttonVariants({ variant: sport.name === selectedSport ? 'default' : 'outline', size: 'sm' })}>
            {sport.name}
          </Link>
        ))}
      </div>

      <section className={`glass-panel relative overflow-hidden rounded-xl p-5 md:p-8 ${theme.edgeClass}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${theme.mutedGradient} opacity-70`} />
        <div className="relative z-10">
          <SportBadge sport={selectedSport} />
          <h1 className="mt-4 font-heading text-4xl font-black text-white md:text-6xl">{selectedSport}</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300">
            Track athletes, fixtures, verified challenges, and community activity across Uganda&apos;s {selectedSport.toLowerCase()} scene.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link className={buttonVariants()} href={`/athletes?filter=${theme.slug}`}>
              Explore Athletes
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href="/matches">
              View Matches
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Athletes" value={String(sportAthletes.length)} />
        <ImpactStatCard label="Matches" value={String(sportMatches.length)} tone="gold" />
        <ImpactStatCard label="Active challenges" value={String(sportChallenges.filter((challenge) => challenge.status === 'Active').length)} tone="blue" />
        <ImpactStatCard label="Verified support" value={`${sportAthletes.reduce((sum, athlete) => sum + athlete.totalEarnings, 0).toLocaleString()} UGX`} tone="orange" />
      </section>

      <section className="mt-10 grid gap-8 lg:grid-cols-2">
        <div>
          <SectionHeader eyebrow="Stats" title="Stat language" />
          <div className="grid gap-3 sm:grid-cols-2">
            {theme.statLabels.map((label) => (
              <div key={label} className="glass-panel rounded-xl p-4">
                <p className="font-heading text-lg font-black text-white">{label}</p>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionHeader eyebrow="Challenges" title="Challenge examples" />
          <div className="grid gap-3">
            {theme.challengeExamples.map((challenge) => (
              <div key={challenge} className="glass-panel flex items-center justify-between rounded-xl p-4">
                <p className="font-heading text-lg font-black text-white">{challenge}</p>
                <ArrowRight className="size-4" style={{ color: theme.color }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-10">
        <TrustNote />
      </section>
    </PageContainer>
  );
}
