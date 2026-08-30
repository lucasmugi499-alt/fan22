'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { MagnifyingGlass } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, teamsInLeague } from '@/lib/league/leagueContext';
import { athleteLegalName, athleteRegisteredPosition } from '@/lib/athleteIdentity';
import { athletePhoto } from '@/lib/media';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoAssignment } from '@/components/ui/NoAssignment';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { RegisterAthleteSheet } from '@/components/league/RegisterAthleteSheet';
import { RosterActionSheet } from '@/components/league/LeagueRoster';
import type { Athlete } from '@/types';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'issues' | 'unclaimed';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'issues', label: 'Needs review' },
  { id: 'unclaimed', label: 'Unclaimed' },
];

/**
 * The athlete directory, which the League Admin had no version of at all.
 *
 * `league.athlete.manage` and `league.roster.verify` are both in the bundle and neither had a
 * surface, so a league could not see who was registered, who was waiting on verification, or
 * whose profile nobody had claimed.
 *
 * Rows are operational rather than decorative: identity, club, and the two states a League
 * Admin acts on. Registration and eligibility remain trusted commands; this screen finds the
 * athlete and shows what is true, and never types a sporting number.
 *
 * ## Every row opens the operations for that athlete
 *
 * It used to open nothing. The filters worked, the badges were accurate, and every row was a
 * dead end — so "Needs review" filtered a list down to the athletes that needed something and
 * then offered no way to do anything about any of them. A screen whose whole purpose is to
 * find an athlete has to let you act on the one you found.
 *
 * ## What "needs review" means here, and who resolves it
 *
 * Athlete verification is a PLATFORM decision, not a league one: `verificationStatus` is in
 * `ROSTER_FORBIDDEN_FIELDS`, so nothing a League Admin does can set it. What the league owns is
 * the registration — the club, the number, the position, the suspension — and those are what
 * the sheet offers. The badge says which state the athlete is actually in rather than sorting
 * the world into verified and not, because "waiting on the platform" and "the platform said no"
 * are different situations and only one of them is anybody's to chase.
 */
