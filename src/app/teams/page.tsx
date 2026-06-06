'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Location01Icon, SecurityCheckIcon } from 'hugeicons-react';
import { Trophy, Users } from '@phosphor-icons/react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Button } from '@/components/ui/button';
import { VerificationBadge } from '@/components/ui/verification-badge';
import { EmptyState, ImpactStatCard, PageContainer, SectionHeader, SportBadge, StickyFilterBar } from '@/components/ui/product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { cn } from '@/lib/utils';
import { formatUGX, getSportTheme } from '@/lib/sportThemes';

const sportFilters = ['All', 'Football', 'Basketball', 'Rugby'];

function TeamsDirectory() {
  const router = useRouter();
  const { leagues, teams } = useGoalPlaceData();
  const [sportFilter, setSportFilter] = useState('All');
  const [cityFilter, setCityFilter] = useState('All');
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  const cities = useMemo(() => ['All', ...Array.from(new Set(teams.map((team) => team.city))).slice(0, 8)], [teams]);

  const filteredTeams = useMemo(
    () =>
      teams.filter((team) => {
        if (sportFilter !== 'All' && team.sport !== sportFilter) return false;
        if (cityFilter !== 'All' && team.city !== cityFilter) return false;
        if (verifiedOnly && !team.verified) return false;
        return true;
      }),
    [cityFilter, sportFilter, teams, verifiedOnly]
  );

  const totalSupport = filteredTeams.reduce((sum, team) => sum + (team.supportPool ?? team.totalSupport ?? 0), 0);
  const totalSupporters = filteredTeams.reduce((sum, team) => sum + (team.supportersCount ?? 0), 0);

  return (
    <PageContainer compact>
      <SectionHeader
        eyebrow="Teams"
        title="Teams"
        description="Browse verified and emerging teams across football, basketball, and rugby, then jump into their league context or team profile."
      />

      <section className="grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Teams shown" value={String(filteredTeams.length)} icon={Users} />
        <ImpactStatCard label="Verified" value={String(filteredTeams.filter((team) => team.verified).length)} icon={SecurityCheckIcon} tone="blue" />
        <ImpactStatCard label="Support total" value={formatUGX(totalSupport)} icon={Trophy} tone="gold" />
        <ImpactStatCard label="Supporters" value={String(totalSupporters)} icon={Users} tone="orange" />
      </section>

      <section className="mt-6 space-y-3">
        <StickyFilterBar filters={sportFilters} active={sportFilter} onChange={setSportFilter} />
        <div className="flex flex-wrap items-center gap-2">
          {cities.map((city) => (
            <Button
              key={city}
              size="sm"
              variant={cityFilter === city ? 'default' : 'outline'}
              onClick={() => setCityFilter(city)}
            >
              {city}
            </Button>
          ))}
          <Button
            size="sm"
            variant={verifiedOnly ? 'secondary' : 'outline'}
            onClick={() => setVerifiedOnly((value) => !value)}
          >
            <SecurityCheckIcon className="size-4" />
            Verified only
          </Button>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredTeams.map((team) => {
          const league = leagues.find((item) => item.id === team.leagueId);
          const theme = getSportTheme(team.sport);
          const form = team.recentResults ?? ['W', 'D', 'L'];

          return (
            <article key={team.id} className={cn('rounded-xl border border-white/10 bg-white/[0.045] p-4', theme.edgeClass)}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <SportBadge sport={team.sport} />
                  <h2 className="mt-3 font-display text-2xl font-black text-white">{team.name}</h2>
                  <p className="mt-1 flex items-center gap-1 text-sm text-slate-400">
                    <Location01Icon className="size-4" />
                    {team.city}
                  </p>
                </div>
                {team.verified && <VerificationBadge />}
              </div>

              <div className="rounded-lg border border-white/8 bg-black/20 p-3">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">League</p>
                <p className="mt-1 text-sm font-bold text-white">{league?.name ?? 'Independent team'}</p>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/8 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--goal-mint)]">Support</p>
                  <p className="mt-1 font-display text-lg font-black text-white">{formatUGX(team.supportPool ?? team.totalSupport ?? 0)}</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/5 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">Supporters</p>
                  <p className="mt-1 font-display text-lg font-black text-white">{team.supportersCount}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-bold text-slate-300">
                  {team.wins}W {team.draws ?? 0}D {team.losses}L
                </p>
                <div className="flex gap-1">
                  {form.map((item, index) => (
                    <span key={`${team.id}-${item}-${index}`} className="flex size-6 items-center justify-center rounded-md border border-white/10 bg-black/25 text-[10px] font-black text-white">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button onClick={() => router.push(`/teams/${team.id}`)}>View Team</Button>
                <Button variant="outline" onClick={() => router.push(`/leagues/${team.leagueId}`)}>View League</Button>
              </div>
            </article>
          );
        })}
      </section>

      {!filteredTeams.length && (
        <div className="mt-8">
          <EmptyState
            title="No teams match these filters"
            description="Try a different sport, city, or verification filter to keep browsing the team network."
            onReset={() => {
              setSportFilter('All');
              setCityFilter('All');
              setVerifiedOnly(false);
            }}
          />
        </div>
      )}
    </PageContainer>
  );
}

export default function TeamsPage() {
  return (
    <ProtectedRoute>
      <TeamsDirectory />
    </ProtectedRoute>
  );
}
