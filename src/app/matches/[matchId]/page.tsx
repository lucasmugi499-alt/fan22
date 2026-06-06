'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

import React, { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, CheckCircle2, MapPin, ShieldCheck, Trophy, Users, Zap } from 'lucide-react';
import { Athlete } from '@/types';
import { formatUGX, getInitials, getSportTheme } from '@/lib/sportThemes';
import { Button } from '@/components/ui/button';
import { ChallengeCard } from '@/components/ui/challenge-card';
import { FeedCard } from '@/components/ui/feed-card';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { CommentsDrawer, PledgeModal, SupportModal } from '@/components/modals/app-modals';
import { ImpactStatCard, PageContainer, SectionHeader, SportBadge, TrustNote } from '@/components/ui/product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { canonicalEntityId } from '@/lib/idAliases';

function MatchDetailsPageContent() {
  const router = useRouter();
  const { matchId } = useParams<{ matchId: string }>();
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);
  const [pledgeAthlete, setPledgeAthlete] = useState<Athlete | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { athletes, challenges, feedPosts, matches, teams } = useGoalPlaceData();
  const resolvedMatchId = canonicalEntityId(matchId as string, 'match', 'm');
  const match = matches.find((item) => item.id === matchId || item.id === resolvedMatchId);

  if (!match) {
    return (
      <PageContainer compact>
        <Link href="/matches" className="text-sm font-bold text-[var(--goal-mint)]">Back to matches</Link>
        <div className="glass-panel mt-6 rounded-xl p-8 text-center text-slate-300">Match not found.</div>
      </PageContainer>
    );
  }

  const teamA = teams.find((team) => team.id === match.teamAId);
  const teamB = teams.find((team) => team.id === match.teamBId);
  const teamAAthletes = athletes.filter((athlete) => athlete.teamId === teamA?.id);
  const teamBAthletes = athletes.filter((athlete) => athlete.teamId === teamB?.id);
  const matchChallenges = challenges.filter((challenge) => challenge.matchId === match.id);
  const relatedFeed = feedPosts.filter((post) => post.sport === match.sport).slice(0, 3);
  const theme = getSportTheme(match.sport);
  const supportPool = (teamA?.supportPool ?? teamA?.totalSupport ?? 0) + (teamB?.supportPool ?? teamB?.totalSupport ?? 0);
  const matchDate = match.date ?? match.scheduledAt;
  const homeScore = match.teamAScore ?? match.score.home ?? 0;
  const awayScore = match.teamBScore ?? match.score.away ?? 0;

  return (
    <PageContainer compact>
      <Link href="/matches" className="mb-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/7 px-3 py-2 text-sm font-bold text-white">
        <ArrowLeft className="size-4" />
        Back to Matches
      </Link>

      <section className={`glass-panel relative overflow-hidden rounded-xl p-5 md:p-8 ${theme.edgeClass}`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${theme.mutedGradient} opacity-55`} />
        <div className="relative z-10">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {match.status === 'Live' && <span className="size-3 rounded-full bg-red-400 shadow-[0_0_16px_rgba(248,113,113,0.9)]" />}
              <span className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-300">{match.status}</span>
            </div>
            <SportBadge sport={match.sport} />
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <TeamBlock name={teamA?.name ?? 'Team A'} logoUrl={teamA?.logoUrl ?? ''} sport={match.sport} onClick={() => teamA && router.push(`/teams/${teamA.id}`)} />
            <div className="rounded-xl border border-white/12 bg-black/30 px-4 py-4 text-center">
              {match.status === 'Upcoming' ? (
                <p className="font-heading text-3xl font-black text-white">VS</p>
              ) : (
                <p className="font-heading text-4xl font-black text-white md:text-6xl">{homeScore} - {awayScore}</p>
              )}
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Scoreboard</p>
            </div>
            <TeamBlock name={teamB?.name ?? 'Team B'} logoUrl={teamB?.logoUrl ?? ''} sport={match.sport} onClick={() => teamB && router.push(`/teams/${teamB.id}`)} />
          </div>

          <div className="mt-6 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
            <span className="flex items-center gap-2"><Calendar className="size-4 text-[var(--goal-mint)]" /> {new Date(matchDate).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            <span className="flex items-center gap-2"><MapPin className="size-4 text-[var(--goal-gold)]" /> {match.venue}</span>
            <span className="flex items-center gap-2"><ShieldCheck className="size-4 text-[var(--goal-mint)]" /> {match.verificationStatus}</span>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-3 md:grid-cols-4">
        <ImpactStatCard label="Support pool" value={formatUGX(supportPool)} icon={Trophy} />
        <ImpactStatCard label="Active challenges" value={String(matchChallenges.filter((challenge) => challenge.status === 'Active').length)} icon={Zap} tone="gold" />
        <ImpactStatCard label="Rosters" value={String(teamAAthletes.length + teamBAthletes.length)} icon={Users} tone="blue" />
        <ImpactStatCard label="Verification" value={match.verificationStatus} icon={CheckCircle2} tone="orange" />
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1fr_0.9fr]">
        <div>
          <SectionHeader eyebrow="Team Comparison" title="Team comparison" />
          <div className="grid gap-4 md:grid-cols-2">
            {[teamA, teamB].map((team) => team && (
              <div key={team.id} className="glass-panel rounded-xl p-5">
                <SportBadge sport={team.sport} />
                <h3 className="mt-4 font-heading text-2xl font-black text-white">{team.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{team.location}</p>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {(team.recentResults ?? ['W', 'D', 'L']).map((result, index) => (
                    <div key={`${team.id}-${index}`} className="rounded-lg border border-white/10 bg-white/5 p-3 text-center font-heading text-lg font-black text-white">
                      {result}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <TrustNote compact />
      </section>

      <section className="mt-8">
        <SectionHeader eyebrow="Active Challenges" title="Active challenges" />
        <div className="grid gap-4 md:grid-cols-3">
          {matchChallenges.map((challenge) => {
            const athlete = athletes.find((item) => item.id === challenge.athleteId);
            return <ChallengeCard key={challenge.id} challenge={challenge} onSupport={() => setPledgeAthlete(athlete ?? null)} />;
          })}
        </div>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <Roster title={`${teamA?.name} roster`} athletes={teamAAthletes} onSupport={setSupportAthlete} />
        <Roster title={`${teamB?.name} roster`} athletes={teamBAthletes} onSupport={setSupportAthlete} />
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="glass-panel rounded-xl p-5">
          <SectionHeader eyebrow="Timeline" title="Match timeline" className="mb-4" />
          {['Kickoff confirmed', 'Challenge window open', 'Halftime review', 'Official verification after full time'].map((item, index) => (
            <div key={item} className="flex gap-3 border-b border-white/8 py-3 last:border-0">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/8 font-heading text-xs font-black text-[var(--goal-mint)]">{index + 1}</span>
              <p className="text-sm font-semibold text-slate-300">{item}</p>
            </div>
          ))}
        </div>
        <div>
          <SectionHeader eyebrow="Related Feed" title="Related feed posts" />
          <div className="space-y-4">
            {relatedFeed.map((post) => (
              <FeedCard key={post.id} post={post} onComment={() => setCommentsOpen(true)} onSupport={() => setSupportAthlete(athletes[0] ?? null)} />
            ))}
          </div>
        </div>
      </section>

      <SupportModal athlete={supportAthlete} open={Boolean(supportAthlete)} onOpenChange={(open) => !open && setSupportAthlete(null)} />
      <PledgeModal athlete={pledgeAthlete} open={Boolean(pledgeAthlete)} onOpenChange={(open) => !open && setPledgeAthlete(null)} />
      <CommentsDrawer open={commentsOpen} onOpenChange={setCommentsOpen} />
    </PageContainer>
  );
}

export default function MatchDetailsPage() {
  return (
    <ProtectedRoute>
      <MatchDetailsPageContent />
    </ProtectedRoute>
  );
}

function TeamBlock({ name, logoUrl, sport, onClick }: { name: string; logoUrl: string; sport: string; onClick: () => void }) {
  return (
    <button className="flex min-w-0 flex-col items-center gap-3" onClick={onClick}>
      <div className="size-16 overflow-hidden rounded-xl border border-white/12 bg-white/8 p-0.5 md:size-20">
        <ImageWithFallback src={logoUrl} alt={name} fallbackType="team" initials={getInitials(name)} sport={sport} className="h-full w-full rounded-lg object-cover" />
      </div>
      <p className="line-clamp-2 text-center font-heading text-base font-black text-white md:text-xl">{name}</p>
    </button>
  );
}

function Roster({ title, athletes, onSupport }: { title: string; athletes: Athlete[]; onSupport: (athlete: Athlete) => void }) {
  return (
    <div className="glass-panel rounded-xl p-5">
      <h3 className="font-heading text-2xl font-black text-white">{title}</h3>
      <div className="mt-5 space-y-3">
        {athletes.map((athlete) => (
          <div key={athlete.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="size-11 overflow-hidden rounded-lg bg-white/8">
              <ImageWithFallback src={athlete.avatarUrl} alt={athlete.name} fallbackType="athlete" initials={getInitials(athlete.name)} sport={athlete.sport} className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-heading text-base font-black text-white">{athlete.name}</p>
              <p className="text-xs text-slate-400">{athlete.position}</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => onSupport(athlete)}>Support</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
