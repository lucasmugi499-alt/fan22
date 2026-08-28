'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Broadcast,
  CalendarPlus,
  PersonSimpleRun,
  Plus,
  UserPlus,
  Warning,
} from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, matchesInLeague, teamsInLeague } from '@/lib/league/leagueContext';
import { buildLeagueCommand, type LeagueCommandModel, type LeagueMatchRow } from '@/lib/league/operations';
import { currentSeasonFor } from '@/lib/season';
import { Skeleton } from '@/components/ui/Skeleton';
import { ErrorState } from '@/components/ui/EmptyState';
import { NoAssignment } from '@/components/ui/NoAssignment';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { cn } from '@/lib/utils';

/**
 * The operational heartbeat of a league.
 *
 * The page this replaces opened with how big the league was — teams, athletes, a verified
 * percentage, an index. On a matchday none of that changes what the League Admin does next.
 * This one answers, in order: what is happening, what needs me, what is next.
 *
 * Ordered for a phone held one-handed at a ground. Attention comes before today's list,
 * because a fixture nobody is recording matters more than a fixture that is fine.
 */
export function LeagueCommandCentre() {
  const { userProfile, currentUser, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['leagues', 'seasons'] });
  const league = useMemo(
    () => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext),
    [userProfile, catalog.leagues, isDemoMode, accessContext],
  );

  /*
   * Demo builds the model in the browser from the seeded collections. Live reads the server
   * model, because assignments and exceptions are not client-readable and a half-answer about
   * whether a match is covered is worse than no answer.
   */
  const demoData = useGoalPlaceData({
    collections: isDemoMode ? ['teams', 'matches'] : [],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const [model, setModel] = useState<LeagueCommandModel | null>(null);
  const [loading, setLoading] = useState(!isDemoMode);
  const [error, setError] = useState<string | null>(null);

  const demoModel = useMemo(() => {
    if (!isDemoMode || !league) return null;
    return buildLeagueCommand({
      matches: matchesInLeague(league.id, demoData.matches),
      teams: teamsInLeague(league.id, demoData.teams),
      now: new Date().toISOString(),
    });
  }, [demoData.matches, demoData.teams, isDemoMode, league]);

  useEffect(() => {
    if (isDemoMode || !league) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await currentUser?.getIdToken();
        if (!token) throw new Error('Sign in again to load League Operations.');
        const response = await fetch(`/api/league/command?leagueId=${encodeURIComponent(league!.id)}`, {
          headers: { authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error ?? 'League Operations is unavailable.');
        if (!cancelled) setModel(body);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'League Operations is unavailable.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [currentUser, isDemoMode, league]);

  const season = league ? currentSeasonFor(catalog.seasons, league.id, league.currentSeasonId) : null;
  const data = isDemoMode ? demoModel : model;

  if (catalog.loading || (isDemoMode && demoData.loading) || loading) return <CommandSkeleton />;
  if (!league) return <NoAssignment kind="league" />;
  if (error) return <ErrorState onRetry={() => window.location.reload()} />;
  if (!data) return <CommandSkeleton />;

  return (
    <div className="space-y-6">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">Command</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          {league.name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {[season?.name, String(league.sport)].filter(Boolean).join(' · ')}
        </p>
      </header>

      {/* Today, stated as a sentence rather than as four tiles nobody reads. */}
      <section aria-label="Today">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Today</p>
        <p className="mt-1 text-lg font-semibold text-text-strong">
          {data.today.total === 0
            ? 'No matches today.'
            : `${data.today.total} ${data.today.total === 1 ? 'match' : 'matches'}`}
          {data.today.live ? <span className="text-[var(--state-live)]"> · {data.today.live} live</span> : null}
          {data.today.upcoming ? <span className="text-muted"> · {data.today.upcoming} still to play</span> : null}
        </p>
      </section>

      {data.attention.length ? (
        <section aria-label="Attention required" className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--state-pending)]">
            Attention required
          </p>
          <ul className="space-y-2">
            {data.attention.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex min-h-11 items-start gap-2.5 rounded-[var(--radius-md)] border p-3 transition',
                    item.severity === 'critical'
                      ? 'border-[color-mix(in_srgb,var(--state-error),transparent_60%)] bg-[color-mix(in_srgb,var(--state-error),transparent_92%)]'
                      : 'border-border bg-surface-1 hover:border-border-strong',
                  )}
                >
                  <Warning
                    className={cn('mt-0.5 h-4 w-4 shrink-0',
                      item.severity === 'critical' ? 'text-[var(--state-error)]' : 'text-[var(--state-pending)]')}
                    weight="fill"
                  />
                  <span className="min-w-0 flex-1 text-sm leading-6 text-text">{item.label}</span>
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
          {data.attentionOverflow ? (
            <Link
              href="/league-admin/matches?filter=unassigned"
              className="flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-border text-sm font-semibold text-brand"
            >
              {data.attentionOverflow} more in Matches
            </Link>
          ) : null}
        </section>
      ) : null}

      {data.today.rows.length ? (
        <section aria-label="Today's matches" className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Matches today</p>
          {data.today.rows.map((row) => <MatchRow key={row.matchId} row={row} />)}
        </section>
      ) : null}

      {data.next.length ? (
        <section aria-label="Next fixtures" className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Next</p>
            <Link href="/league-admin/matches" className="text-sm font-semibold text-brand hover:underline">
              All matches
            </Link>
          </div>
          {data.next.map((row) => <MatchRow key={row.matchId} row={row} />)}
        </section>
      ) : null}

      {data.quiet ? (
        <section className="rounded-[var(--radius-lg)] border border-border bg-surface-1 p-6 text-center">
          <p className="text-base font-semibold text-text-strong">Nothing needs you right now.</p>
          <p className="mt-1 text-sm text-muted">
            No matches today and nothing waiting. Set up the week from Matches or Competition.
          </p>
        </section>
      ) : null}

      <QuickActions />
    </div>
  );
}

/**
 * One match, readable at a glance and legible on a phone.
 *
 * The Field Manager line is the point of this row. A League Admin looking at a fixture is
 * asking "is somebody recording this", and the answer has to be on the row rather than two
 * screens away.
 */
export function MatchRow({ row, onAssign }: { row: LeagueMatchRow; onAssign?: () => void }) {
  const kickoff = new Intl.DateTimeFormat('en-UG', {
    weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Kampala',
  }).format(new Date(row.scheduledAt));

  /*
   * The card is a link and the action is a button beside it, rather than a button nested
   * inside a link. Nesting one interactive element in another is how a tap meant for Assign
   * navigates instead, which on a phone happens constantly.
   */
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface-1 transition hover:border-border-strong">
      <Link
        href={`/league-admin/matches/${encodeURIComponent(row.matchId)}`}
        className="block p-3.5"
      >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/*
            Wrapped rather than truncated. Beside a shrink-0 state chip on a 320px phone,
            `truncate` left the fixture reading "Gulu Warriors v G…" — the away side, which is
            half of what identifies the match, was the part that got cut. Two lines is the worst
            case and it costs a row of height.
          */}
          <p className="line-clamp-2 font-semibold leading-6 text-text-strong">
            {row.homeTeamName} <span className="text-subtle">v</span> {row.awayTeamName}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {kickoff}{row.venue ? ` · ${row.venue}` : ''}
          </p>
        </div>
        <div className="shrink-0 text-right">
          {row.score ? (
            <p data-numeric className="text-lg font-bold tabular-nums text-text-strong">
              {row.score.home}–{row.score.away}
            </p>
          ) : null}
          <StateChip state={row.state} />
        </div>
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-subtle">Field Manager</span>
        {row.fieldManager?.displayName ? (
          <span className="font-medium text-text">{row.fieldManager.displayName}</span>
        ) : (
          <span className="font-medium text-[var(--state-pending)]">Not assigned</span>
        )}
        {row.fieldManager ? <PresenceDot presence={row.fieldManager.presence} seconds={row.fieldManager.secondsSinceSync} /> : null}
      </p>
      {/*
        The Field Manager line above already says "Not assigned", so repeating it here as a
        sentence is two lines saying one thing on a card built for density.
      */}
      {row.attention && row.attention !== 'No Field Manager assigned.' ? (
        <p className="mt-1.5 text-xs leading-5 text-[var(--state-pending)]">{row.attention}</p>
      ) : null}
      </Link>
      {onAssign && !row.fieldManager ? (
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={onAssign}
            className="min-h-11 w-full rounded-[var(--radius-sm)] bg-brand-subtle px-3 text-sm font-semibold text-brand transition hover:bg-brand/20"
          >
            Assign Field Manager
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PresenceDot({ presence, seconds }: { presence: string; seconds: number | null }) {
  if (presence === 'unknown') return <span className="text-subtle">· not yet connected</span>;
  const label = presence === 'online'
    ? 'online'
    : seconds !== null && seconds >= 60
      ? `last sync ${Math.round(seconds / 60)}m ago`
      : `last sync ${seconds ?? 0}s ago`;
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5',
      presence === 'online' && 'text-[var(--state-verified)]',
      presence === 'stale' && 'text-[var(--state-pending)]',
      presence === 'offline' && 'text-[var(--state-error)]',
    )}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

const STATE_LABEL: Record<LeagueMatchRow['state'], string> = {
  draft: 'Draft',
  unassigned: 'Needs manager',
  ready: 'Ready',
  live: 'Live',
  awaiting_result: 'Awaiting result',
  official: 'Official',
  needs_review: 'Needs review',
  cancelled: 'Cancelled',
};

export function StateChip({ state }: { state: LeagueMatchRow['state'] }) {
  return (
    <span className={cn(
      'mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold',
      state === 'live' && 'border-[var(--state-live)] text-[var(--state-live)]',
      state === 'needs_review' && 'border-[var(--state-error)] text-[var(--state-error)]',
      state === 'unassigned' && 'border-[var(--state-pending)] text-[var(--state-pending)]',
      state === 'awaiting_result' && 'border-[var(--state-pending)] text-[var(--state-pending)]',
      state === 'official' && 'border-[var(--state-verified)] text-[var(--state-verified)]',
      (state === 'ready' || state === 'draft' || state === 'cancelled') && 'border-border text-muted',
    )}>
      {STATE_LABEL[state]}
    </span>
  );
}

/**
 * The handful of things a League Admin starts from here.
 *
 * A rail rather than a grid, so five actions do not become a wall on a narrow screen. Each one
 * names the act it performs.
 */
function QuickActions() {
  const actions = [
    { label: 'Create fixture', href: '/league-admin/matches?create=fixture', icon: CalendarPlus },
    { label: 'Assign Field Manager', href: '/league-admin/matches?filter=unassigned', icon: UserPlus },
    { label: 'Add team', href: '/league-admin/teams?create=team', icon: Plus },
    { label: 'Register athlete', href: '/league-admin/athletes?create=athlete', icon: PersonSimpleRun },
    { label: 'Competition', href: '/league-admin/competition', icon: Broadcast },
  ];
  return (
    <section aria-label="Quick actions">
      <ScrollRail className="-mx-[var(--gutter)] px-[var(--gutter)] md:mx-0 md:px-0">
        <div className="flex gap-2">
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-1 px-3.5 text-sm font-semibold text-text-strong transition hover:border-brand/50 hover:text-brand"
            >
              <action.icon className="h-4 w-4" />
              {action.label}
            </Link>
          ))}
        </div>
      </ScrollRail>
    </section>
  );
}

function CommandSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-9 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton key={index} className="h-24 w-full rounded-[var(--radius-md)]" />
      ))}
    </div>
  );
}
