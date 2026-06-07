'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

import React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft01Icon, Calendar01Icon, SecurityCheckIcon } from 'hugeicons-react';
import { Trophy, Users } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { buildLeagueStandings } from '@/lib/leagueModel';
import { getSportTheme } from '@/lib/sportThemes';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthProvider';
import { hasRole, canViewLeagueAdminDashboard, canViewPlatformAdminDashboard, canManageLeague } from '@/lib/auth/permissions';
import { toast } from 'sonner';
import { GoalPlaceIndexPanel, LeagueIntegrityNote, LeagueStandingsTable, LeagueStatusBadge } from '@/components/ui/league';
import { MatchCard } from '@/components/ui/match-card';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge, TrustNote } from '@/components/ui/product';
import { canonicalEntityId } from '@/lib/idAliases';

function LeagueDetailPageContent() {
  const router = useRouter();
  const { leagueId } = useParams<{ leagueId: string }>();
  const data = useGoalPlaceData();
  const auth = useAuth();
  const authState = { authStatus: auth.authStatus, role: auth.role, userProfile: auth.userProfile };
  const resolvedLeagueId = canonicalEntityId(leagueId as string, 'league', 'l');
  const league = data.leagues.find((item) => item.id === leagueId || item.id === resolvedLeagueId);

  if (!league) {
    return (
      <PageContainer compact>
        <Link href="/leagues" className="text-sm font-bold text-[var(--goal-mint)]">Back to leagues</Link>
        <div className="glass-panel mt-6 rounded-xl p-8 text-center text-slate-300">League not found.</div>
      </PageContainer>
    );
  }

  const theme = getSportTheme(league.sport);
  const teams = data.teams.filter((team) => team.leagueId === league.id);
  const athletes = data.athletes.filter((athlete) => athlete.leagueId === league.id);
  const matches = data.matches.filter((match) => match.leagueId === league.id);
  const standings = buildLeagueStandings(teams, matches);

  return (
    <PageContainer compact>
      <Link href="/leagues" className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/7 px-3 py-2 text-sm font-bold text-white">
        <ArrowLeft01Icon className="size-4" />
        Back to Leagues
      </Link>
      <section className={`glass-panel rounded-xl p-5 md:p-8 ${theme.edgeClass}`}>
        <div className="flex flex-wrap items-center gap-2">
          <SportBadge sport={league.sport} />
          <LeagueStatusBadge status={league.status} />
        </div>
        <h1 className="mt-4 font-display text-4xl font-black text-white md:text-6xl">{league.name}</h1>
        <p className="mt-3 text-sm text-slate-400">{league.city}, {league.country}</p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => router.push(`/matches?league=${league.id}`)}>View Fixtures</Button>
          {hasRole(authState, 'fan') && (
            <>
              <Button variant="outline" onClick={() => toast.success('Followed league in demo mode.')}>Follow League</Button>
              <Button variant="outline" onClick={() => router.push(`/athletes?league=${league.id}`)}>Support Athletes</Button>
            </>
          )}
          {hasRole(authState, 'athlete') && (
            <>
              <Button variant="outline" onClick={() => router.push(`/athletes?league=${league.id}`)}>View Athletes</Button>
              <Button variant="outline" onClick={() => toast.success('Followed league in demo mode.')}>Follow League</Button>
            </>
          )}
          {canViewLeagueAdminDashboard(authState) && (
            <>
              <Button variant="outline" onClick={() => router.push(`/league-admin?league=${league.id}`)}>Admin Dashboard</Button>
            </>
          )}
          {canManageLeague(authState, league.id) && !hasRole(authState, 'platform_admin') && !hasRole(authState, 'super_admin') && (
            <>
              <Button variant="outline" onClick={() => router.push(`/league-admin?league=${league.id}`)}>Manage League</Button>
            </>
          )}
          {canViewPlatformAdminDashboard(authState) && (
            <>
              <Button variant="outline" onClick={() => router.push(`/admin?tab=Leagues&league=${league.id}`)}>Review League</Button>
            </>
          )}
        </div>
      </section>

      <div className="mt-8 grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Teams" value={String(teams.length)} icon={Users} />
        <ImpactStatCard label="Athletes" value={String(athletes.length)} icon={Trophy} tone="gold" />
        <ImpactStatCard label="Matches" value={String(matches.length)} icon={Calendar01Icon} tone="blue" />
        <ImpactStatCard label="Verified" value={`${league.verifiedPercentage}%`} icon={SecurityCheckIcon} tone="orange" />
      </div>

      <section className="mt-8 grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
        <div>
          <SectionHeader
            eyebrow="League Standings"
            title="Sporting table"
            description="The table is calculated from completed match scores only."
          />
          <LeagueStandingsTable standings={standings} />
          <LeagueIntegrityNote className="mt-4" />
        </div>
        <GoalPlaceIndexPanel league={league} />
      </section>

      <section className="mt-8">
        <SectionHeader eyebrow="Teams" title="League teams" />
        <div className="grid gap-4 md:grid-cols-3">
          {teams.map((team) => (
            <button key={team.id} className="glass-panel rounded-xl p-5 text-left" onClick={() => router.push(`/teams/${team.id}`)}>
              <SportBadge sport={team.sport} />
              <h2 className="mt-4 font-display text-xl font-black text-white">{team.name}</h2>
              <p className="mt-2 text-sm text-slate-400">{team.location}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader eyebrow="Fixtures" title="League fixtures" />
        <div className="grid gap-4 md:grid-cols-3">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} onView={() => router.push(`/matches/${match.id}`)} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <TrustNote compact />
      </section>
    </PageContainer>
  );
}

export default function LeagueDetailPage() {
  return (
    <ProtectedRoute>
      <LeagueDetailPageContent />
    </ProtectedRoute>
  );
}
