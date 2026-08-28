'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, matchesInLeague, teamsInLeague } from '@/lib/league/leagueContext';
import { capturePolicyCopy, matchOperationalRow, segmentMatches } from '@/lib/league/operations';
import { currentSeasonFor } from '@/lib/season';
import { effectiveCapturePolicy } from '@/lib/capturePolicy';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoAssignment } from '@/components/ui/NoAssignment';
import { LeagueOperations } from '@/components/league/LeagueOperations';
import { FantasyActivationControl } from '@/components/fantasy/FantasyActivationControl';

/**
 * The competition workspace: what state the season is in, and what governs it.
 *
 * Progress is counted from matches rather than read from a stored total, so the numbers here
 * cannot drift away from the fixtures they describe.
 */
export function LeagueCompetition() {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['leagues', 'seasons'] });
  const league = useMemo(
    () => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext),
    [userProfile, catalog.leagues, isDemoMode, accessContext],
  );
  const detail = useGoalPlaceData({
    collections: ['teams', 'matches'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });

  const season = league ? currentSeasonFor(catalog.seasons, league.id, league.currentSeasonId) : null;

  const progress = useMemo(() => {
    if (!league) return null;
    const now = new Date().toISOString();
    const teams = teamsInLeague(league.id, detail.teams);
    const rows = matchesInLeague(league.id, detail.matches)
      .map((match) => matchOperationalRow({ match, teams, now }));
    return { counts: segmentMatches(rows), total: rows.length, teams: teams.length };
  }, [detail.matches, detail.teams, league]);

  if (catalog.loading || detail.loading) return <CompetitionSkeleton />;
  if (!league) return <NoAssignment kind="league" />;

  const policy = effectiveCapturePolicy(season?.capturePolicy, undefined);
  const copy = capturePolicyCopy(policy);

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">Competition</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          {league.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {[season?.name, String(league.sport)].filter(Boolean).join(' · ')}
        </p>
      </header>

      {progress ? (
        <section aria-label="Progress" className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
          <p className="text-sm text-text">
            <span className="font-semibold text-text-strong">{progress.teams}</span> clubs ·{' '}
            <span className="font-semibold text-text-strong">{progress.total}</span> fixtures ·{' '}
            <span className="font-semibold text-text-strong">{progress.counts.completed}</span> played ·{' '}
            <span className="font-semibold text-text-strong">{progress.counts.upcoming}</span> remaining
          </p>
          {progress.counts.review ? (
            <p className="mt-1.5 text-sm text-[var(--state-pending)]">
              {progress.counts.review} {progress.counts.review === 1 ? 'match needs' : 'matches need'} review.
            </p>
          ) : null}
        </section>
      ) : null}

      {/*
        The capture policy in human terms. The stored value is an enum and a League Admin is
        not required to learn it; what they need is what it means on a Saturday.
      */}
      <section aria-label="Result capture policy" className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Result capture</p>
        <p className="mt-1.5 text-base font-semibold text-text-strong">{copy.title}</p>
        <p className="mt-1 max-w-prose text-sm leading-6 text-muted">{copy.detail}</p>
      </section>

      <LeagueOperations league={league} season={season ?? undefined} onSaved={detail.retry} />

      <FantasyActivationControl mode="league" league={league} seasons={catalog.seasons} />
    </div>
  );
}

function CompetitionSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-2/3" />
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-[var(--radius-lg)]" />
      ))}
    </div>
  );
}
