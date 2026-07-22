'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight01Icon, CheckmarkCircle01Icon } from 'hugeicons-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusPill } from '@/components/ui/status';
import { MatchTimeline, stepsForSubmission } from '@/components/ui/match-timeline';
import { stateForMatch, STATE, StateDescriptor } from '@/lib/statusSystem';
import { isOfficialMatch } from '@/lib/status';
import type { Athlete, Match, Team } from '@/types';

/**
 * The operational home.
 *
 * The previous header spent the entire first screen on "Welcome back, <name>" set at 60px —
 * the largest element on the page, carrying no information. An operations home has one job:
 * answer "what needs me?" before the user scrolls. Identity is context, not headline.
 */

export function IdentityStrip({
  name,
  roleLabel,
  contextLine,
  state,
}: {
  name: string;
  roleLabel: string;
  contextLine?: string;
  state?: StateDescriptor;
}) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-[var(--surface-interactive)] p-3 sm:p-4">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--brand-primary)] to-[var(--goal-emerald-dark)] font-display text-sm font-black text-[#031008]">
        {initials || 'GP'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[var(--text-1)]">{name}</p>
        <p className="truncate text-xs text-[var(--text-3)]">
          {roleLabel}
          {contextLine ? ` · ${contextLine}` : ''}
        </p>
      </div>
      {state && <StatusPill state={state} size="sm" className="shrink-0" />}
    </div>
  );
}

/**
 * The single most important thing on the page. There is exactly one, deliberately — a
 * screen with six equally urgent cards communicates no priority at all.
 */
export function PriorityCard({
  tone = 'attention',
  eyebrow,
  headline,
  detail,
  actionLabel,
  onAction,
}: {
  tone?: 'attention' | 'clear';
  eyebrow: string;
  headline: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const attention = tone === 'attention';
  return (
    <section
      className={cn(
        'relative overflow-hidden rounded-2xl border p-5 sm:p-6',
        attention
          ? 'border-[var(--state-pending)]/25 bg-[linear-gradient(135deg,rgba(245,185,66,0.10),transparent_60%)]'
          : 'border-[var(--state-verified)]/25 bg-[linear-gradient(135deg,rgba(45,212,143,0.10),transparent_60%)]'
      )}
    >
      <p
        className={cn(
          'text-[11px] font-black uppercase tracking-[0.18em]',
          attention ? 'text-[var(--state-pending)]' : 'text-[var(--state-verified)]'
        )}
      >
        {eyebrow}
      </p>
      <h2 className="mt-2 font-display text-2xl font-black leading-tight text-white sm:text-3xl">
        {headline}
      </h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-2)]">{detail}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction} className="mt-5 w-full sm:w-auto">
          {actionLabel}
          <ArrowRight01Icon className="size-4" />
        </Button>
      )}
      {!attention && (
        <CheckmarkCircle01Icon className="pointer-events-none absolute -right-4 -top-4 size-24 text-[var(--state-verified)]/10" />
      )}
    </section>
  );
}

/**
 * Compact metrics. A strip rather than a grid of big cards: these are supporting context,
 * and sizing them like headlines is what made every previous dashboard feel flat.
 */
