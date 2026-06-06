'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

import Link from 'next/link';
import { Building01Icon, SecurityCheckIcon } from 'hugeicons-react';
import { Trophy, Users } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { getSportTheme } from '@/lib/sportThemes';
import { LeagueStatusBadge } from '@/components/ui/league';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge, TrustNote } from '@/components/ui/product';

export default function LeaguesPage() {
  const { athletes, leagues, matches, teams } = useGoalPlaceData();

  return (
    <ProtectedRoute>
      
    <PageContainer compact>
      <SectionHeader
        eyebrow="Leagues"
        title="Verified league network"
        description="Follow organized football, basketball, and rugby leagues across Uganda with fixture, verification, and athlete support context."
      />

      <div className="grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Leagues" value={String(leagues.length)} icon={Building01Icon} />
        <ImpactStatCard label="Teams" value={String(teams.length)} icon={Users} tone="gold" />
        <ImpactStatCard label="Matches" value={String(matches.length)} icon={Trophy} tone="blue" />
        <ImpactStatCard label="Verified athletes" value={String(athletes.filter((athlete) => athlete.verified).length)} icon={SecurityCheckIcon} tone="orange" />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {leagues.map((league) => {
          const theme = getSportTheme(league.sport);
          return (
            <Link key={league.id} href={`/leagues/${league.id}`} className={`glass-panel rounded-xl p-5 transition-all hover:-translate-y-1 ${theme.edgeClass}`}>
              <div className="flex flex-wrap items-center gap-2">
                <SportBadge sport={league.sport} />
                <LeagueStatusBadge status={league.status} />
              </div>
              <h2 className="mt-4 font-display text-2xl font-black text-white">{league.name}</h2>
              <p className="mt-2 text-sm text-slate-400">{league.city}, {league.country}</p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Mini label="GoalPlace Index" value={String(league.goalPlaceIndex)} />
                <Mini label="Complete" value={`${league.completionRate}%`} />
              </div>
            </Link>
          );
        })}
      </div>

      <section className="mt-8">
        <TrustNote />
      </section>
    </PageContainer>
  
    </ProtectedRoute>
);
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 font-display text-xl font-black text-white">{value}</p>
    </div>
  );
}
