'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Users as UsersIcon,
  CalendarBlank,
  Warning,
  Broadcast,
  SealCheck,
  Coins,
} from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { useTeamOfficialStanding } from '@/lib/team/useTeamStanding';
import {
  resolveMyTeam,
  pendingActions,
  upcomingForTeam,
  rosterForTeam,
  teamRecord,
  recentForm,
  type TeamAction,
  type FormResult,
} from '@/lib/team/teamContext';
import { Card, Bezel, Eyebrow } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { MatchStatusBadge } from '@/components/ui/StatusBadge';
import { MatchCard } from '@/components/core/MatchCard';
import { ResultSubmissionSheet } from '@/components/team/ResultSubmissionSheet';
import { useTeamConfirmationInbox } from '@/lib/resultSubmissionQueues';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { Match, Team } from '@/types';

const ACTION_COPY: Record<TeamAction['kind'], { title: string; body: string; cta: string }> = {
  live: {
    title: 'A match is live',
    body: 'Keep the score updated. You can submit the result the moment it ends.',
    cta: 'Open fixtures',
  },
  unverified: {
    title: 'A result needs verifying',
    body: 'A played result is not official until the opposing team confirms it. Submit or confirm it to move it forward.',
    cta: 'Review result',
  },
  disputed: {
    title: 'A result is disputed',
    body: 'The two teams disagree on this scoreline. The league is reviewing it. Add your evidence to help resolve it.',
    cta: 'View dispute',
  },
};

const FORM_STYLE: Record<FormResult, string> = {
  W: 'bg-[var(--state-verified-bg)] text-[var(--state-verified)] border-[var(--state-verified)]/30',
  D: 'bg-surface-3 text-muted border-border-strong',
  L: 'bg-[var(--state-disputed-bg)] text-[var(--state-disputed)] border-[var(--state-disputed)]/30',
};

