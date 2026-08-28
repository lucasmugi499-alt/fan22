'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, matchesInLeague, teamsInLeague } from '@/lib/league/leagueContext';
import {
  matchOperationalRow,
  segmentFor,
  segmentMatches,
  type LeagueMatchRow,
  type MatchSegment,
} from '@/lib/league/operations';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { NoAssignment } from '@/components/ui/NoAssignment';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { MatchRow } from '@/components/league/LeagueCommandCentre';
import { AssignFieldManagerSheet } from '@/components/league/AssignFieldManagerSheet';
import { LeagueFixtureBuilder } from '@/components/league/LeagueFixtureBuilder';
import { currentSeasonFor } from '@/lib/season';
import { cn } from '@/lib/utils';

const SEGMENTS: Array<{ id: MatchSegment; label: string }> = [
  { id: 'live', label: 'Live' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'review', label: 'Needs review' },
  { id: 'completed', label: 'Completed' },
];

/**
 * Every match in the league, in the four states a League Admin actually thinks in.
 *
 * The list this replaces was a single chronological run of fixtures, so answering "is anything
 * wrong today" meant reading all of them. Segments make the question one tap, and each row
 * carries its own operational readiness rather than deferring it to a detail page.
 *
 * Segments are a scrolling rail rather than a wrapping tab row: four labels plus counts do not
 * fit across 320px, and wrapping them pushes the first match below the fold.
 */