export function LeagueAthletes() {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const searchParams = useSearchParams();
  const catalog = useGoalPlaceData({ collections: ['leagues'] });
  const league = useMemo(
    () => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext),
    [userProfile, catalog.leagues, isDemoMode, accessContext],
  );
  const data = useGoalPlaceData({
    collections: ['athletes', 'teams'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 400,
  });

  const linked = searchParams.get('filter');
  const [filter, setFilter] = useState<Filter>(
    () => linked === 'issues' || linked === 'unclaimed' ? linked : 'all',
  );
  const [query, setQuery] = useState('');
  const [registering, setRegistering] = useState(() => searchParams.get('create') === 'athlete');
  const [subject, setSubject] = useState<Athlete | null>(null);

  const teamName = useMemo(() => {
    const teams = league ? teamsInLeague(league.id, data.teams) : [];
    return new Map(teams.map((team) => [team.id, team.name]));
  }, [data.teams, league]);

  const athletes = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.athletes
      .filter((athlete) => !league || athlete.leagueId === league.id)
      .filter((athlete) => {
        if (filter === 'issues') {
          return athlete.verificationStatus === 'pending' || athlete.verificationStatus === 'disputed';
        }
        if (filter === 'unclaimed') return !athlete.userId;
        return true;
      })
      .filter((athlete) => !term
        || `${athleteLegalName(athlete)} ${teamName.get(athlete.teamId) ?? ''}`.toLowerCase().includes(term))
      .slice(0, 200);
  }, [data.athletes, filter, league, query, teamName]);

  if (catalog.loading || data.loading) return <AthletesSkeleton />;
  if (!league) return <NoAssignment kind="league" />;

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">Athletes</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          Registered athletes
        </h1>
        <p className="mt-1 text-sm text-muted">{league.name}</p>
        <button
          type="button"
          onClick={() => setRegistering(true)}
          className="mt-3 min-h-11 w-full rounded-[var(--radius-md)] bg-brand px-4 text-sm font-semibold text-[var(--on-brand)] transition hover:bg-brand-hover sm:w-auto"
        >
          Register athlete
        </button>
      </header>

      <ScrollRail className="-mx-[var(--gutter)] px-[var(--gutter)] md:mx-0 md:px-0">
        <div className="flex gap-2">
          {FILTERS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={filter === entry.id}
              onClick={() => setFilter(entry.id)}
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition',
                filter === entry.id
                  ? 'border-brand bg-brand-subtle text-brand'
                  : 'border-border text-muted hover:text-text-strong',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </ScrollRail>

      <label className="relative block">
        <MagnifyingGlass className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search athletes or clubs"
          className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface-1 pl-10 pr-3 text-sm text-text-strong placeholder:text-subtle"
        />
      </label>

      <RegisterAthleteSheet
        open={registering}
        teams={league ? teamsInLeague(league.id, data.teams) : []}
        onClose={() => setRegistering(false)}
        onRegistered={data.retry}
      />

      {filter === 'issues' && athletes.length ? (
        <p className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 text-sm leading-6 text-muted">
          These registrations are with the platform verification desk, which is the only place
          verification is decided. What you can change from here is the registration itself:
          the club, the squad number, the registered position, and eligibility.
        </p>
      ) : null}

      {athletes.length ? (
        <ul className="divide-y divide-border border-y border-border">
          {athletes.map((athlete) => {
            const review = reviewState(athlete.verificationStatus);
            return (
              <li key={athlete.id}>
                <button
                  type="button"
                  onClick={() => setSubject(athlete)}
                  className="grid min-h-[68px] w-full grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 py-2.5 text-left transition hover:bg-surface-2"
                >
                  {/*
                    Always an image, never an empty disc. `athletePhoto` falls back to the
                    athlete's initials on their club's colours, which reads as a portrait that
                    has not been taken rather than as a row that failed to load.
                  */}
                  <div className="relative h-11 w-11 overflow-hidden rounded-full bg-surface-2">
                    <Image
                      src={athletePhoto(athlete)}
                      alt=""
                      fill
                      sizes="44px"
                      unoptimized
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-text-strong">{athleteLegalName(athlete)}</p>
                    <p className="truncate text-xs text-muted">
                      {[teamName.get(athlete.teamId), athleteRegisteredPosition(athlete)]
                        .filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <StatusPill label={review.label} tone={review.tone} />
                    {!athlete.userId ? <StatusPill label="Unclaimed" tone="muted" /> : null}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center">
          <p className="text-base font-semibold text-text-strong">
            {filter === 'issues'
              ? 'No athlete registrations need review.'
              : filter === 'unclaimed'
                ? 'Every athlete profile has been claimed.'
                : 'No athletes registered yet.'}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">
            {filter === 'all'
              ? 'Add clubs first, then register their athletes against the competition.'
              : 'Nothing is waiting in this view.'}
          </p>
        </div>
      )}

      <RosterActionSheet
        athlete={subject}
        leagueTeams={(league ? teamsInLeague(league.id, data.teams) : [])
          .filter((entry) => entry.id !== subject?.teamId)}
        onClose={() => setSubject(null)}
        onChanged={data.retry}
      />
    </div>
  );
}

/**
 * The badge, matching the filter it sits beside.
 *
 * The old one printed "Needs review" for everything that was not `verified`, which meant an
 * athlete nobody had submitted and an athlete the platform had rejected both wore the badge
 * for "waiting on a decision" — and neither appeared under the Needs review filter, which
 * matches only `pending` and `disputed`. A badge that disagrees with the filter above it is
 * how a screen teaches somebody the wrong thing about their own league.
 */
function reviewState(status: string | undefined): { label: string; tone: 'good' | 'warn' | 'muted' } {
  if (status === 'verified') return { label: 'Verified', tone: 'good' };
  if (status === 'pending') return { label: 'Awaiting review', tone: 'warn' };
  if (status === 'disputed') return { label: 'Disputed', tone: 'warn' };
  if (status === 'rejected') return { label: 'Rejected', tone: 'muted' };
  return { label: 'Not submitted', tone: 'muted' };
}

function StatusPill({ label, tone }: { label: string; tone: 'good' | 'warn' | 'muted' }) {
  return (
    <span className={cn(
      'rounded-full border px-2 py-0.5 text-[11px] font-semibold',
      tone === 'good' && 'border-[var(--state-verified)] text-[var(--state-verified)]',
      tone === 'warn' && 'border-[var(--state-pending)] text-[var(--state-pending)]',
      tone === 'muted' && 'border-border text-muted',
    )}>
      {label}
    </span>
  );
}

function AthletesSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-1/2" />
      <Skeleton className="h-11 w-full rounded-full" />
      {Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-16 w-full" />)}
    </div>
  );
}
