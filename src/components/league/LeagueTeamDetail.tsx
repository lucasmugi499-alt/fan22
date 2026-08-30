'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowSquareOut, CalendarBlank, MapPin } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, teamsInLeague } from '@/lib/league/leagueContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoAssignment } from '@/components/ui/NoAssignment';
import { LeagueRoster } from '@/components/league/LeagueRoster';
import type { Match, StoredStanding, Team } from '@/types';
import { cn } from '@/lib/utils';

/**
 * One club, as the league operates it.
 *
 * The roster is still the point of the page — it is what a League Admin comes here to change —
 * but it was the whole of it, and that was wrong in a way that showed. A League Admin who
 * tapped a club got a name, a city and a squad list: less than the public club page carries,
 * with none of the standing, the fixtures or the registration state that make it a club they
 * are responsible for rather than one they follow.
 *
 * So this is the operator's view of the same club. What it adds over the public page is
 * everything derived from the league's own records: where the club sits in the table it is
 * playing in, which of its fixtures still have no result, and whether its registration is
 * settled. Every fixture links into League Operations rather than the public match page,
 * because from here the next thing to do is act on it.
 *
 * Nothing here is editable except through the roster commands. Standing is read from the
 * `standings` projection and results are read from matches: a League Admin cannot type a
 * league position any more than they can type a goal.
 */
export function LeagueTeamDetail({ teamId }: { teamId: string }) {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['leagues'] });
  const league = useMemo(
    () => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext),
    [userProfile, catalog.leagues, isDemoMode, accessContext],
  );
  const data = useGoalPlaceData({
    collections: ['teams', 'athletes', 'matches', 'standings'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 400,
  });

  const leagueTeams = useMemo(
    () => (league ? teamsInLeague(league.id, data.teams) : []),
    [data.teams, league],
  );
  const team = leagueTeams.find((entry) => entry.id === teamId);

  const nameById = useMemo(
    () => new Map(leagueTeams.map((entry) => [entry.id, entry.name])),
    [leagueTeams],
  );

  /*
   * Read once on mount rather than during render. The clock is impure, and a bucket boundary
   * that moves every time the component happens to re-render is a list that reorders itself
   * while somebody is reading it.
   */
  const [now] = useState(() => Date.now());

  const fixtures = useMemo(() => {
    if (!team) return { upcoming: [] as Match[], unresolved: [] as Match[], results: [] as Match[] };
    const mine = (data.matches as Match[])
      .filter((match) => match.homeTeamId === team.id || match.awayTeamId === team.id);
    /*
     * Three buckets, because a League Admin asks three different questions of a club's
     * schedule. "Unresolved" is the one the public club page has no reason to draw and this
     * page must: a fixture whose kickoff has gone by with no result is the club's problem and
     * the league's to settle.
     */
    return {
      upcoming: mine
        .filter((match) => match.status === 'scheduled' && Date.parse(match.scheduledAt) >= now)
        .sort((left, right) => Date.parse(left.scheduledAt) - Date.parse(right.scheduledAt)),
      unresolved: mine
        .filter((match) => match.status === 'scheduled' && Date.parse(match.scheduledAt) < now)
        .sort((left, right) => Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt)),
      results: mine
        .filter((match) => match.status === 'completed' || match.status === 'live')
        .sort((left, right) => Date.parse(right.scheduledAt) - Date.parse(left.scheduledAt)),
    };
  }, [data.matches, now, team]);

  const standing = useMemo(
    () => (data.standings as StoredStanding[] | undefined)?.find((row) => row.teamId === teamId) ?? null,
    [data.standings, teamId],
  );

  if (catalog.loading || data.loading) {
    return <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />;
  }
  if (!league) return <NoAssignment kind="league" />;

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

      <header className="space-y-2.5">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">Club</p>
        <h1 className="text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          {team.name}
        </h1>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm text-muted">
          <span className="inline-flex items-center gap-1">
            {/* Deduped: a club whose venue field repeats its city rendered "Kampala · Kampala". */}
            <MapPin className="h-4 w-4" />{' '}
            {[...new Set([team.city, team.location].filter(Boolean))].join(' · ')}
          </span>
          <RegistrationPill team={team} />
        </div>
        <Link
          href={`/teams/${encodeURIComponent(team.id)}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
        >
          View the public club page <ArrowSquareOut className="h-4 w-4" />
        </Link>
      </header>

      {/*
        The table row, read from the standings projection rather than counted here. Two
        surfaces counting the same results independently is how they end up disagreeing, and a
        League Admin reading a different table from the one their clubs read is worse than a
        League Admin reading no table.
      */}
      <section aria-label="League standing" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat label="Position" value={standing ? `#${standing.rank}` : '—'} />
        <Stat label="Played" value={standing ? String(standing.played) : '0'} />
        <Stat
          label="Record"
          value={standing ? `${standing.wins}-${standing.draws}-${standing.losses}` : 'No results yet'}
        />
        <Stat label="Points" value={standing ? String(standing.points) : '0'} />
      </section>
      {!standing ? (
        <p className="text-xs leading-5 text-muted">
          This club has no row in the table yet. A row appears once one of its results is
          official.
        </p>
      ) : null}

      {fixtures.unresolved.length ? (
        <FixtureSection
          title="Not played"
          detail="Kickoff has passed and no result was recorded. Each of these needs a decision."
          tone="warn"
          matches={fixtures.unresolved.slice(0, 8)}
          overflow={fixtures.unresolved.length - 8}
          nameById={nameById}
          teamId={team.id}
        />
      ) : null}

      <FixtureSection
        title="Upcoming"
        detail={fixtures.upcoming.length ? undefined : 'No fixture is scheduled for this club.'}
        matches={fixtures.upcoming.slice(0, 6)}
        overflow={fixtures.upcoming.length - 6}
        nameById={nameById}
        teamId={team.id}
      />

      <FixtureSection
        title="Recent results"
        detail={fixtures.results.length ? undefined : 'No result has been recorded for this club.'}
        matches={fixtures.results.slice(0, 6)}
        overflow={fixtures.results.length - 6}
        nameById={nameById}
        teamId={team.id}
      />

      <LeagueRoster
        team={team}
        athletes={roster}
        leagueTeams={leagueTeams}
        onChanged={data.retry}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-1 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-subtle">{label}</p>
      <p className="mt-1 truncate text-lg font-semibold tabular-nums text-text-strong">{value}</p>
    </div>
  );
}

