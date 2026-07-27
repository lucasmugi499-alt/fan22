'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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
  Users,
  Target,
  Heart,
  NotePencil,
  QrCode,
} from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
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
import type { Match, MatchEvent, ResultSubmissionEvent, Team } from '@/types';
import { useAuth } from '@/context/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { toast } from 'sonner';
import { getSportTheme } from '@/lib/sportThemes';

const EVENT_META: Record<string, { icon: IconComponent; label: string; scoring?: boolean }> = {
  goal: { icon: SoccerBall, label: 'Goal', scoring: true },
  try: { icon: Lightning, label: 'Try', scoring: true },
  three_pointer: { icon: Basketball, label: 'Three pointer', scoring: true },
  save: { icon: HandPalm, label: 'Save' },
  steal: { icon: Lightning, label: 'Steal' },
  turnover: { icon: ArrowsClockwise, label: 'Turnover' },
};

export function MatchDetail({ matchId, attendanceToken }: { matchId: string; attendanceToken?: string }) {
  const { currentUser, userProfile, role, isDemoMode } = useAuth();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const exact = useGoalPlaceData({
    collections: ['matches'],
    scope: { matchId },
  });
  const match = exact.matches[0];
  const related = useGoalPlaceData({
    collections: ['teams', 'athletes', 'rosters', 'challenges'],
    scope: { leagueId: match?.leagueId ?? '__pending__' },
    recordLimit: 250,
  });
  const { teams, athletes, rosters, challenges } = related;
  const loading = exact.loading || (Boolean(match) && related.loading);
  const [submissionEvents, setSubmissionEvents] = useState<ResultSubmissionEvent[]>([]);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const athleteById = useMemo(() => new Map(athletes.map((a) => [a.id, a])), [athletes]);

  useEffect(() => {
    let cancelled = false;
    provider.getResultSubmissionEvents(matchId)
      .then((items) => {
        if (!cancelled) {
          setSubmissionEvents([...items].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)));
        }
      })
      .catch(() => {
        if (!cancelled) setSubmissionEvents([]);
      });
    return () => { cancelled = true; };
  }, [matchId, provider]);

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
  const homeRoster = rosters.find((roster) => roster.teamId === match.homeTeamId && roster.seasonId === match.seasonId);
  const awayRoster = rosters.find((roster) => roster.teamId === match.awayTeamId && roster.seasonId === match.seasonId);
  const matchChallenges = challenges.filter((challenge) => challenge.matchId === match.id);
  const topPerformer = match.topPerformerId ? athleteById.get(match.topPerformerId) : undefined;
  const sportTheme = getSportTheme(match.sport);

  async function requestCorrection() {
    const actorUserId = currentUser?.uid ?? userProfile?.uid;
    if (!actorUserId || !correctionReason.trim()) {
      toast.error('Add the reason and evidence basis for this correction.');
      return;
    }
    setSavingCorrection(true);
    try {
      await provider.requestResultCorrection(matchId, actorUserId, correctionReason.trim());
      toast.success('Correction request recorded for review.');
      setCorrectionOpen(false);
      setCorrectionReason('');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The correction request could not be recorded.');
    } finally {
      setSavingCorrection(false);
    }
  }

  async function checkIn() {
    if (!attendanceToken || !currentUser) {
      toast.error('Sign in with your fan account before checking in.');
      return;
    }
    setCheckingIn(true);
    try {
      const response = await fetch(`/api/matches/${encodeURIComponent(matchId)}/attendance`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await currentUser.getIdToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ attendanceToken }),
      });
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      if (!response.ok) throw new Error(body.error ?? 'Venue check-in failed.');
      setCheckedIn(true);
      toast.success(body.message ?? 'Matchday attendance recorded.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Venue check-in failed.');
    } finally {
      setCheckingIn(false);
    }
  }

  return (
    <div className="space-y-5">
      <h1 className="sr-only">
        {home?.name ?? 'Home team'} vs {away?.name ?? 'Away team'}
      </h1>
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

      <div className="glass sticky top-[var(--topbar-h)] z-20 -mx-[var(--gutter)] flex min-h-11 items-center justify-center gap-2 border-y border-border px-[var(--gutter)] text-sm font-semibold md:mx-0 md:rounded-[var(--radius-md)] md:border">
        <span className="truncate">{home?.name ?? 'Home'}</span>
        <span data-numeric className="shrink-0 font-mono text-brand">
          {played ? `${match.score.home ?? '-'} - ${match.score.away ?? '-'}` : 'vs'}
        </span>
        <span className="truncate">{away?.name ?? 'Away'}</span>
        <StatusBadge state={state} size="sm" />
      </div>

      {attendanceToken ? (
        <Card className="flex items-center justify-between gap-3 border-brand/30 bg-brand-subtle p-4">
          <div>
            <p className="text-sm font-semibold text-text-strong">Venue check-in</p>
            <p className="text-xs text-muted">This signed matchday link records attendance once. It does not reveal your location.</p>
          </div>
          <Button size="sm" icon={checkedIn ? SealCheck : QrCode} onClick={checkIn} disabled={checkingIn || checkedIn}>
            {checkedIn ? 'Checked in' : checkingIn ? 'Checking...' : 'Check in'}
          </Button>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* Timeline */}
        <div className="space-y-5">
          <Card className="p-4 md:p-5">
            <h2 className="mb-4 flex items-center gap-1.5 text-[15px] font-semibold text-text-strong">
              <Timer className="h-4 w-4 text-brand" weight="bold" /> {sportTheme.name} timeline
            </h2>
            {events.length ? (
              <ol className="relative space-y-1">
                <span className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-border" aria-hidden />
                {events.map((e, i) => (
                  <TimelineEvent key={i} event={e} isHome={e.teamId === match.homeTeamId} athleteName={e.athleteId ? athleteById.get(e.athleteId)?.name : undefined} sport={String(match.sport)} />
                ))}
              </ol>
            ) : (
              <p className="py-4 text-center text-sm text-muted">
                {played ? 'No timed events were recorded for this match.' : 'Events appear here once the match kicks off.'}
              </p>
            )}
          </Card>

          <Card className="p-4 md:p-5">
            <h2 className="mb-4 flex items-center gap-1.5 text-[15px] font-semibold text-text-strong">
              <Users className="h-4 w-4 text-brand" weight="bold" /> Lineups
            </h2>
            <div className="grid gap-5 sm:grid-cols-2">
              <Lineup title={home?.name ?? 'Home team'} athleteIds={homeRoster?.athleteIds ?? []} athleteById={athleteById} />
              <Lineup title={away?.name ?? 'Away team'} athleteIds={awayRoster?.athleteIds ?? []} athleteById={athleteById} />
            </div>
          </Card>

          {matchChallenges.length ? (
            <Card className="p-4 md:p-5">
              <h2 className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold text-text-strong">
                <Target className="h-4 w-4 text-brand-2" weight="bold" /> Match challenges
              </h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {matchChallenges.map((challenge) => (
                  <Link key={challenge.id} href={`/athletes/${challenge.athleteId}`} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3 hover:border-border-strong">
                    <p className="text-sm font-semibold text-text-strong">{challenge.description}</p>
                    <p className="mt-1 text-xs text-muted">{athleteById.get(challenge.athleteId)?.name} / UGX {challenge.totalPledged.toLocaleString()}</p>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
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
            <AuditTimeline steps={submissionEvents.length ? eventProvenance(submissionEvents) : provenance(match, home, away)} />
            {isOfficialMatch(match) && ['league_admin', 'platform_admin', 'super_admin'].includes(role ?? '') ? (
              <Button className="mt-4" block size="sm" variant="secondary" icon={NotePencil} onClick={() => setCorrectionOpen(true)}>Request correction</Button>
            ) : null}
          </Card>

          {topPerformer ? (
            <Link href={`/athletes/${topPerformer.id}`}>
              <Card className="p-4 transition-colors hover:border-border-strong">
                <p className="text-[11px] font-semibold uppercase text-brand">Top performer</p>
                <p className="mt-2 text-base font-semibold text-text-strong">{topPerformer.name}</p>
                <p className="text-sm text-muted">{topPerformer.position}</p>
              </Card>
            </Link>
          ) : null}

          <Card className="p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-text-strong"><Heart className="h-4 w-4 text-brand-2" weight="fill" /> Fan activity</p>
            <p className="mt-2 text-sm text-muted">{match.supportersCount} people followed this match and UGX {match.totalSupport.toLocaleString()} in related athlete support is visible.</p>
          </Card>
        </aside>
      </div>

      <Sheet
        open={correctionOpen}
        onClose={() => setCorrectionOpen(false)}
        title="Request official correction"
        description={`${home?.name ?? 'Home'} vs ${away?.name ?? 'Away'}`}
        footer={<Button block icon={NotePencil} onClick={requestCorrection} disabled={savingCorrection}>{savingCorrection ? 'Recording...' : 'Record correction request'}</Button>}
      >
        <p className="text-sm text-muted">Official results are versioned. The existing record stays in the audit trail while the correction is reviewed and finalized as a new version.</p>
        <label className="mt-4 block text-xs font-semibold uppercase text-subtle">Reason and evidence<textarea className="field mt-2 min-h-28 py-3 normal-case" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></label>
      </Sheet>
    </div>
  );
}

function Lineup({
  title,
  athleteIds,
  athleteById,
}: {
  title: string;
  athleteIds: string[];
  athleteById: Map<string, { id: string; name: string; position: string }>;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase text-subtle">{title}</p>
      <div className="space-y-1">
        {athleteIds.slice(0, 15).map((id, index) => {
          const athlete = athleteById.get(id);
          return (
            <Link key={id} href={`/athletes/${id}`} className="flex min-h-10 items-center gap-2 rounded-[var(--radius-sm)] px-2 hover:bg-surface-2">
              <span data-numeric className="w-6 text-xs font-bold text-brand">{index + 1}</span>
              <span className="min-w-0"><span className="block truncate text-sm font-medium text-text-strong">{athlete?.name ?? 'Squad member'}</span><span className="block truncate text-[11px] text-muted">{athlete?.position}</span></span>
            </Link>
          );
        })}
        {!athleteIds.length ? <p className="text-sm text-muted">Lineup has not been published.</p> : null}
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

function TimelineEvent({ event, isHome, athleteName, sport }: { event: MatchEvent; isHome: boolean; athleteName?: string; sport: string }) {
  const sportLabels: Record<string, Record<string, string>> = {
    Football: { score: 'Goal', card: 'Card', substitution: 'Substitution' },
    football: { score: 'Goal', card: 'Card', substitution: 'Substitution' },
    Basketball: { score: 'Basket', foul: 'Foul', timeout: 'Timeout' },
    basketball: { score: 'Basket', foul: 'Foul', timeout: 'Timeout' },
    Rugby: { score: 'Try', conversion: 'Conversion', penalty: 'Penalty kick' },
    rugby: { score: 'Try', conversion: 'Conversion', penalty: 'Penalty kick' },
  };
  const base = EVENT_META[event.type] ?? { icon: Lightning, label: event.type.replace(/_/g, ' ') };
  const meta = { ...base, label: sportLabels[sport]?.[event.type] ?? base.label };
  const Icon = meta.icon;
  return (
    <li className={cn('relative flex py-1.5', isHome ? 'justify-start pr-[52%]' : 'justify-end pl-[52%]')}>
      {/* Minute chip pinned to the centre spine */}
      <span
        data-numeric
        className="absolute left-1/2 top-1/2 z-10 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-surface-2 text-[11px] font-bold tabular-nums text-text-strong"
      >
        {event.period ? event.period : `${event.minute ?? '·'}\u2032`}
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

function eventProvenance(events: ResultSubmissionEvent[]): AuditStep[] {
  const labels: Record<string, string> = {
    pending_confirmation: 'Result submitted',
    confirmation_overdue: 'Confirmation overdue',
    confirmed: 'Result confirmed',
    disputed: 'Result disputed',
    rejected: 'Submission rejected',
    official: 'Finalized as official',
    superseded: 'Official result superseded',
    withdrawn: 'Submission withdrawn',
  };
  return events.map((event) => ({
    label: labels[event.to] ?? event.to.replace(/_/g, ' '),
    actor: event.actor === 'system' ? 'GoalPlace256 finalizer' : event.actor.replace(/_/g, ' '),
    timestamp: new Date(event.createdAt).toLocaleString('en-GB'),
    note: event.note,
    icon: event.to === 'official' ? ShieldCheck : event.to === 'disputed' ? Warning : SealCheck,
    tone: event.to === 'official' ? 'verified' : event.to === 'disputed' ? 'disputed' : 'pending',
  }));
}
