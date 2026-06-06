'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import {
  ArrowRight,
  Award,
  Building2,
  Coins,
  HeartHandshake,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { Athlete } from '@/lib/types';
import { sponsorPackages } from '@/lib/mockData';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { sports, formatUGX, getInitials, getSportTheme } from '@/lib/sportThemes';
import { Button } from '@/components/ui/button';
import { AthleteCard } from '@/components/ui/athlete-card';
import { ChallengeCard } from '@/components/ui/challenge-card';
import { FeedCard } from '@/components/ui/feed-card';
import { ImageWithFallback } from '@/components/ui/image-with-fallback';
import { MatchCard } from '@/components/ui/match-card';
import {
  BackgroundOrbs,
  GoalPlacePointsBadge,
  ImpactStatCard,
  PageContainer,
  SectionHeader,
  SportBadge,
  StadiumGlow,
  StickyStorySection,
  TrustNote,
} from '@/components/ui/product';
import {
  CommentsDrawer,
  PledgeModal,
  SponsorInterestModal,
  SupportModal,
} from '@/components/modals/app-modals';
import { useAuth } from '@/context/AuthProvider';
import { useAuthModal } from '@/components/auth/AuthRequiredModal';

export default function Home() {
  const { authStatus } = useAuth();
  
  if (authStatus === 'loading') {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#05070A]">
        <div className="size-8 animate-spin rounded-full border-4 border-white/10 border-t-[var(--goal-emerald)]"></div>
      </div>
    );
  }

  if (authStatus === 'logged_in') {
    return <LoggedInHome />;
  }

  return <PublicHome />;
}

function LoggedInHome() {
  const router = useRouter();
  const { userProfile, role } = useAuth();
  const { openAuthModal } = useAuthModal();
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);
  const [pledgeAthlete, setPledgeAthlete] = useState<Athlete | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { athletes, challenges, feedPosts, matches } = useGoalPlaceData();

  const activeChallenges = challenges.filter((c) => c.status === 'Active').slice(0, 3);
  const featuredAthletes = [...athletes].sort((a, b) => b.supportersCount - a.supportersCount).slice(0, 4);

  return (
    <div className="w-full overflow-hidden pb-20 pt-10">
      <PageContainer className="space-y-12">
        <section className="glass-panel rounded-2xl p-6 md:p-10">
          <h1 className="font-heading text-3xl font-black text-white md:text-5xl">Welcome back, {userProfile?.name?.split(' ')[0] || 'Fan'}!</h1>
          <p className="mt-3 text-slate-400">Here is your daily GoalPlace256 summary.</p>
          
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-[var(--goal-gold)]/20 bg-[var(--goal-gold)]/10 p-5">
              <div className="mb-2 flex items-center gap-2 text-[var(--goal-gold)]">
                <Coins className="size-5" />
                <span className="text-[10px] font-black uppercase tracking-wider">Points</span>
              </div>
              <p className="font-heading text-3xl font-black text-white">{userProfile?.points?.toLocaleString() || 0}</p>
            </div>
            <div className="rounded-xl border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/10 p-5">
              <div className="mb-2 flex items-center gap-2 text-[var(--goal-mint)]">
                <Wallet className="size-5" />
                <span className="text-[10px] font-black uppercase tracking-wider">Wallet</span>
              </div>
              <p className="font-heading text-3xl font-black text-white">{formatUGX(userProfile?.walletBalance || 0)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Users className="size-5" />
                <span className="text-[10px] font-black uppercase tracking-wider">Following</span>
              </div>
              <p className="font-heading text-3xl font-black text-white">{userProfile?.followedAthletes?.length || 0}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-5">
              <div className="mb-2 flex items-center gap-2 text-slate-400">
                <Award className="size-5" />
                <span className="text-[10px] font-black uppercase tracking-wider">Awards</span>
              </div>
              <p className="font-heading text-xl font-black text-white mt-1">Eligible to Vote</p>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="For You"
            title="Active Challenges"
            description="Pledge support for verified performance rewards."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {activeChallenges.map((challenge) => {
              const athlete = athletes.find((item) => item.id === challenge.athleteId) ?? featuredAthletes[0];
              return (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  onSupport={() => setPledgeAthlete(athlete)}
                />
              );
            })}
          </div>
        </section>

        <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <SectionHeader
              eyebrow="Your Feed"
              title="Personalized Updates"
              description="Highlights and results from the athletes and teams you follow."
            />
          </div>
          <div className="space-y-4">
            {feedPosts.slice(0, 5).map((post) => {
              const postAthlete = athletes.find((a) => a.id === post.authorId) ?? featuredAthletes[0];
              return (
                <FeedCard
                  key={post.id}
                  post={post}
                  onSupport={() => setSupportAthlete(postAthlete)}
                  onComment={() => setCommentsOpen(true)}
                  onViewProfile={() => router.push(post.authorType === 'Athlete' ? `/athletes/${post.authorId}` : '/feed')}
                  onViewMatch={() => router.push('/matches/m1')}
                />
              );
            })}
          </div>
        </section>

      </PageContainer>
      
      <SupportModal athlete={supportAthlete} open={Boolean(supportAthlete)} onOpenChange={(open) => !open && setSupportAthlete(null)} />
      <PledgeModal athlete={pledgeAthlete} open={Boolean(pledgeAthlete)} onOpenChange={(open) => !open && setPledgeAthlete(null)} />
      <CommentsDrawer open={commentsOpen} onOpenChange={setCommentsOpen} />
    </div>
  );
}