/**
 * Where the club's own registration stands.
 *
 * A club is a record the platform verifies, exactly as an athlete is, and a League Admin who
 * cannot see that state cannot answer the club when it asks. Verification is not theirs to
 * decide, so this states it and does not offer a control.
 */
function RegistrationPill({ team }: { team: Team }) {
  const status = (team as { verificationStatus?: string }).verificationStatus
    ?? (team.verified ? 'verified' : undefined);
  const copy = status === 'verified'
    ? { label: 'Verified club', tone: 'good' as const }
    : status === 'rejected'
      ? { label: 'Registration rejected', tone: 'muted' as const }
      : status === 'pending'
        ? { label: 'Awaiting verification', tone: 'warn' as const }
        : { label: 'Not verified', tone: 'muted' as const };
  return (
    <span className={cn(
      'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
      copy.tone === 'good' && 'border-[var(--state-verified)] text-[var(--state-verified)]',
      copy.tone === 'warn' && 'border-[var(--state-pending)] text-[var(--state-pending)]',
      copy.tone === 'muted' && 'border-border text-muted',
    )}>
      {copy.label}
    </span>
  );
}

/**
 * A club's fixtures, linking into League Operations rather than the public match page.
 *
 * The destination is the difference. From a public match page there is nothing to do; from
 * `/league-admin/matches/{id}` there is a result to enter, an exception to settle, a Field
 * Manager to assign.
 */
function FixtureSection({
  title,
  detail,
  tone,
  matches,
  overflow,
  nameById,
  teamId,
}: {
  title: string;
  detail?: string;
  tone?: 'warn';
  matches: Match[];
  overflow: number;
  nameById: Map<string, string>;
  teamId: string;
}) {
  return (
    <section className="space-y-2">
      <h2 className={cn(
        'flex items-center gap-1.5 text-[15px] font-semibold',
        tone === 'warn' ? 'text-[var(--state-pending)]' : 'text-text-strong',
      )}>
        <CalendarBlank className="h-4 w-4" weight="bold" /> {title}
      </h2>
      {detail ? <p className="text-xs leading-5 text-muted">{detail}</p> : null}
      {matches.length ? (
        <ul className="divide-y divide-border border-y border-border">
          {matches.map((match) => {
            const home = match.homeTeamId === teamId;
            const opponent = nameById.get(home ? match.awayTeamId : match.homeTeamId)
              ?? (home ? match.awayTeamId : match.homeTeamId);
            const score = typeof match.score?.home === 'number' && typeof match.score?.away === 'number'
              ? `${match.score.home}-${match.score.away}`
              : null;
            return (
              <li key={match.id}>
                <Link
                  href={`/league-admin/matches/${encodeURIComponent(match.id)}`}
                  className="flex min-h-[56px] items-center gap-3 py-2.5 transition hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text-strong">
                      {home ? 'vs' : 'at'} {opponent}
                    </p>
                    <p className="truncate text-xs text-muted">
                      {new Intl.DateTimeFormat('en-UG', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
                      }).format(new Date(match.scheduledAt))}
                      {match.venue ? ` · ${match.venue}` : ''}
                    </p>
                  </div>
                  {score ? (
                    <span data-numeric className="shrink-0 text-sm font-bold tabular-nums text-text-strong">
                      {score}
                    </span>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      {overflow > 0 ? (
        <p className="text-xs text-muted">and {overflow} more</p>
      ) : null}
    </section>
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
