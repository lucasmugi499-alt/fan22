'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Users as UsersIcon,
  CalendarBlank,
  SealCheck,
  Coins,
} from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { useMyTeam } from '@/lib/team/useMyTeam';
import { useTeamMatchReports } from '@/lib/team/useTeamMatchReports';
import { useTeamOfficialStanding } from '@/lib/team/useTeamStanding';
import {
  matchesForTeam,
  rosterForTeam,
  recentForm,
  type FormResult,
} from '@/lib/team/teamContext';
import { isOfficialMatch, isStillToPlay } from '@/lib/status';
import { useNow } from '@/lib/useNow';
import { Card, Bezel, Eyebrow } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { MatchStatusBadge } from '@/components/ui/StatusBadge';
import { MatchCard } from '@/components/core/MatchCard';
import { ClubResultSheet } from '@/components/team/ClubResultSheet';
import { useTeamConsoleAccess } from '@/lib/team/useTeamConsoleAccess';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { Match, Team } from '@/types';

/**
 * The one thing the club is being asked for, and why.
 *
 * Both are the same ask — "tell us what you saw" — and the copy differs only in what the
 * league is waiting on. Neither says "submit the result", because a club does not set a
 * result. ADR-005: Field Manager captures, League governs, clubs report and dispute.
 */
const ACCOUNT_COPY = {
  unofficial: {
    title: 'A played match has no official result yet',
    body: 'Your league is settling it. Your club was there: record what you saw and it is weighed alongside the field report.',
    cta: 'Record our account',
  },
  missed: {
    title: 'A fixture passed with nothing recorded',
    body: 'Kickoff has gone by and no result arrived. If the match was played, say so; if it was not, say that too.',
    cta: 'Say what happened',
  },
} as const;

const FORM_STYLE: Record<FormResult, string> = {
  W: 'bg-[var(--state-verified-bg)] text-[var(--state-verified)] border-[var(--state-verified)]/30',
  D: 'bg-surface-3 text-muted border-border-strong',
  L: 'bg-[var(--state-disputed-bg)] text-[var(--state-disputed)] border-[var(--state-disputed)]/30',
};