export function LeagueMatches() {
  const { userProfile, currentUser, isDemoMode, accessContext } = useAuth();
  const searchParams = useSearchParams();
  const catalog = useGoalPlaceData({ collections: ['leagues', 'seasons'] });
  const league = useMemo(
    () => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext),
    [userProfile, catalog.leagues, isDemoMode, accessContext],
  );

  /*
   * Teams and fixtures are loaded in both modes, not just demo: the fixture builder needs the
   * club list and the existing schedule to validate against, and those are client-readable.
   * Only the operational overlay — assignments and exceptions — requires the server model.
   */
  const leagueData = useGoalPlaceData({
    collections: ['teams', 'matches'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });

  const [rows, setRows] = useState<LeagueMatchRow[] | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState<string | null>(null);
  /*
   * The opening segment is derived from the deep link rather than set by an effect. The
   * Command Centre links here saying "1 fixture missing a Field Manager", and an effect that
   * corrected the segment after first paint would show the wrong list for a frame.
   */
  const linkedFilter = searchParams.get('filter');
  const [segment, setSegment] = useState<MatchSegment>(
    () => linkedFilter === 'review' ? 'review' : 'upcoming',
  );
  const [query, setQuery] = useState('');
  const [assigning, setAssigning] = useState<LeagueMatchRow | null>(null);
  const [building, setBuilding] = useState(() => searchParams.get('create') === 'fixture');

  const demoRows = useMemo(() => {
    if (!isDemoMode || !league) return null;
    const now = new Date().toISOString();
    const teams = teamsInLeague(league.id, leagueData.teams);
    return matchesInLeague(league.id, leagueData.matches)
      .map((match) => matchOperationalRow({ match, teams, now }));
  }, [leagueData.matches, leagueData.teams, isDemoMode, league]);

  useEffect(() => {
    if (isDemoMode || !league) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await currentUser?.getIdToken();
        if (!token) throw new Error('Sign in again to load matches.');
        const response = await fetch(`/api/league/command?leagueId=${encodeURIComponent(league!.id)}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'Matches are unavailable.');
        // Every row in the window, so all four segments can populate. Falls back to the
        // Command subsets for a server that predates `rows`.
        if (!cancelled) {
          setRows(body.rows ?? [...(body.today?.rows ?? []), ...(body.next ?? [])]);
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Matches are unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [currentUser, isDemoMode, league]);

  const all = useMemo(() => (isDemoMode ? demoRows : rows) ?? [], [demoRows, isDemoMode, rows]);

  const counts = useMemo(() => segmentMatches(all), [all]);
  const unassignedOnly = linkedFilter === 'unassigned';

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return all
      .filter((row) => segmentFor(row) === segment)
      .filter((row) => !unassignedOnly || row.state === 'unassigned')
      .filter((row) => !term
        || `${row.homeTeamName} ${row.awayTeamName} ${row.venue ?? ''}`.toLowerCase().includes(term))
      .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt));
  }, [all, query, segment, unassignedOnly]);

  if (catalog.loading || leagueData.loading || loading) return <MatchesSkeleton />;
  if (!league) return <NoAssignment kind="league" />;
  if (error) return <ErrorState onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">Matches</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          {SEGMENTS.find((entry) => entry.id === segment)?.label ?? 'Matches'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {unassignedOnly ? 'Fixtures with no Field Manager assigned.' : league.name}
        </p>
        <button
          type="button"
          onClick={() => setBuilding(true)}
          className="mt-3 min-h-11 w-full rounded-[var(--radius-md)] bg-brand px-4 text-sm font-semibold text-[var(--on-brand)] transition hover:bg-brand-hover sm:w-auto"
        >
          Create fixtures
        </button>
      </header>

      <ScrollRail className="-mx-[var(--gutter)] px-[var(--gutter)] md:mx-0 md:px-0">
        <div className="flex gap-2" role="tablist" aria-label="Match segments">
          {SEGMENTS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={segment === entry.id}
              onClick={() => setSegment(entry.id)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition',
                segment === entry.id
                  ? 'border-brand bg-brand-subtle text-brand'
                  : 'border-border text-muted hover:text-text-strong',
              )}
            >
              {entry.label}
              <span className="tabular-nums opacity-70">{counts[entry.id]}</span>
            </button>
          ))}
        </div>
      </ScrollRail>

      <label className="relative block">
        <MagnifyingGlass className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search teams or venue"
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 pl-10 pr-3 text-sm text-text-strong placeholder:text-subtle"
        />
      </label>

      {visible.length ? (
        <div className="space-y-2">
          {visible.map((row) => (
            <MatchRow key={row.matchId} row={row} onAssign={() => setAssigning(row)} />
          ))}
        </div>
      ) : (
        <EmptySegment segment={segment} unassignedOnly={unassignedOnly} />
      )}

      <LeagueFixtureBuilder
        open={building}
        league={league}
        season={currentSeasonFor(catalog.seasons, league.id, league.currentSeasonId)}
        teams={teamsInLeague(league.id, leagueData.teams)}
        existingFixtures={matchesInLeague(league.id, leagueData.matches)}
        onClose={() => setBuilding(false)}
        onPublished={() => window.location.reload()}
      />

      <AssignFieldManagerSheet
        open={Boolean(assigning)}
        matchId={assigning?.matchId ?? ''}
        matchLabel={assigning ? `${assigning.homeTeamName} v ${assigning.awayTeamName}` : ''}
        clubs={league ? teamsInLeague(league.id, leagueData.teams).map((team) => ({ id: team.id, name: team.name })) : []}
        kickoffLabel={assigning
          ? new Intl.DateTimeFormat('en-UG', {
            weekday: 'long', day: 'numeric', month: 'short',
            hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
          }).format(new Date(assigning.scheduledAt))
          : ''}
        onClose={() => {
          setAssigning(null);
          // Refreshed on close rather than on success. The credentials are shown once and
          // cannot be retrieved, so reloading as soon as the write landed threw them away.
          window.location.reload();
        }}
      />
    </div>
  );
}

/**
 * Empty states that say what to do next rather than that a list is empty.
 */
function EmptySegment({ segment, unassignedOnly }: { segment: MatchSegment; unassignedOnly: boolean }) {
  const copy = unassignedOnly
    ? { title: 'Every fixture has a Field Manager.', detail: 'Nothing in the window is waiting for an assignment.' }
    : segment === 'live'
      ? { title: 'No matches are live.', detail: 'Live fixtures appear here with their sync state while they are being recorded.' }
      : segment === 'review'
        ? { title: 'Nothing needs review.', detail: 'Clean Field Capture reports become official without you. Only exceptions arrive here.' }
        : segment === 'completed'
          ? {
            title: 'No completed matches in this window.',
            detail: 'This workspace covers roughly three weeks either side of today. Older seasons are in Competition.',
          }
          : {
            title: 'No fixtures in the next three weeks.',
            detail: 'Generate the season schedule or create a single fixture. Fixtures further out appear here as they approach.',
          };

  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center">
      <p className="text-base font-semibold text-text-strong">{copy.title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">{copy.detail}</p>
    </div>
  );
}

function MatchesSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-1/2" />
      <Skeleton className="h-11 w-full rounded-full" />
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-28 w-full rounded-[var(--radius-md)]" />
      ))}
    </div>
  );
}
