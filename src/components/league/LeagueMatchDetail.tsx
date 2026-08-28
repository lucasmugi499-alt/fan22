'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, teamsInLeague } from '@/lib/league/leagueContext';
import { matchOperationalRow } from '@/lib/league/operations';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoAssignment } from '@/components/ui/NoAssignment';
import { StateChip } from '@/components/league/LeagueCommandCentre';
import { AssignFieldManagerSheet } from '@/components/league/AssignFieldManagerSheet';
import { cn } from '@/lib/utils';

/**
 * One fixture, and everything a League Admin can do about it right now.
 *
 * Actions are contextual by state rather than a fixed row of buttons. Before kickoff the
 * question is who is recording it; while it is live the question is whether they still are;
 * afterwards the question is whether the result stands. Showing all three at once is how an
 * admin ends up clicking the wrong one on a touchline.
 */
export function LeagueMatchDetail({ matchId }: { matchId: string }) {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['leagues'] });
  const league = useMemo(
    () => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext),
    [userProfile, catalog.leagues, isDemoMode, accessContext],
  );
  const detail = useGoalPlaceData({
    collections: ['teams', 'matches'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const [assigning, setAssigning] = useState(false);

  const match = detail.matches.find((entry) => entry.id === matchId);
  const row = useMemo(() => {
    if (!match || !league) return null;
    return matchOperationalRow({
      match,
      teams: teamsInLeague(league.id, detail.teams),
      now: new Date().toISOString(),
    });
  }, [detail.teams, league, match]);

  if (catalog.loading || detail.loading) return <DetailSkeleton />;
  if (!league) return <NoAssignment kind="league" />;
  if (!match || !row) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center">
          <p className="text-base font-semibold text-text-strong">This fixture is not in your league.</p>
          <p className="mt-1 text-sm text-muted">It may have been removed, or it belongs to another competition.</p>
        </div>
      </div>
    );
  }

  const kickoff = new Intl.DateTimeFormat('en-UG', {
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
  }).format(new Date(row.scheduledAt));

  return (
    <div className="space-y-5">
      <BackLink />

      <header className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-text-strong sm:text-2xl">
              {row.homeTeamName}
              <span className="mx-2 text-subtle">v</span>
              {row.awayTeamName}
            </h1>
            <p className="mt-1 text-sm text-muted">{kickoff}</p>
            {row.venue ? <p className="text-sm text-muted">{row.venue}</p> : null}
          </div>
          <div className="shrink-0 text-right">
            {row.score ? (
              <p data-numeric className="text-3xl font-bold tabular-nums text-text-strong">
                {row.score.home}–{row.score.away}
              </p>
            ) : null}
            <StateChip state={row.state} />
          </div>
        </div>
      </header>

      <section aria-label="Field operations" className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Field operations</p>
        <p className="mt-1.5 text-sm text-text">
          {row.fieldManager?.displayName
            ? <>Recorded by <span className="font-semibold text-text-strong">{row.fieldManager.displayName}</span>.</>
            : 'Nobody is assigned to record this match.'}
        </p>
        {row.attention ? (
          <p className="mt-1.5 text-sm leading-6 text-[var(--state-pending)]">{row.attention}</p>
        ) : null}
      </section>

      {/* Contextual: only what this state permits. */}
      <section aria-label="Actions" className="space-y-2">
        {(row.state === 'unassigned' || row.state === 'ready') ? (
          <ActionButton primary onClick={() => setAssigning(true)}>
            {row.fieldManager ? 'Replace Field Manager' : 'Assign Field Manager'}
          </ActionButton>
        ) : null}
        {row.state === 'live' ? (
          <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm leading-6 text-muted">
            This match is being recorded now. Events are captured by the Field Manager; the
            league does not edit a live event or clock.
          </p>
        ) : null}
        {row.state === 'needs_review' ? (
          <Link
            href="/league-admin/matches?filter=review"
            className="flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[var(--state-error)] px-4 text-sm font-semibold text-[var(--state-error)]"
          >
            Review exception
          </Link>
        ) : null}
        {row.state === 'official' ? (
          <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm leading-6 text-muted">
            This result is official. Standings are derived from it; a change requires a
            governed correction version rather than an edit.
          </p>
        ) : null}
      </section>

      <AssignFieldManagerSheet
        open={assigning}
        matchId={row.matchId}
        matchLabel={`${row.homeTeamName} v ${row.awayTeamName}`}
        kickoffLabel={kickoff}
        onClose={() => setAssigning(false)}
        onAssigned={() => window.location.reload()}
      />
    </div>
  );
}

function ActionButton({
  children,
  primary,
  onClick,
}: {
  children: React.ReactNode;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'min-h-11 w-full rounded-[var(--radius-md)] px-4 text-sm font-semibold transition',
        primary
          ? 'bg-brand text-[var(--on-brand)] hover:bg-brand-hover'
          : 'border border-border text-text-strong hover:border-border-strong',
      )}
    >
      {children}
    </button>
  );
}

function BackLink() {
  return (
    <Link
      href="/league-admin/matches"
      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted hover:text-text-strong"
    >
      <ArrowLeft className="h-4 w-4" /> Matches
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-6 w-24" />
      <Skeleton className="h-32 w-full rounded-[var(--radius-lg)]" />
      <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}