export function TeamConsoleHome() {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['teams'] });
  const team = useMemo(() => resolveMyTeam(userProfile, catalog.teams, [], isDemoMode, accessContext), [userProfile, catalog.teams, isDemoMode, accessContext]);
  const detail = useGoalPlaceData({
    collections: ['matches', 'athletes'],
    scope: { teamId: team?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const { matches, athletes, error, retry } = detail;
  const { standing } = useTeamOfficialStanding(team ?? undefined);
  const teams = catalog.teams;
  const loading = catalog.loading || (Boolean(team) && detail.loading);
  const [reviewMatch, setReviewMatch] = useState<Match | null>(null);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const { items: confirmationInbox, error: inboxError, refresh: refreshInbox } =
    useTeamConfirmationInbox(team?.id);

  if (loading) return <TeamConsoleHomeSkeleton />;
  if (error) return <ErrorState onRetry={retry} />;
  if (inboxError) return <ErrorState onRetry={refreshInbox} />;

  if (!team) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="No team linked yet"
        description="Once your account is attached to a team, its operations console appears here."
      />
    );
  }

  const actions = pendingActions(team.id, matches);
  const upcoming = upcomingForTeam(team.id, matches).slice(0, 4);
  const roster = rosterForTeam(team.id, athletes);
  const form = recentForm(team.id, matches);
  const confirmationIds = new Set(confirmationInbox.map((item) => item.matchId));
  const top =
    actions.find((action) => confirmationIds.has(action.match.id)) ??
    actions[0];

  return (
    <div className="space-y-5">
      {/* Team identity */}
      <header className="flex items-center gap-3.5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[var(--radius-lg)] border border-[color:var(--border-glow)] bg-surface-2 text-lg font-bold text-text-strong shadow-[var(--glow-brand)]">
          {team.name.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-tight text-text-strong">{team.name}</h1>
            {team.verified ? (
              <SealCheck className="h-5 w-5 shrink-0 text-[var(--state-verified)]" weight="fill" />
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-sm text-muted">
            <span>{team.city}</span>
            <span className="h-1 w-1 rounded-full bg-subtle" aria-hidden />
            <span className="tabular tabular-nums">{teamRecord(team)}</span>
            {form.length ? (
              <span className="ml-1 flex items-center gap-1">
                {form.map((r, i) => (
                  <span
                    key={i}
                    className={cn(
                      'grid h-5 w-5 place-items-center rounded-md border text-[10px] font-bold',
                      FORM_STYLE[r]
                    )}
                  >
                    {r}
                  </span>
                ))}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Today</p>
      {/* Priority: the one thing that needs the admin now */}
      {top ? (
        <PriorityCard action={top} teamById={teamById} onReview={() => setReviewMatch(top.match)} />
      ) : (
        <AllClearCard />
      )}

      {/* Metric strip */}
      <div className="grid grid-cols-3 gap-2.5">
        <Metric label="Needs action" value={actions.length} tone={actions.length ? 'pending' : 'default'} />
        <Metric label="Squad" value={roster.length} />
        {/* Official standings projection, not the stored aggregate. */}
        <Metric label="Points" value={standing?.points ?? team.leaguePoints} tone="brand" />
      </div>

      {/* Support pool strip */}
      <Card className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--brand-2-subtle)] text-[var(--brand-2)]">
            <Coins className="h-5 w-5" weight="bold" />
          </span>
          <div>
            <p className="text-sm font-semibold text-text-strong">Support pool</p>
            <p className="text-xs text-muted">
              <span className="tabular tabular-nums">{team.supportersCount}</span> supporters backing the team
            </p>
          </div>
        </div>
        <p data-numeric className="tabular text-lg font-bold tabular-nums text-[var(--brand-2)]">
          {formatUgx(team.totalSupport)}
        </p>
      </Card>

      {/* Next fixtures */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-text-strong">Next fixtures</h2>
          <Link href="/team-admin/fixtures" className="text-sm font-medium text-brand hover:underline">
            All fixtures
          </Link>
        </div>
        {upcoming.length ? (
          <div className="space-y-3">
            {upcoming.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                home={teamById.get(m.homeTeamId)}
                away={teamById.get(m.awayTeamId)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={CalendarBlank}
            title="No upcoming fixtures"
            description="When the league schedules your next match, it appears here with kickoff details."
          />
        )}
      </section>

      {reviewMatch ? (
        <ResultSubmissionSheet
          open
          onClose={() => setReviewMatch(null)}
          onComplete={() => {
            retry();
            void refreshInbox();
          }}
          match={reviewMatch}
          home={teamById.get(reviewMatch.homeTeamId)}
          away={teamById.get(reviewMatch.awayTeamId)}
          myTeamId={team.id}
        />
      ) : null}
    </div>
  );
}

function formatUgx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

function PriorityCard({
  action,
  teamById,
  onReview,
}: {
  action: TeamAction;
  teamById: Map<string, Team>;
  onReview: () => void;
}) {
  const copy = ACTION_COPY[action.kind];
  const Icon = action.kind === 'live' ? Broadcast : action.kind === 'disputed' ? Warning : Clock;
  const home = teamById.get(action.match.homeTeamId);
  const away = teamById.get(action.match.awayTeamId);

  return (
    <Bezel glow>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Eyebrow className="text-brand">Needs you now</Eyebrow>
        <MatchStatusBadge match={action.match} size="sm" />
      </div>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)] bg-brand-subtle text-brand">
            <Icon className="h-5 w-5" weight="bold" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-strong">{copy.title}</h2>
            <p className="mt-1 text-sm text-muted">{copy.body}</p>
            <p className="mt-2.5 text-sm font-medium text-text-strong">
              {home?.name ?? 'Home'} <span className="text-subtle">vs</span> {away?.name ?? 'Away'}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <Button iconTrailing={ArrowRight} block onClick={onReview}>
            {copy.cta}
          </Button>
        </div>
      </div>
    </Bezel>
  );
}

function AllClearCard() {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--state-verified-bg)] text-[var(--state-verified)]">
        <CheckCircle className="h-5 w-5" weight="bold" />
      </span>
      <div>
        <h2 className="text-base font-semibold text-text-strong">You are all caught up</h2>
        <p className="text-sm text-muted">No results to submit or confirm right now.</p>
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'pending' | 'brand';
}) {
  const color =
    tone === 'pending'
      ? 'text-[var(--state-pending)]'
      : tone === 'brand'
        ? 'text-brand'
        : 'text-text-strong';
  return (
    <Card className="p-3.5">
      <p data-numeric className={cn('tabular text-2xl font-bold tabular-nums', color)}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}

function TeamConsoleHomeSkeleton() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3.5">
        <Skeleton className="h-14 w-14 rounded-[var(--radius-lg)]" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <Skeleton className="h-48 w-full rounded-[var(--radius-2xl)]" />
      <div className="grid grid-cols-3 gap-2.5">
        <Skeleton className="h-20 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-20 rounded-[var(--radius-lg)]" />
        <Skeleton className="h-20 rounded-[var(--radius-lg)]" />
      </div>
      <Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" />
      <Skeleton className="h-6 w-32" />
      <Skeleton className="h-32 w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}
