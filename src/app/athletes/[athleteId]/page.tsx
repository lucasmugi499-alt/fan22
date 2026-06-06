'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, HeartHandshake, MapPin, ShieldCheck, Trophy, Users } from 'lucide-react';
import { Athlete } from '@/lib/types';
import { formatUGX, getInitials, getSportTheme } from '@/lib/sportThemes';
import { Button } from '@/components/ui/button';
import { ChallengeCard } from '@/components/ui/challenge-card';
import { FeedCard } from '@/components/ui/feed-card';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { VerificationBadge } from '@/components/ui/verification-badge';
import { CommentsDrawer, PledgeModal, SupportModal } from '@/components/modals/app-modals';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge, TrustNote } from '@/components/ui/product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';

export default function AthleteProfilePage() {
  const router = useRouter();
  const { athleteId } = useParams<{ athleteId: string }>();
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);
  const [pledgeAthlete, setPledgeAthlete] = useState<Athlete | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { athletes, challenges, feedPosts, leagues, matches, teams } = useGoalPlaceData();
  const athlete = athletes.find((item) => item.id === athleteId);

  if (!athlete) {
    return (
      <PageContainer compact>
        <Link href="/athletes" className="text-sm font-bold text-[var(--goal-mint)]">Back to athletes</Link>
        <div className="glass-panel mt-6 rounded-xl p-8 text-center text-slate-300">Athlete not found.</div>
      </PageContainer>
    );
  }

  const team = teams.find((item) => item.id === athlete.teamId);
  const league = leagues.find((item) => item.id === athlete.leagueId);
  const nextMatch = matches.find((match) => match.teamAId === athlete.teamId || match.teamBId === athlete.teamId);
  const athleteChallenges = challenges.filter((challenge) => challenge.athleteId === athlete.id);
  const athleteFeed = feedPosts.filter((post) => post.authorId === athlete.id || post.sport === athlete.sport).slice(0, 4);
  const theme = getSportTheme(athlete.sport);

  return (
    <div>
      <section className={`relative overflow-hidden ${theme.edgeClass}`}>
        <div className="absolute inset-0">
          <ImageWithFallback
            src={athlete.coverUrl}
            alt={`${athlete.name} cover`}
            fallbackType="stadium"
            sport={athlete.sport}
            className="h-full w-full object-cover opacity-45"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#05070A] via-[#05070A]/75 to-[#05070A]/20" />
        </div>
        <PageContainer compact className="relative z-10">
          <Link href="/athletes" className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/7 px-3 py-2 text-sm font-bold text-white">
            <ArrowLeft className="size-4" />
            Back to Athletes
          </Link>
          <div className="grid gap-6 lg:grid-cols-[auto_1fr_auto] lg:items-end">
            <div className="size-28 overflow-hidden rounded-xl border-4 border-[#05070A] bg-white/8 shadow-2xl md:size-36">
              <ImageWithFallback
                src={athlete.avatarUrl}
                alt={athlete.name}
                fallbackType="athlete"
                initials={getInitials(athlete.name)}
                sport={athlete.sport}
                className="h-full w-full object-cover"
              />
            </div>
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <SportBadge sport={athlete.sport} />
                {athlete.verified && <VerificationBadge />}
              </div>
              <h1 className="font-heading text-4xl font-black tracking-tight text-white md:text-6xl">{athlete.name}</h1>
              <p className="mt-3 text-base font-bold text-slate-300">{athlete.position} - {team?.name}</p>
              <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-300">
                <span className="flex items-center gap-1"><MapPin className="size-4" /> {athlete.city}, {athlete.country}</span>
                <span className="flex items-center gap-1"><Trophy className="size-4 text-[var(--goal-gold)]" /> {league?.name}</span>
                <span className="flex items-center gap-1"><Calendar className="size-4 text-[var(--goal-mint)]" /> Next: {nextMatch?.venue}</span>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:w-64 lg:grid-cols-1">
              <Button onClick={() => setSupportAthlete(athlete)}>Support Athlete</Button>
              <Button variant="outline" onClick={() => router.push('/feed')}>Join Fan Club</Button>
              <Button variant="secondary" onClick={() => setPledgeAthlete(athlete)}>Pledge Performance Reward</Button>
            </div>
          </div>
        </PageContainer>
      </section>

      <PageContainer compact>
        <div className="grid gap-3 md:grid-cols-4">
          <ImpactStatCard label="Total support" value={formatUGX(athlete.totalEarnings)} icon={HeartHandshake} />
          <ImpactStatCard label="Supporters" value={String(athlete.supportersCount)} icon={Users} tone="gold" />
          <ImpactStatCard label="Verified" value={athlete.verified ? 'Yes' : 'Pending'} icon={ShieldCheck} tone="blue" />
          <ImpactStatCard label="Next match" value={nextMatch?.status ?? 'Upcoming'} icon={Calendar} tone="orange" />
        </div>

        <Tabs defaultValue="overview" className="mt-8 w-full">
          <TabsList className="hide-scrollbar mb-6 w-full justify-start overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1">
            {['overview', 'stats', 'challenges', 'highlights', 'feed'].map((tab) => (
              <TabsTrigger key={tab} value={tab} className="min-w-28 rounded-lg capitalize data-active:bg-[var(--goal-emerald)] data-active:text-[#031008]">
                {tab}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-8 lg:grid-cols-[1fr_0.8fr]">
              <div className="glass-panel rounded-xl p-5">
                <SectionHeader eyebrow="Portfolio" title="Athlete story" className="mb-4" />
                <p className="text-sm leading-7 text-slate-300">{athlete.bio}</p>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {['Transport support', 'Meals and recovery', 'Training access'].map((item) => (
                    <div key={item} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <p className="font-heading text-base font-black text-white">{item}</p>
                    </div>
                  ))}
                </div>
              </div>
              <TrustNote compact />
            </div>
          </TabsContent>

          <TabsContent value="stats">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(athlete.stats).map(([key, value]) => (
                <ImpactStatCard key={key} label={key} value={String(value)} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="challenges">
            <div className="grid gap-4 md:grid-cols-3">
              {athleteChallenges.map((challenge) => (
                <ChallengeCard key={challenge.id} challenge={challenge} onSupport={() => setPledgeAthlete(athlete)} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="highlights">
            <div className="grid gap-4 md:grid-cols-2">
              {athleteFeed.slice(0, 2).map((post) => (
                <FeedCard key={post.id} post={post} onComment={() => setCommentsOpen(true)} onSupport={() => setSupportAthlete(athlete)} />
              ))}
            </div>
          </TabsContent>

          <TabsContent value="feed">
            <div className="space-y-4">
              {athleteFeed.map((post) => (
                <FeedCard key={post.id} post={post} onComment={() => setCommentsOpen(true)} onSupport={() => setSupportAthlete(athlete)} />
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <section className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="glass-panel rounded-xl p-5">
            <SectionHeader eyebrow="Supporter Wall" title="Top supporters" className="mb-4" />
            {['Mariam K.', 'Lule S.', 'Coach Ivan'].map((name, index) => (
              <div key={name} className="flex items-center justify-between border-b border-white/8 py-3 last:border-0">
                <p className="font-bold text-white">{name}</p>
                <p className="text-sm font-black text-[var(--goal-gold)]">#{index + 1}</p>
              </div>
            ))}
          </div>
          <div className="glass-panel rounded-xl p-5">
            <SectionHeader eyebrow="Impact" title="Support impact" className="mb-4" />
            <p className="text-sm leading-7 text-slate-300">
              Verified support helps {athlete.name.split(' ')[0]} cover travel, nutrition, equipment, and recovery while keeping fans connected to measurable progress.
            </p>
          </div>
        </section>
      </PageContainer>

      <SupportModal athlete={supportAthlete} open={Boolean(supportAthlete)} onOpenChange={(open) => !open && setSupportAthlete(null)} />
      <PledgeModal athlete={pledgeAthlete} open={Boolean(pledgeAthlete)} onOpenChange={(open) => !open && setPledgeAthlete(null)} />
      <CommentsDrawer open={commentsOpen} onOpenChange={setCommentsOpen} />
    </div>
  );
}
