'use client';

import { useMemo } from 'react';
import {
  PaperPlaneTilt,
  SealCheck,
  ShieldCheck,
  Warning,
  MapPin,
  SoccerBall,
  HandPalm,
  Basketball,
  ArrowsClockwise,
  Lightning,
  Timer,
} from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { stateForMatch } from '@/lib/statusSystem';
import { isOfficialMatch } from '@/lib/status';
import { sportGradient } from '@/components/premium/IdentityHero';
import { Crest } from '@/components/premium/Crest';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { AuditTimeline, type AuditStep } from '@/components/core/AuditTimeline';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/utils';
import type { IconComponent } from '@/lib/icons';
import type { Match, MatchEvent, Team } from '@/types';

const EVENT_META: Record<string, { icon: IconComponent; label: string; scoring?: boolean }> = {
  goal: { icon: SoccerBall, label: 'Goal', scoring: true },
  try: { icon: Lightning, label: 'Try', scoring: true },
  three_pointer: { icon: Basketball, label: 'Three pointer', scoring: true },
  save: { icon: HandPalm, label: 'Save' },
  steal: { icon: Lightning, label: 'Steal' },
  turnover: { icon: ArrowsClockwise, label: 'Turnover' },
};

export function MatchDetail({ matchId }: { matchId: string }) {
  const { matches, teams, athletes, loading } = useGoalPlaceData({
    collections: ['matches', 'teams', 'athletes'],
  });
  const match = useMemo(() => matches.find((m) => m.id === matchId), [matches, matchId]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const athleteById = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-52 w-full rounded-[var(--radius-xl)]" />
        <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }
  if (!match) {
    return <EmptyState icon={Warning} title="Match not found" description="This fixture may have been removed, or the link is out of date." />;
  }

  const home = teamById.get(match.homeTeamId);
  const away = teamById.get(match.awayTeamId);
  const state = stateForMatch(match);
  const played = match.status === 'completed' || match.status === 'live';
  const live = match.status === 'live';
  const events = [...(match.events ?? [])].sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));

  return (
    <div className="space-y-5">
      {/* Broadcast scoreboard */}
      <div className="sheen relative overflow-hidden rounded-[var(--radius-xl)] shadow-e2" style={{ backgroundImage: sportGradient(String(match.sport)) }}>
        <div className="relative p-5 pb-6 md:p-7">
          <div className="mb-5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/80">
              {new Date(match.scheduledAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            <StatusBadge state={state} size="sm" className="!border-white/30 !bg-black/25 !text-white" />
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 md:gap-6">
            <SidePole team={home} fallback={match.homeTeamId} sport={String(match.sport)} align="right" />
            <div className="text-center">
              {played ? (
                <p data-numeric className="tabular font-display text-5xl font-bold tabular-nums text-white [text-shadow:0_2px_16px_rgba(0,0,0,0.35)] md:text-7xl">
                  {match.score.home ?? '-'}
                  <span className="mx-1.5 opacity-60 md:mx-3">:</span>
                  {match.score.away ?? '-'}
                </p>
              ) : (
                <>
                  <p data-numeric className="tabular font-display text-4xl font-bold tabular-nums text-white md:text-6xl">
                    {new Date(match.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="mt-1 text-xs font-medium uppercase tracking-wide text-white/70">Kick-off</p>
                </>
              )}
              {live ? (
                <span className="mt-2 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-black/30 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                  <span className="h-2 w-2 rounded-full bg-[var(--state-live)] animate-live-ring" /> Live
                </span>
              ) : null}
            </div>
            <SidePole team={away} fallback={match.awayTeamId} sport={String(match.sport)} align="left" />
          </div>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs font-medium text-white/75">
            <MapPin className="h-3.5 w-3.5" /> {match.venue || match.city}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Timeline */}
        <div className="space-y-5">
          <Card className="p-4 md:p-5">
            <h2 className="mb-4 flex items-center gap-1.5 text-[15px] font-semibold text-text-strong">
              <Timer className="h-4 w-4 text-brand" weight="bold" /> Timeline
            </h2>
            {events.length ? (
              <ol className="relative space-y-1">
                <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-border" aria-hidden />
                {events.map((e, i) => (
                  <TimelineEvent key={i} event={e} isHome={e.teamId === match.homeTeamId} athleteName={e.athleteId ? athleteById.get(e.athleteId)?.name : undefined} />
                ))}
              </ol>
            ) : (
              <p className="py-4 text-center text-sm text-muted">
                {played ? 'No timed events were recorded for this match.' : 'Events appear here once the match kicks off.'}
              </p>
            )}
          </Card>
        </div>

        {/* Trust + provenance */}
        <aside className="space-y-5">
          <Card className="p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand">
                <ShieldCheck className="h-5 w-5" weight="bold" />
              </span>
              <div>
                <p className="text-sm font-semibold text-text-strong">{state.label}</p>
                <p className="mt-0.5 text-sm text-muted">{state.explanation}</p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">Provenance</p>
            <AuditTimeline steps={provenance(match, home, away)} />
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SidePole({ team, fallback, sport, align }: { team?: Team; fallback: string; sport: string; align: 'left' | 'right' }) {
  return (
    <div className={cn('flex flex-col items-center gap-2 text-center md:gap-3')}>
      <Crest name={team?.name ?? fallback} sport={sport} size={56} className="!border-white/50 !bg-white/15 !text-white" />
      <span className={cn('line-clamp-2 text-sm font-semibold text-white [text-shadow:0_1px_8px_rgba(0,0,0,0.3)]', align === 'right' ? 'md:text-right' : 'md:text-left')}>
        {team?.name ?? 'Team'}
      </span>
    </div>
  );
}

function TimelineEvent({ event, isHome, athleteName }: { event: MatchEvent; isHome: boolean; athleteName?: string }) {
  const meta = EVENT_META[event.type] ?? { icon: Lightning, label: event.type.replace(/_/g, ' ') };
  const Icon = meta.icon;
  return (
    <li className={cn('relative flex py-1.5', isHome ? 'justify-start pr-[52%]' : 'justify-end pl-[52%]')}>
      {/* Minute chip pinned to the centre spine */}
      <span
        data-numeric
        className="absolute left-1/2 top-1/2 z-10 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface-2 text-[11px] font-bold tabular-nums text-text-strong"
      >
        {event.minute ?? '·'}&#8242;
      </span>
      <div className={cn('flex max-w-full items-start gap-2.5', !isHome && 'flex-row-reverse text-right')}>
        <span
          className={cn(
            'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full',
            meta.scoring ? 'bg-brand-subtle text-brand' : 'bg-surface-3 text-muted'
          )}
        >
          <Icon className="h-4 w-4" weight={meta.scoring ? 'fill' : 'bold'} />
        </span>
        <div className="min-w-0">
          <p className={cn('text-sm font-semibold', meta.scoring ? 'text-brand' : 'text-text-strong')}>
            {meta.label}
            {athleteName ? <span className="font-medium text-text-strong"> · {athleteName}</span> : null}
          </p>
          <p className="text-xs leading-snug text-muted">{event.description}</p>
        </div>
      </div>
    </li>
  );
}

function provenance(match: Match, home?: Team, away?: Team): AuditStep[] {
  const steps: AuditStep[] = [
    { label: 'Result submitted', actor: `${home?.name ?? 'Home team'} (team admin)`, icon: PaperPlaneTilt, tone: 'neutral' },
  ];
  if (isOfficialMatch(match)) {
    steps.push({ label: 'Confirmed by opponent', actor: `${away?.name ?? 'Away team'} (team admin)`, icon: SealCheck, tone: 'verified' });
    steps.push({ label: 'Finalized as official', actor: 'GoalPlace256 finalizer', icon: ShieldCheck, tone: 'verified' });
  } else if (match.verificationStatus === 'disputed') {
    steps.push({ label: 'Disputed by opponent', actor: `${away?.name ?? 'Away team'} (team admin)`, icon: Warning, tone: 'disputed' });
    steps.push({ label: 'Under league review', actor: 'League admin', icon: ShieldCheck, tone: 'pending' });
  } else if (match.status === 'completed') {
    steps.push({ label: 'Awaiting confirmation', actor: `${away?.name ?? 'Away team'} has 72 hours to respond`, icon: SealCheck, tone: 'pending' });
  } else {
    steps[0] = { label: 'Scheduled', actor: 'League fixture list', icon: PaperPlaneTilt, tone: 'neutral' };
    steps.push({ label: 'Result flow begins after full time', actor: 'Both team admins', icon: SealCheck, tone: 'neutral' });
  }
  return steps;
}