function PublicHome() {
  const router = useRouter();
  const { openAuthModal } = useAuthModal();
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);
  const [pledgeAthlete, setPledgeAthlete] = useState<Athlete | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [sponsorOpen, setSponsorOpen] = useState(false);
  const { athletes, challenges, feedPosts, leagues, matches } = useGoalPlaceData();

  const liveMatches = matches.filter((match) => match.status === 'Live');
  const featuredAthletes = [...athletes].sort((a, b) => b.supportersCount - a.supportersCount).slice(0, 4);
  const activeChallenges = challenges.filter((challenge) => challenge.status === 'Active').slice(0, 3);

  return (
    <div className="w-full overflow-hidden">
      <section className="relative min-h-[calc(100dvh-4rem)] overflow-hidden pt-5 md:min-h-[760px] md:pt-0">
        <StadiumGlow />
        <BackgroundOrbs />
        <PageContainer className="relative z-10 grid gap-8 md:min-h-[690px] md:grid-cols-[1.08fr_0.92fr] md:items-center">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="mb-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/7 px-3 py-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--goal-mint)] backdrop-blur-xl"
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-[var(--goal-emerald)] to-[var(--goal-emerald-dark)] text-[10px] text-white">
                GP
              </span>
              Today on GoalPlace256
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.05 }}
              className="max-w-4xl text-balance font-heading text-[clamp(2.45rem,10vw,5.7rem)] font-black leading-[0.98] tracking-tight text-white"
            >
              Back the athletes. <span className="bg-gradient-to-r from-[var(--goal-mint)] to-[var(--goal-gold)] bg-clip-text text-transparent">Build the game.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.1 }}
              className="mt-5 max-w-2xl text-base leading-7 text-slate-300 md:text-xl md:leading-8"
            >
              Uganda&apos;s mobile-first multi-sport hub for football, basketball, and rugby. Follow local action, support verified athletes, pledge performance rewards, and earn GoalPlace Points for recognition.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.16 }}
              className="mt-6 grid gap-2 sm:grid-cols-3"
            >
              <Button size="lg" onClick={() => router.push('/register?role=fan')}>Join as Fan</Button>
              <Button size="lg" variant="outline" onClick={() => router.push('/register?role=athlete')}>Register Athlete</Button>
              <Button size="lg" variant="secondary" onClick={() => router.push('/register?role=league-admin')}>Register League</Button>
            </motion.div>

            <div className="mt-6 hide-scrollbar flex gap-2 overflow-x-auto pb-1">
              {sports.map((sport) => {
                const Icon = sport.icon;
                return (
                  <button
                    key={sport.slug}
                    className="flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/7 px-3 py-2 text-sm font-black text-white backdrop-blur-xl transition-colors hover:bg-white/12"
                    onClick={() => router.push(`/sports?sport=${sport.slug}`)}
                  >
                    <Icon className="size-4" style={{ color: sport.color }} />
                    {sport.name}
                  </button>
                );
              })}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.12 }}
            className="relative min-h-[330px] md:min-h-[540px]"
          >
            <div className="glass-panel absolute right-0 top-0 w-[78%] rounded-xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-red-300">
                  <span className="size-2 rounded-full bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.9)]" />
                  Live Now
                </span>
                <SportBadge sport={liveMatches[0]?.sport ?? 'Football'} />
              </div>
              <div className="flex items-center justify-between text-center">
                <p className="max-w-24 text-sm font-black text-white">Kisenyi FC</p>
                <p className="rounded-xl bg-black/30 px-4 py-2 font-heading text-3xl font-black text-white">2 - 1</p>
                <p className="max-w-24 text-sm font-black text-white">Makindye Stars</p>
              </div>
              <Button className="mt-4 w-full" size="sm" onClick={() => router.push('/matches/m1')}>View Match</Button>
            </div>

            <div className="glass-panel absolute left-0 top-28 w-[72%] rounded-xl p-4 md:top-40">
              <div className="flex items-center gap-3">
                <div className="size-14 overflow-hidden rounded-xl border border-white/10 bg-white/8">
                  <ImageWithFallback
                    src={featuredAthletes[0]?.avatarUrl}
                    alt={featuredAthletes[0]?.name || ''}
                    fallbackType="athlete"
                    initials={getInitials(featuredAthletes[0]?.name || '')}
                    sport={featuredAthletes[0]?.sport || 'Football'}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div>
                  <SportBadge sport={featuredAthletes[0]?.sport || 'Football'} />
                  <h3 className="mt-2 font-heading text-lg font-black text-white">{featuredAthletes[0]?.name}</h3>
                  <p className="text-xs text-slate-400">Top supported athlete</p>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/8 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--goal-mint)]">Verified Support</p>
                <p className="mt-1 font-heading text-xl font-black text-white">{formatUGX(featuredAthletes[0]?.totalEarnings || 0)}</p>
              </div>
            </div>

            <div className="glass-panel absolute bottom-2 right-5 w-[64%] rounded-xl border-[var(--goal-gold)]/25 p-4 md:bottom-10">
              <div className="flex items-center gap-3 text-[var(--goal-gold)]">
                <Coins className="size-6" />
                <p className="text-[11px] font-black uppercase tracking-[0.18em]">GoalPlace Points</p>
              </div>
              <p className="mt-2 font-heading text-4xl font-black text-white">0</p>
              <p className="mt-1 text-xs text-slate-400">Join to start earning</p>
            </div>
          </motion.div>
        </PageContainer>
      </section>

      <PageContainer className="space-y-14 pb-24 md:space-y-24">
        <section>
          <SectionHeader
            eyebrow="Match Center"
            title="Live now across Uganda"
            description="Follow fixtures, active support challenges, venues, and verified results without hunting across group chats."
            action={<Button variant="outline" onClick={() => router.push('/matches')}>All Matches <ArrowRight className="size-4" /></Button>}
          />
          <div className="hide-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
            {matches.slice(0, 3).map((match) => (
              <div key={match.id} className="w-[86vw] shrink-0 snap-start md:w-auto">
                <MatchCard match={match} onView={() => router.push(`/matches/${match.id}`)} />
              </div>
            ))}
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="Sports Ecosystem"
            title="Choose your sport, then follow the people building it."
            description="GoalPlace256 starts with football, basketball, and rugby, each with sport-specific stats, challenges, cards, and discovery."
          />
          <div className="grid gap-4 md:grid-cols-3">
            {sports.map((sport) => {
              const Icon = sport.icon;
              return (
                <button
                  key={sport.slug}
                  className={`glass-panel group relative min-h-52 overflow-hidden rounded-xl p-5 text-left transition-all hover:-translate-y-1 ${sport.edgeClass}`}
                  onClick={() => router.push(`/sports?sport=${sport.slug}`)}
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${sport.mutedGradient} opacity-70`} />
                  <div className="relative z-10">
                    <div className="mb-10 flex items-center justify-between">
                      <div className="rounded-xl border border-white/10 bg-black/24 p-3">
                        <Icon className="size-6" style={{ color: sport.color }} />
                      </div>
                      <span className="text-xs font-black uppercase tracking-[0.18em] text-slate-300">{sport.shortLabel}</span>
                    </div>
                    <h3 className="font-heading text-2xl font-black text-white">{sport.name}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{sport.statLabels.slice(0, 4).join(' / ')}</p>
                    <span className="mt-5 inline-flex items-center gap-2 text-sm font-black" style={{ color: sport.color }}>
                      Explore Sport <ArrowRight className="size-4" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="Support Challenges"
            title="Trending verified performance rewards"
            description="Support specific athlete achievements, then wait for official confirmation before rewards are paid."
            action={<Button onClick={() => {
              openAuthModal();
            }}>Pledge Support</Button>}
          />
          <div className="grid gap-4 md:grid-cols-3">
            {activeChallenges.map((challenge) => {
              const athlete = athletes.find((item) => item.id === challenge.athleteId) ?? featuredAthletes[0];
              return (
                <ChallengeCard
                  key={challenge.id}
                  challenge={challenge}
                  onSupport={() => {
                    openAuthModal();
                  }}
                />
              );
            })}
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="Athlete Economy"
            title="Top supported athletes"
            description="Compact cards built for quick daily scanning, direct support, and deeper athlete profiles."
            action={<Button variant="outline" onClick={() => router.push('/athletes')}>All Athletes <ArrowRight className="size-4" /></Button>}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featuredAthletes.map((athlete) => (
              <AthleteCard
                key={athlete.id}
                athlete={athlete}
                onSupport={() => {
                  openAuthModal();
                }}
                onView={() => router.push(`/athletes/${athlete.id}`)}
              />
            ))}
          </div>
        </section>

        <StickyStorySection />

        <section className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="lg:sticky lg:top-24">
            <SectionHeader
              eyebrow="Community Feed"
              title="The Social Heartbeat"
              description="Highlights, results, verified achievements, and community moments from Uganda's grassroots sport."
              action={<Button onClick={() => router.push('/feed')}>Open Feed <ArrowRight className="size-4" /></Button>}
            />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <ImpactStatCard label="Community posts" value="1.8k" icon={Sparkles} detail="Highlights, milestones, and updates." />
              <ImpactStatCard label="Verified achievements" value="426" icon={ShieldCheck} tone="gold" detail="Confirmed by admins or officials." />
            </div>
          </div>
          <div className="space-y-4">
            {feedPosts.slice(0, 3).map((post) => (
              <FeedCard
                key={post.id}
                post={post}
                onSupport={() => openAuthModal()}
                onComment={() => openAuthModal()}
                onViewProfile={() => router.push(post.authorType === 'Athlete' ? `/athletes/${post.authorId}` : '/feed')}
                onViewMatch={() => router.push('/matches/m1')}
              />
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="glass-panel rounded-xl p-5 md:p-6">
            <GoalPlacePointsBadge points={0} />
            <h2 className="mt-6 font-heading text-3xl font-black text-white">GoalPlace Points</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Earn loyalty and recognition points for supporting athletes, engaging with verified moments, and participating in the Annual Awards race.
            </p>
            <Button className="mt-6" variant="gold" onClick={() => router.push('/awards')}>View Awards</Button>
          </div>
          <div className="glass-panel rounded-xl p-5 md:p-6">
            <div className="mb-4 flex items-center gap-3 text-[var(--goal-gold)]">
              <Award className="size-7" />
              <span className="text-xs font-black uppercase tracking-[0.18em]">Annual Recognition</span>
            </div>
            <h2 className="font-heading text-3xl font-black text-white">GoalPlace Annual Awards</h2>
            <p className="mt-3 text-sm leading-7 text-slate-300">
              Fans, athletes, teams, leagues, youth programs, and women and youth sport impact all get a year-end spotlight.
            </p>
            <Button className="mt-6" variant="outline" onClick={() => router.push('/awards')}>See Award Race</Button>
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="Leagues"
            title="Featured verified leagues"
            description="League admins confirm achievements, manage fixtures, and keep local sport organized."
            action={<Button variant="outline" onClick={() => router.push('/leagues')}>Explore Leagues</Button>}
          />
          <div className="grid gap-4 md:grid-cols-3">
            {leagues.map((league) => (
              <button
                key={league.id}
                className={`glass-panel rounded-xl p-5 text-left transition-all hover:-translate-y-1 ${getSportTheme(league.sport).edgeClass}`}
                onClick={() => router.push(`/leagues/${league.id}`)}
              >
                <SportBadge sport={league.sport} />
                <h3 className="mt-4 font-heading text-xl font-black text-white">{league.name}</h3>
                <p className="mt-2 text-sm text-slate-400">{league.city}, {league.country}</p>
                <div className="mt-5 grid grid-cols-2 gap-2">
                  <ImpactMini label="Verified" value={`${league.verifiedPercentage}%`} />
                  <ImpactMini label="Complete" value={`${league.completionRate}%`} />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-panel relative overflow-hidden rounded-xl p-5 md:p-8">
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--goal-gold)]/12 via-transparent to-[var(--goal-emerald)]/12" />
          <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--goal-gold)]">Sponsor Impact</p>
              <h2 className="mt-3 font-heading text-3xl font-black text-white md:text-4xl">Local brands can build real sporting infrastructure.</h2>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                Sponsor athletes, teams, leagues, youth programs, women and youth sport, or the Annual Awards with transparent demo reporting.
              </p>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Button variant="gold" onClick={() => setSponsorOpen(true)}>Become a Sponsor</Button>
                <Button variant="outline" onClick={() => router.push('/sponsors')}>View Packages</Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {sponsorPackages.slice(0, 4).map((item) => (
                <div key={item.name} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <Building2 className="mb-3 size-5 text-[var(--goal-gold)]" />
                  <h3 className="font-heading text-base font-black text-white">{item.name}</h3>
                  <p className="mt-1 text-xs font-bold text-[var(--goal-gold)]">{item.price}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <TrustNote />
        </section>

        <section className="relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[var(--goal-emerald)]/20 via-[#111827] to-[var(--rugby)]/18 p-6 text-center md:p-12">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-[var(--goal-mint)]">
            <HeartHandshake className="size-6" />
          </div>
          <h2 className="mx-auto mt-5 max-w-3xl font-heading text-3xl font-black text-white md:text-5xl">Ready to shape the game in Uganda?</h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
            Join as a fan, register as an athlete, or help organize verified league activity on GoalPlace256.
          </p>
          <div className="mt-6 grid gap-2 sm:mx-auto sm:max-w-xl sm:grid-cols-3">
            <Button onClick={() => router.push('/register?role=fan')}>Join as Fan</Button>
            <Button variant="outline" onClick={() => router.push('/register?role=athlete')}>Register Athlete</Button>
            <Button variant="secondary" onClick={() => router.push('/register?role=league-admin')}>Register League</Button>
          </div>
        </section>
      </PageContainer>
      <SponsorInterestModal open={sponsorOpen} onOpenChange={setSponsorOpen} />
    </div>
  );
}

function ImpactMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/8 bg-white/5 p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 font-heading text-xl font-black text-white">{value}</p>
    </div>
  );
}