export function TeamConsoleHome() {
  const catalog = useMyTeam();
  const team = catalog.team;
  const detail = useGoalPlaceData({
    collections: ['matches', 'athletes'],
    scope: { teamId: team?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  // Opponents' names. The club's own league is a bounded list; the whole catalogue is not.
  const league = useGoalPlaceData({
    collections: ['teams'],
    scope: { leagueId: team?.leagueId ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  // Capability, not role — see useTeamConsoleAccess. The console stays fully readable; what
  // it stops doing is offering an action the authority model will refuse.
  const access = useTeamConsoleAccess(team?.id);
  const { matches, athletes, error, retry } = detail;
  const { standing } = useTeamOfficialStanding(team ?? undefined);
  // What the club has already said, so the card never asks for an account twice.
  const [reportsToken, setReportsToken] = useState(0);
  const clubReports = useTeamMatchReports(team?.id, reportsToken);
  const reportedMatchIds = useMemo(() => new Set(clubReports.reports.map((report) => report.matchId)), [clubReports.reports]);
  const teams = league.teams;
  const loading = catalog.loading || (Boolean(team) && (detail.loading || league.loading));
  const [reviewMatch, setReviewMatch] = useState<Match | null>(null);
  const now = useNow();

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  /*
   * What is waiting on the club's account: played matches with no official result, and
   * scheduled ones whose kickoff passed with nothing recorded. Newest first, so the fixture
   * the club most likely remembers is the one on top.
   */
  const awaitingAccount = useMemo(() => {
    type Awaiting = { match: Match; kind: keyof typeof ACCOUNT_COPY };
    if (!team) return [] as Awaiting[];
    return matchesForTeam(team.id, matches)
      .flatMap((match): Awaiting[] => {
        // Already answered. The league has the club's account; asking again is noise.
        if (reportedMatchIds.has(match.id)) return [];
        if (match.status === 'completed' && !isOfficialMatch(match)) return [{ match, kind: 'unofficial' }];
        if (match.status === 'scheduled' && !isStillToPlay(match, now)) return [{ match, kind: 'missed' }];
        return [];
      })
      .sort((a, b) => +new Date(b.match.scheduledAt) - +new Date(a.match.scheduledAt));
  }, [team, matches, now, reportedMatchIds]);

  // Filed and still not settled: recorded by the club, no official result yet.
  const awaitingLeague = useMemo(() => {
    if (!team) return [] as Match[];
    return matchesForTeam(team.id, matches).filter((match) => reportedMatchIds.has(match.id) && !isOfficialMatch(match));
  }, [team, matches, reportedMatchIds]);

  if (loading) return <TeamConsoleHomeSkeleton />;
  if (error) return <ErrorState onRetry={retry} />;

  if (!team) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="No team linked yet"
        description="Once your account is attached to a team, its operations console appears here."
      />
    );
  }

  const upcoming = matchesForTeam(team.id, matches)
    .filter((m) => isStillToPlay(m, now))
    .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))
    .slice(0, 4);
  const roster = rosterForTeam(team.id, athletes);
  const form = recentForm(team.id, matches);
  const top = awaitingAccount[0];
  /*
   * From the standings projection, never the stored aggregate. `teamRecord(team)` read
   * `team.wins` and friends, which were seeded independently of any match and are exactly
   * the numbers the standings projection exists to be the only writer of. No row yet means
   * no record yet, and saying so is more honest than printing zeros that look like a season.
   */
  const record = standing ? `${standing.wins}-${standing.draws}-${standing.losses}` : 'No record yet';

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
            <span className="tabular tabular-nums">{record}</span>
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
      {/* The one thing the club is being asked for. */}
      {top ? (
        <PriorityCard
          kind={top.kind}
          match={top.match}
          teamById={teamById}
          onReview={access.canReportResult ? () => setReviewMatch(top.match) : undefined}
        />
      ) : awaitingLeague.length ? (
        <RecordedCard count={awaitingLeague.length} />
      ) : (
        <AllClearCard />
      )}

      {/* Metric strip */}
      <div className="grid grid-cols-3 gap-2.5">
        <Metric label="Awaiting you" value={awaitingAccount.length} tone={awaitingAccount.length ? 'pending' : 'default'} />
        <Metric label="Squad" value={roster.length} />
        {/* Official standings projection, not the stored aggregate. */}
        <Metric label="Points" value={standing?.points ?? team.leaguePoints ?? 0} tone="brand" />
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

      <ClubResultSheet
        match={reviewMatch}
        team={team}
        opponent={reviewMatch
          ? teamById.get(reviewMatch.homeTeamId === team.id ? reviewMatch.awayTeamId : reviewMatch.homeTeamId)
          : undefined}
        onClose={() => setReviewMatch(null)}
        onDone={() => { retry(); setReportsToken((value) => value + 1); }}
      />
    </div>
  );
}

function formatUgx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

function PriorityCard({
  kind,
  match,
  teamById,
  onReview,
}: {
  kind: keyof typeof ACCOUNT_COPY;
  match: Match;
  teamById: Map<string, Team>;
  /**
   * Absent when the viewer cannot act on this match. The card still renders — knowing a
   * result is outstanding is useful to a club whether or not they are the one who reports on
   * it — but it stops offering a button that would be refused.
   */
  onReview?: () => void;
}) {
  const copy = ACCOUNT_COPY[kind];
  const Icon = kind === 'missed' ? CalendarBlank : Clock;
  const home = teamById.get(match.homeTeamId);
  const away = teamById.get(match.awayTeamId);

  return (
    <Bezel glow>
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Eyebrow className="text-brand">Waiting on your account</Eyebrow>
        <MatchStatusBadge match={match} size="sm" />
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
          {onReview ? (
            <Button iconTrailing={ArrowRight} block onClick={onReview}>
              {copy.cta}
            </Button>
          ) : (
            <p className="text-sm text-muted">
              Your league settles this. It is shown so your club can see what is outstanding.
            </p>
          )}
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
        <h2 className="text-base font-semibold text-text-strong">Nothing is waiting on you</h2>
        <p className="text-sm text-muted">Every played match has an official result.</p>
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

/**
 * The club has answered; the league has not. Said once, without a button, because there is
 * nothing more for the club to do until the league settles it.
 */
function RecordedCard({ count }: { count: number }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--state-pending-bg)] text-[var(--state-pending)]">
        <Clock className="h-5 w-5" weight="bold" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-text-strong">
          Your account is recorded for {count} {count === 1 ? 'match' : 'matches'}
        </p>
        <p className="text-xs text-muted">Waiting on the league. You will see the official result here when it lands.</p>
      </div>
    </Card>
  );
}
