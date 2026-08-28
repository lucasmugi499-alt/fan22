'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, teamsInLeague } from '@/lib/league/leagueContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoAssignment } from '@/components/ui/NoAssignment';
import { LeagueRoster } from '@/components/league/LeagueRoster';

/**
 * One club, as the league operates it.
 *
 * The roster is the point of this page. Everything else about a club — its results, its
 * standing — is derived from matches and is read elsewhere; what a League Admin comes here to
 * do is manage who is registered.
 */
export function LeagueTeamDetail({ teamId }: { teamId: string }) {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['leagues'] });
  const league = useMemo(
    () => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext),
    [userProfile, catalog.leagues, isDemoMode, accessContext],
  );
  const data = useGoalPlaceData({
    collections: ['teams', 'athletes'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 400,
  });

  if (catalog.loading || data.loading) {
    return <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />;
  }
  if (!league) return <NoAssignment kind="league" />;

  const leagueTeams = teamsInLeague(league.id, data.teams);
  const team = leagueTeams.find((entry) => entry.id === teamId);
  if (!team) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center">
          <p className="text-base font-semibold text-text-strong">This club is not in your league.</p>
        </div>
      </div>
    );
  }

  const roster = data.athletes
    .filter((athlete) => athlete.teamId === team.id)
    .sort((left, right) => {
      const leftNumber = (left as { squadNumber?: number }).squadNumber ?? 999;
      const rightNumber = (right as { squadNumber?: number }).squadNumber ?? 999;
      return leftNumber - rightNumber;
    });

  return (
    <div className="space-y-5">
      <BackLink />
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">Club</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          {team.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {[team.city, team.location].filter(Boolean).join(' · ')}
        </p>
      </header>

      <LeagueRoster
        team={team}
        athletes={roster}
        leagueTeams={leagueTeams}
        onChanged={data.retry}
      />
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/league-admin/teams"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-text-strong"
    >
      <ArrowLeft className="h-4 w-4" /> Teams
    </Link>
  );
}