export function MetricStrip({
  items,
}: {
  items: { label: string; value: string; tone?: 'default' | 'warn' }[];
}) {
  return (
    <div className="hide-scrollbar -mx-5 flex snap-x gap-2 overflow-x-auto px-5 md:mx-0 md:grid md:grid-cols-4 md:px-0">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-w-[7.5rem] shrink-0 snap-start rounded-xl border border-white/8 bg-[var(--surface-interactive)] px-3.5 py-3 md:min-w-0"
        >
          <p className="truncate text-[11px] font-medium text-[var(--text-3)]">{item.label}</p>
          <p
            className={cn(
              'mt-1 font-display text-xl font-black tabular-nums',
              item.tone === 'warn' ? 'text-[var(--state-pending)]' : 'text-white'
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * Team Admin home.
 *
 * This role previously rendered nothing at all on /home — the page had branches for fan,
 * athlete, league_admin and platform_admin, so a team admin landed on a header above two
 * screens of empty space.
 */
export function TeamAdminHome({
  team,
  teamMatches,
  teamAthletes,
  teamName,
}: {
  team: Team | null;
  teamMatches: Match[];
  teamAthletes: Athlete[];
  teamName: (id: string) => string;
}) {
  const router = useRouter();

  const needsAction = teamMatches.filter((m) => m.status === 'completed' && !isOfficialMatch(m));
  const upcoming = teamMatches
    .filter((m) => m.status === 'scheduled' || m.status === 'live')
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
  const nextFixture = upcoming[0];
  const rosterPct = team?.rosterCompleteness ?? Math.min(100, Math.max(40, teamAthletes.length * 18));

  return (
    <div className="space-y-6">
      {needsAction.length > 0 ? (
        <PriorityCard
          eyebrow="Needs your attention"
          headline={`${needsAction.length} result${needsAction.length === 1 ? '' : 's'} not yet official`}
          detail="These fixtures have been played but the result is still moving through confirmation. Until it is official it counts towards nothing — not standings, not athlete statistics."
          actionLabel="Review fixtures"
          onAction={() => router.push('/team-admin?tab=Fixtures%20%26%20Results')}
        />
      ) : (
        <PriorityCard
          tone="clear"
          eyebrow="All clear"
          headline="No results awaiting you"
          detail="Every played fixture for this team has been confirmed and finalised into the official record."
          actionLabel={nextFixture ? 'View fixtures' : undefined}
          onAction={nextFixture ? () => router.push('/team-admin?tab=Fixtures%20%26%20Results') : undefined}
        />
      )}

      <MetricStrip
        items={[
          { label: 'Roster complete', value: `${rosterPct}%`, tone: rosterPct < 100 ? 'warn' : 'default' },
          { label: 'Athletes', value: String(teamAthletes.length) },
          { label: 'Awaiting action', value: String(needsAction.length), tone: needsAction.length ? 'warn' : 'default' },
          {
            label: 'Next fixture',
            value: nextFixture ? new Date(nextFixture.scheduledAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—',
          },
        ]}
      />

      <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="min-w-0">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="font-display text-lg font-black text-white">Fixtures needing you</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push('/team-admin?tab=Fixtures%20%26%20Results')}
            >
              Open console
            </Button>
          </div>

          {needsAction.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/12 p-8 text-center">
              <p className="text-sm font-bold text-[var(--text-2)]">Nothing is waiting on you</p>
              <p className="mt-1 text-xs text-[var(--text-3)]">
                Results appear here once a fixture has been played and needs submitting or confirming.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {needsAction.slice(0, 3).map((match) => {
                const isHome = match.homeTeamId === team?.id;
                const opponent = teamName(isHome ? match.awayTeamId : match.homeTeamId);
                const inferred =
                  match.verificationStatus === 'disputed'
                    ? ('disputed' as const)
                    : ('pending_confirmation' as const);
                return (
                  <article
                    key={match.id}
                    className="rounded-xl border border-white/10 bg-[var(--surface-interactive)] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-3)]">
                          {isHome ? 'Home' : 'Away'} · {new Date(match.scheduledAt).toLocaleDateString()}
                        </p>
                        <h4 className="mt-0.5 truncate font-display text-base font-black text-white">
                          vs {opponent}
                        </h4>
                      </div>
                      <StatusPill state={stateForMatch(match)} size="sm" className="shrink-0" />
                    </div>
                    <MatchTimeline steps={stepsForSubmission(inferred, true)} className="mt-3.5" />
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h3 className="mb-3 font-display text-lg font-black text-white">Upcoming</h3>
          {upcoming.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/12 p-8 text-center">
              <p className="text-sm font-bold text-[var(--text-2)]">No scheduled fixtures</p>
              <p className="mt-1 text-xs text-[var(--text-3)]">
                The league admin publishes fixtures for the season.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {upcoming.slice(0, 4).map((match) => {
                const isHome = match.homeTeamId === team?.id;
                return (
                  <li
                    key={match.id}
                    className="flex items-center gap-3 rounded-xl border border-white/8 bg-[var(--surface-interactive)] px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-white">
                        vs {teamName(isHome ? match.awayTeamId : match.homeTeamId)}
                      </p>
                      <p className="truncate text-xs text-[var(--text-3)]">
                        {isHome ? 'Home' : 'Away'} · {match.venue}
                      </p>
                    </div>
                    <span className="shrink-0 text-right text-xs font-bold tabular-nums text-[var(--text-2)]">
                      {new Date(match.scheduledAt).toLocaleDateString(undefined, {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    {match.status === 'live' && <StatusPill state={STATE.live} size="sm" />}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
