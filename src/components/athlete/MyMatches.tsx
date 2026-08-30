'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyAthlete } from '@/lib/athlete/athleteContext';
import { isOfficialMatch } from '@/lib/status';
import { MatchCard } from '@/components/core/MatchCard';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { AthleteClaiming } from '@/components/athlete/AthleteClaiming';
import type { Match, MatchEvent } from '@/types';
import { cn } from '@/lib/utils';

/**
 * An athlete's own fixtures.
 *
 * The athlete workspace pointed its Matches tab at `/matches`, the public list: every live
 * game in every sport in every league on the platform. That is the right screen for a fan and
 * the wrong one for the person who has to be at one of them on Saturday. An athlete opening
 * "Matches" inside My Career is asking which of these is theirs, and the answer was buried in
 * a national fixture list they had to search.
 *
 * ## What counts as theirs
 *
 * The fixtures of the club they are registered to, which is the honest answer available from
 * the sporting record. A squad is registered, a matchday squad is selected, and the platform
 * does not hold team selections — so this does not claim they are playing, and does not filter
 * to matches it cannot know they were picked for. Where a result is official and the recorded
 * events name them, it says what those events were, because that part IS known.
 */

type Segment = 'upcoming' | 'results';

export function MyMatches() {
  const { userProfile, isDemoMode } = useAuth();
  const { athletes, teams, matches, loading, retry } = useGoalPlaceData({
    collections: ['athletes', 'teams', 'matches'],
    recordLimit: 1200,
  });
  const [segment, setSegment] = useState<Segment>('upcoming');
  /* Read once, so the boundary between upcoming and played does not move mid-read. */
  const [now] = useState(() => Date.now());

  const athlete = useMemo(
    () => resolveMyAthlete(userProfile, athletes, isDemoMode),
    [userProfile, athletes, isDemoMode],
  );
  const team = useMemo(() => teams.find((entry) => entry.id === athlete?.teamId), [teams, athlete]);
  const teamById = useMemo(() => new Map(teams.map((entry) => [entry.id, entry])), [teams]);

  const mine = useMemo(() => {
    if (!athlete?.teamId) return [] as Match[];
    return (matches as Match[])
      .filter((match) => match.homeTeamId === athlete.teamId || match.awayTeamId === athlete.teamId);
  }, [athlete, matches]);

  const upcoming = useMemo(
    () => mine
      .filter((match) => match.status === 'scheduled' && Date.parse(match.scheduledAt) >= now)
      .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt)),
    [mine, now],
  );
  const results = useMemo(
    () => mine
      .filter((match) => match.status === 'completed' || match.status === 'live')
      .sort((left, right) => Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt)),
    [mine],
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-1/2" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  }

  if (!athlete) return <AthleteClaiming athletes={athletes} onChanged={retry} />;

  const visible = segment === 'upcoming' ? upcoming : results;

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">My matches</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          {segment === 'upcoming' ? 'Upcoming' : 'Results'}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {team ? `${team.name} fixtures` : 'Your club has not been set.'}
        </p>
      </header>

      <div className="flex gap-2" role="tablist" aria-label="My matches">
        {([
          { id: 'upcoming' as const, label: 'Upcoming', count: upcoming.length },
          { id: 'results' as const, label: 'Results', count: results.length },
        ]).map((entry) => (
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
            <span className="tabular-nums opacity-70">{entry.count}</span>
          </button>
        ))}
      </div>

      {visible.length ? (
        <div className="space-y-3">
          {visible.map((match) => (
            <div key={match.id} className="space-y-1.5">
              <MatchCard
                match={match}
                home={teamById.get(match.homeTeamId)}
                away={teamById.get(match.awayTeamId)}
                href={`/matches/${encodeURIComponent(match.id)}`}
              />
              <MyContribution match={match} athleteId={athlete.id} />
            </div>
          ))}
        </div>
      ) : (
        <Card className="p-6 text-center">
          <p className="flex items-center justify-center gap-1.5 text-base font-semibold text-text-strong">
            <CalendarBlank className="h-4 w-4 text-brand" weight="bold" />
            {segment === 'upcoming' ? 'No fixture is scheduled.' : 'No result has been recorded.'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">
            {segment === 'upcoming'
              ? 'Your club’s next fixtures appear here as soon as the league publishes them.'
              : 'Results appear here once the league finalizes them. Your official record only ever counts finalized results.'}
          </p>
          {team ? (
            <Link
              href={`/teams/${encodeURIComponent(team.id)}`}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand hover:underline"
            >
              See {team.name}
            </Link>
          ) : null}
        </Card>
      )}
    </div>
  );
}

/**
 * What the official record says this athlete did in this match.
 *
 * Only for a finalized result, and only from the events the finalizer produced. An athlete's
 * own screen is exactly where an encouraging guess would do the most damage: this platform's
 * whole claim is that a statistic beside a name was verified, and a line here that said
 * "played" because the club was fixtured would be that claim broken on the first screen an
 * athlete looks at.
 */
function MyContribution({ match, athleteId }: { match: Match; athleteId: string }) {
  if (!isOfficialMatch(match)) return null;
  const events = ((match.events ?? []) as MatchEvent[]).filter((event) => event.athleteId === athleteId);
  if (!events.length) return null;

  const counts = new Map<string, number>();
  for (const event of events) {
    const label = event.type.replace(/_/g, ' ');
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return (
    <p className="px-1 text-xs text-muted">
      Your official record from this match:{' '}
      <span className="font-semibold text-text-strong">
        {[...counts].map(([label, count]) => `${count} ${label}`).join(' · ')}
      </span>
    </p>
  );
}
