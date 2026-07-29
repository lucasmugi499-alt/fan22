'use client';

import { useMemo, useState } from 'react';
import { SealCheck, PencilSimple, Coins, Users, Star, Target, Question, Camera, Heart, CalendarBlank, CheckCircle } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyAthlete } from '@/lib/athlete/athleteContext';
import { athletePhoto, bannerImage } from '@/lib/media';
import { normalizeChallengeStatus, challengeLabel } from '@/lib/status';
import { OfficialStats } from '@/components/athlete/OfficialStats';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { AthleteClaiming } from '@/components/athlete/AthleteClaiming';
import { VerificationBadge } from '@/components/ui/StatusBadge';
import { normalizeVerificationStatus } from '@/lib/status';
import {
  AthleteManageSheet,
  type AthleteManageMode,
} from '@/components/athlete/AthleteManageSheet';
import { SupportNeedUpdateSheet } from '@/components/athlete/SupportNeedUpdateSheet';
import type { SupportNeed } from '@/types';

function ugx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

export function AthleteDashboard() {
  const { userProfile, isDemoMode } = useAuth();
  const { athletes, teams, challenges, matches, supportNeeds, loading, retry } = useGoalPlaceData({
    collections: ['athletes', 'teams', 'challenges', 'matches', 'supportNeeds'],
  });
  const [manageMode, setManageMode] = useState<AthleteManageMode | null>(null);
  const [activeNeed, setActiveNeed] = useState<SupportNeed | null>(null);

  const athlete = useMemo(() => resolveMyAthlete(userProfile, athletes, isDemoMode), [userProfile, athletes, isDemoMode]);
  const team = useMemo(() => teams.find((t) => t.id === athlete?.teamId), [teams, athlete]);
  const myChallenges = useMemo(
    () => (athlete ? challenges.filter((c) => c.athleteId === athlete.id) : []),
    [challenges, athlete]
  );
  const nextMatch = useMemo(
    () => athlete
      ? matches
        .filter((match) => (match.homeTeamId === athlete.teamId || match.awayTeamId === athlete.teamId) && match.status === 'scheduled')
        .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0]
      : undefined,
    [athlete, matches],
  );

  if (loading) return <AthleteDashboardSkeleton />;
  if (!athlete) return <AthleteClaiming athletes={athletes} onChanged={retry} />;

  const cover = athlete.coverUrl || athlete.coverURL || bannerImage(athlete.teamId || athlete.id, athlete.position);
  const avatar = athletePhoto(athlete);
  const vs = normalizeVerificationStatus(athlete.verificationStatus);

  return (
    <div className="space-y-5">
      {/* Identity with cover */}
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bezel-core">
        <div className="relative h-28 bg-surface-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" className="h-full w-full object-cover opacity-80" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-1 to-transparent" />
        </div>
        <div className="relative px-4 pb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatar} alt={athlete.name} className="-mt-9 h-18 w-18 rounded-[var(--radius-lg)] border-2 border-surface-1 object-cover" style={{ height: 72, width: 72 }} loading="lazy" />
          <div className="mt-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-semibold text-text-strong">{athlete.name}</h1>
                {athlete.verified ? <SealCheck className="h-5 w-5 shrink-0 text-[var(--state-verified)]" weight="fill" /> : null}
              </div>
              <p className="truncate text-sm text-muted">{athlete.position} · {team?.name ?? athlete.city}</p>
              <div className="mt-2"><VerificationBadge status={vs} size="sm" /></div>
            </div>
            <Button size="sm" variant="secondary" icon={PencilSimple} onClick={() => setManageMode('profile')}>
              Edit
            </Button>
          </div>
        </div>
      </div>

      {/* Support summary */}
      <div className="grid grid-cols-3 gap-2.5">
        <Metric icon={Coins} label="Raised" value={ugx(athlete.totalSupport)} accent="text-[var(--brand-2)]" />
        <Metric icon={Users} label="Supporters" value={String(athlete.supportersCount)} accent="text-text-strong" />
        <Metric icon={Star} label="GP Points" value={String(athlete.goalPlacePoints)} accent="text-brand" />
      </div>

      <Card className="p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-brand">Today</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <TodayItem
            icon={CalendarBlank}
            label={nextMatch ? 'Next match' : 'Match schedule'}
            value={nextMatch ? new Date(nextMatch.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'No fixture published'}
          />
          <TodayItem
            icon={PencilSimple}
            label="Profile task"
            value={athlete.bio && athlete.impactNeeds?.length ? 'Profile is ready' : 'Complete your career story'}
          />
          <TodayItem
            icon={myChallenges.length ? Target : CheckCircle}
            label="Challenge progress"
            value={myChallenges.length ? `${myChallenges.filter((challenge) => !['achieved', 'not_achieved', 'void', 'settled'].includes(normalizeChallengeStatus(challenge.status))).length} active milestones` : 'No active milestones'}
          />
        </div>
      </Card>

      {/* Official (non-editable) stats */}
      <OfficialStats stats={athlete.stats} verified={athlete.verified} />

      {/* Editable profile, clearly separated */}
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-1.5">
          <PencilSimple className="h-4 w-4 text-muted" weight="bold" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-subtle">Your profile</span>
          <span className="text-[11px] text-subtle">· you control this</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">{athlete.bio || 'Add a short bio so fans and sponsors know your story.'}</p>
        {athlete.impactNeeds?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {athlete.impactNeeds.map((need, i) => (
              <span key={i} className="rounded-[var(--radius-pill)] border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted">{need}</span>
            ))}
          </div>
        ) : null}
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Action icon={Heart} label="Add need" onClick={() => setManageMode('support')} />
        <Action icon={Target} label="Challenge" onClick={() => setManageMode('challenge')} />
        <Action icon={Camera} label="Highlight" onClick={() => setManageMode('highlight')} />
      </div>

      {supportNeeds.some((need) => need.athleteId === athlete.id && ['open', 'funded'].includes(need.status)) ? (
        <Card className="p-4">
          <p className="text-[11px] font-semibold uppercase text-subtle">Active support needs</p>
          <div className="mt-2 space-y-2">
            {supportNeeds.filter((need) => need.athleteId === athlete.id && ['open', 'funded'].includes(need.status)).map((need) => (
              <div key={need.id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <span className="block truncate text-text-strong">{need.title}</span>
                  <span data-numeric className="text-xs text-muted">{ugx(need.raisedAmount)} / {ugx(need.targetAmount)}</span>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setActiveNeed(need)}>
                  {need.status === 'funded' ? 'Add evidence' : 'Post update'}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {/* Challenges */}
      <section className="space-y-2.5">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-text-strong">
          <Target className="h-4 w-4 text-brand" weight="bold" /> Verified challenges
        </h2>
        {myChallenges.length ? (
          <div className="space-y-2">
            {myChallenges.map((c) => {
              const status = normalizeChallengeStatus(c.status);
              const cvs = normalizeVerificationStatus(c.verificationStatus);
              return (
                <Card key={c.id} className="flex items-center gap-3 p-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand">
                    <Target className="h-4 w-4" weight="bold" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-text-strong">{c.description || c.targetDescription || c.type}</p>
                    <p className="text-xs text-muted">
                      {challengeLabel(status)} · {c.fundingModel === 'non_cash'
                        ? `${c.supportersCount} participants`
                        : `Sponsor grant · UGX ${c.totalPledged.toLocaleString()}`}
                    </p>
                  </div>
                  <VerificationBadge status={cvs} size="sm" />
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="flex items-center gap-3 p-4">
            <Question className="h-5 w-5 text-muted" />
            <p className="text-sm text-muted">No milestones yet. Propose a non-cash development target for Team and League review.</p>
          </Card>
        )}
      </section>

      <AthleteManageSheet
        athlete={athlete}
        matches={matches.filter((match) => match.homeTeamId === athlete.teamId || match.awayTeamId === athlete.teamId)}
        mode={manageMode}
        onClose={() => setManageMode(null)}
        onSaved={retry}
      />
      <SupportNeedUpdateSheet need={activeNeed} onClose={() => setActiveNeed(null)} onSaved={retry} />
    </div>
  );
}

function Action({ icon: Icon, label, onClick }: { icon: typeof Heart; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-16 flex-col items-center justify-center rounded-[var(--radius-md)] border border-border bg-surface-1 px-2 text-xs font-semibold text-muted transition-colors hover:border-brand hover:text-brand">
      <Icon className="mb-1 h-5 w-5" weight="duotone" />
      {label}
    </button>
  );
}

function TodayItem({ icon: Icon, label, value }: { icon: typeof Heart; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-[var(--radius-md)] bg-surface-2 p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand" weight="bold" />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase text-subtle">{label}</p>
        <p className="mt-1 text-sm font-medium text-text-strong">{value}</p>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, accent }: { icon: typeof Coins; label: string; value: string; accent: string }) {
  return (
    <Card className="p-3.5">
      <span className="mb-2 inline-grid h-8 w-8 place-items-center rounded-full bg-surface-3 text-muted">
        <Icon className="h-4 w-4" weight="bold" />
      </span>
      <p data-numeric className={`tabular text-lg font-bold tabular-nums ${accent}`}>{value}</p>
      <p className="text-[11px] font-medium uppercase tracking-wide text-subtle">{label}</p>
    </Card>
  );
}

function AthleteDashboardSkeleton() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-44 w-full rounded-[var(--radius-lg)]" />
      <div className="grid grid-cols-3 gap-2.5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-[var(--radius-lg)]" />)}</div>
      <Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" />
    </div>
  );
}
