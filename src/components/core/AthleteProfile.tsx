'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { HandHeart, Warning, MapPin } from '@phosphor-icons/react';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { athletePhoto } from '@/lib/media';
import { clubColor } from '@/lib/clubColors';
import { useAuthGate } from '@/components/auth/AuthRequiredModal';
import { isUpcomingMatch } from '@/lib/status';
import { IdentityHero, sportGradient } from '@/components/premium/IdentityHero';
import { NextMatchCard } from '@/components/premium/NextMatchCard';
import { PeopleCarousel } from '@/components/premium/PeopleCarousel';
import { NewsRow } from '@/components/premium/NewsRow';
import { OfficialStats } from '@/components/athlete/OfficialStats';
import { SupportSheet } from '@/components/fan/SupportSheet';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FollowButton } from '@/components/core/FollowButton';
import { CareerPassport } from '@/components/athlete/CareerPassport';
import { AthleteClaiming } from '@/components/athlete/AthleteClaiming';

function ugx(n: number): string {
  if (n >= 1_000_000) return `UGX ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `UGX ${(n / 1_000).toFixed(0)}k`;
  return `UGX ${n}`;
}

export function AthleteProfile({ athleteId }: { athleteId: string }) {
  const searchParams = useSearchParams();
  const exact = useGoalPlaceData({
    collections: ['athletes'],
    scope: { athleteId },
  });
  const athlete = exact.athletes[0];
  const related = useGoalPlaceData({
    collections: ['athletes', 'teams', 'matches', 'feedPosts', 'leagues', 'seasons', 'supportNeeds'],
    scope: { teamId: athlete?.teamId ?? 'goalplace-pending' },
    recordLimit: 200,
  });
  const challengeData = useGoalPlaceData({
    collections: ['challenges'],
    scope: { athleteId },
    recordLimit: 100,
  });
  const { athletes, teams, matches, feedPosts, leagues, seasons, supportNeeds } = related;
  const challenges = challengeData.challenges;
  const loading = exact.loading || (Boolean(athlete) && (related.loading || challengeData.loading));
  const { requireAuth } = useAuthGate();
  const [supporting, setSupporting] = useState(false);
  const team = useMemo(() => teams.find((t) => t.id === athlete?.teamId), [teams, athlete]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const teammates = useMemo(() => athletes.filter((a) => a.teamId === athlete?.teamId && a.id !== athleteId).slice(0, 10), [athletes, athlete, athleteId]);
  const nextMatch = useMemo(
    () => matches.filter((m) => (m.homeTeamId === athlete?.teamId || m.awayTeamId === athlete?.teamId) && isUpcomingMatch(m)).sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt))[0],
    [matches, athlete]
  );
  const news = useMemo(() => feedPosts.filter((p) => p.relatedTeamId === athlete?.teamId || p.relatedAthleteId === athleteId), [feedPosts, athlete, athleteId]);
  const league = useMemo(() => leagues.find((item) => item.id === athlete?.leagueId), [athlete, leagues]);
  const athleteChallenges = useMemo(() => challenges.filter((item) => item.athleteId === athleteId), [athleteId, challenges]);
  const athleteNeeds = useMemo(() => supportNeeds.filter((item) => item.athleteId === athleteId), [athleteId, supportNeeds]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-36 w-full rounded-[var(--radius-xl)]" /><Skeleton className="h-40 w-full rounded-[var(--radius-lg)]" /></div>;
  if (!athlete) return <EmptyState icon={Warning} title="Athlete not found" description="This profile may have been removed, or the link is out of date." />;

  const photo = athletePhoto(athlete);
  const stats = athlete.stats ?? {};
  const headline = [
    { label: 'Appearances', value: stats.appearances ?? stats.matches ?? stats.matchesPlayed ?? 0 },
    { label: 'Goals', value: stats.goals ?? 0 },
    { label: 'Assists', value: stats.assists ?? 0 },
  ];

  return (
    <div className="space-y-5">
      {searchParams.get('claim') && !athlete.userId ? (
        <Card className="p-4">
          <AthleteClaiming athletes={[athlete]} />
        </Card>
      ) : null}
      <IdentityHero
        gradient={team ? clubColor(team.name).gradient : sportGradient(String(athlete.sport))}
        media={
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt={athlete.name} className="h-20 w-20 rounded-[var(--radius-lg)] border-2 border-white/40 object-cover" loading="lazy" />
        }
        watermark={<span className="font-display font-black text-white">{athlete.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>}
        eyebrow={team?.name}
        title={athlete.name}
        verified={athlete.verified}
        action={<FollowButton targetType="athlete" targetId={athlete.id} label="Follow" />}
        meta={
          <>
            <span>{athlete.position}</span>
            <span className="opacity-50">|</span>
            <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {athlete.city}</span>
          </>
        }
      />

      {/* Headline stats */}
      <div className="grid grid-cols-3 gap-2.5">
        {headline.map((s) => (
          <Card key={s.label} className="p-3.5 text-center">
            <p data-numeric className="tabular text-3xl font-bold tabular-nums text-text-strong">{s.value}</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-subtle">{s.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-5">
          {nextMatch ? <NextMatchCard match={nextMatch} home={teamById.get(nextMatch.homeTeamId)} away={teamById.get(nextMatch.awayTeamId)} /> : null}
          <PeopleCarousel title="Teammates" athletes={teammates} />
          <NewsRow title="From the club" posts={news} />
        </div>

        <aside className="space-y-5">
          <OfficialStats stats={stats} verified={athlete.verified} />
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted">Support raised</span>
              <span data-numeric className="text-sm font-bold tabular-nums text-[var(--brand-2)]">{ugx(athlete.totalSupport)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-sm text-muted">Supporters</span>
              <span data-numeric className="text-sm font-bold tabular-nums text-text-strong">{athlete.supportersCount}</span>
            </div>
          </Card>
        </aside>
      </div>

      <CareerPassport
        athlete={athlete}
        team={team}
        league={league}
        seasons={seasons}
        matches={matches}
        challenges={athleteChallenges}
        supportNeeds={athleteNeeds}
      />

      <div className="sticky bottom-[calc(var(--nav-h)+var(--safe-bottom)+8px)] md:static">
        <Button block icon={HandHeart} onClick={() => requireAuth(() => setSupporting(true), 'Sign in to back this athlete.')}>
          Back {athlete.name.split(' ')[0]}
        </Button>
      </div>

      <SupportSheet open={supporting} onClose={() => setSupporting(false)} athlete={athlete} />
    </div>
  );
}
