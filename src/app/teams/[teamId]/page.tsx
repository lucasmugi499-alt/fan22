'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, HeartHandshake, ShieldCheck, Trophy, Users } from 'lucide-react';
import { Athlete } from '@/lib/types';
import { formatUGX, getSportTheme } from '@/lib/sportThemes';
import { AthleteCard } from '@/components/ui/athlete-card';
import { FeedCard } from '@/components/ui/feed-card';
import { MatchCard } from '@/components/ui/match-card';
import { SupportModal } from '@/components/modals/app-modals';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge, TrustNote } from '@/components/ui/product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';

export default function TeamDetailPage() {
  const router = useRouter();
  const { teamId } = useParams<{ teamId: string }>();
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);
  const { athletes: allAthletes, feedPosts, leagues, matches: allMatches, teams } = useGoalPlaceData();
  const team = teams.find((item) => item.id === teamId);

  if (!team) {
    return (
      <PageContainer compact>
        <Link href="/matches" className="text-sm font-bold text-[var(--goal-mint)]">Back to matches</Link>
        <div className="glass-panel mt-6 rounded-xl p-8 text-center text-slate-300">Team not found.</div>
      </PageContainer>
    );
  }

  const theme = getSportTheme(team.sport);
  const league = leagues.find((item) => item.id === team.leagueId);
  const athletes = allAthletes.filter((athlete) => athlete.teamId === team.id);
  const matches = allMatches.filter((match) => match.teamAId === team.id || match.teamBId === team.id);
  const feed = feedPosts.filter((post) => post.authorId === team.id || post.sport === team.sport).slice(0, 3);

  return (
    <PageContainer compact>
      <Link href="/matches" className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/7 px-3 py-2 text-sm font-bold text-white">
        <ArrowLeft className="size-4" />
        Back
      </Link>

      <section className={`glass-panel rounded-xl p-5 md:p-8 ${theme.edgeClass}`}>
        <SportBadge sport={team.sport} />
        <h1 className="mt-4 font-heading text-4xl font-black text-white md:text-6xl">{team.name}</h1>
        <p className="mt-3 text-sm text-slate-400">{team.location} - {league?.name}</p>
      </section>

      <div className="mt-8 grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Support pool" value={formatUGX(team.supportPool)} icon={HeartHandshake} />
        <ImpactStatCard label="Athletes" value={String(athletes.length)} icon={Users} tone="gold" />
        <ImpactStatCard label="Matches" value={String(matches.length)} icon={Trophy} tone="blue" />
        <ImpactStatCard label="Verified league" value={`${league?.verifiedPercentage ?? 0}%`} icon={ShieldCheck} tone="orange" />
      </div>

      <section className="mt-8">
        <SectionHeader eyebrow="Roster" title="Team roster" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {athletes.map((athlete) => (
            <AthleteCard key={athlete.id} athlete={athlete} onSupport={() => setSupportAthlete(athlete)} onView={() => router.push(`/athletes/${athlete.id}`)} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <SectionHeader eyebrow="Matches" title="Team matches" />
        <div className="grid gap-4 md:grid-cols-3">
          {matches.map((match) => (
            <MatchCard key={match.id} match={match} onView={() => router.push(`/matches/${match.id}`)} />
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div>
          <SectionHeader eyebrow="Feed" title="Team activity" />
          <div className="space-y-4">
            {feed.map((post) => (
              <FeedCard key={post.id} post={post} onSupport={() => setSupportAthlete(athletes[0] ?? null)} />
            ))}
          </div>
        </div>
        <TrustNote compact />
      </section>

      <SupportModal athlete={supportAthlete} open={Boolean(supportAthlete)} onOpenChange={(open) => !open && setSupportAthlete(null)} />
    </PageContainer>
  );
}
