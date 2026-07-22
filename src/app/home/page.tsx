'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Notification01Icon, Logout01Icon, SecurityCheckIcon, UserIcon, Wallet01Icon, ZapIcon } from 'hugeicons-react';
import { Trophy, Medal } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { CommentsDrawer, PledgeModal, SupportModal } from '@/components/modals/app-modals';
import { Button } from '@/components/ui/button';
import { FeedCard } from '@/components/ui/feed-card';
import { MatchCard } from '@/components/ui/match-card';
import { PageContainer, SectionHeader, SportBadge } from '@/components/ui/product';
import { useAuth } from '@/context/AuthProvider';
import { Athlete } from '@/types';
import { formatUGX, sports } from '@/lib/sportThemes';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';

import { RoleQuickActions } from '@/components/ui/RoleQuickActions';
import { ROLE_CONFIGS } from '@/lib/auth/roleConfig';

import { BentoCard, GlowCard, SportSignalCard } from '@/components/ui/glass-card';
import { AnimatedStatCard } from '@/components/ui/animated-stat-card';
import { SectionReveal } from '@/components/ui/section-reveal';

function HomeContent() {
  const router = useRouter();
  const { currentUser, role, setDemoRole, logout, userProfile } = useAuth();
  const { athletes, challenges, feedPosts, leagues, matches, reports, teams, verifications, source } =
    useGoalPlaceData();
  const [supportAthlete, setSupportAthlete] = useState<Athlete | null>(null);
  const [pledgeAthlete, setPledgeAthlete] = useState<Athlete | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const activeChallenges = useMemo(() => challenges.filter((c) => c.status === 'Active').slice(0, 3), [challenges]);
  const featuredAthletes = useMemo(() => [...athletes].sort((a, b) => b.supportersCount - a.supportersCount).slice(0, 4), [athletes]);
  const followedAthletes = useMemo(
    () => athletes.filter((athlete) => userProfile?.followedAthletes?.includes(athlete.id)).slice(0, 3),
    [athletes, userProfile?.followedAthletes]
  );
  const recommendedAthletes = useMemo(
    () => featuredAthletes.filter((athlete) => !userProfile?.followedAthletes?.includes(athlete.id)).slice(0, 3),
    [featuredAthletes, userProfile?.followedAthletes]
  );
  const todayMatches = useMemo(() => matches.filter((m) => m.status === 'Live' || m.status === 'Upcoming').slice(0, 4), [matches]);
  const personalizedFeed = feedPosts.slice(0, 4);

  // Dashboard counters, derived the same way the dedicated workspaces derive them so the
  // hub and the workspace never disagree. `/athlete-dashboard` also treats athletes[0] as
  // the signed-in athlete in demo mode.
  const currentAthlete = athletes[0];
  const upcomingMatches = useMemo(
    () => matches.filter((m) => m.status === 'Upcoming' || m.status === 'Live'),
    [matches]
  );
  const pendingVerifications = useMemo(
    () => verifications.filter((item) => String(item.status).toLowerCase() === 'pending'),
    [verifications]
  );
  const openDisputes = useMemo(
    () =>
      matches.filter((m) => String(m.verificationStatus).toLowerCase() === 'disputed').length +
      verifications.filter((item) => String(item.status).toLowerCase() === 'disputed').length,
    [matches, verifications]
  );
  const pendingMatchApprovals = useMemo(
    () => matches.filter((m) => String(m.verificationStatus).toLowerCase().includes('pending')),
    [matches]
  );
  const pendingLeagues = useMemo(() => leagues.filter((league) => league.status !== 'partner'), [leagues]);
  const openReports = useMemo(
    () => reports.filter((report) => report.status === 'open' || report.status === 'reviewing'),
    [reports]
  );
  const verifiedAthletes = useMemo(() => athletes.filter((athlete) => athlete.verified), [athletes]);

  const configRole = role === 'super_admin' ? 'platform_admin' : role === 'sponsor' ? 'fan' : (role || 'fan');
  const config = ROLE_CONFIGS[configRole] || ROLE_CONFIGS['fan'];

  const handleLogout = async () => {
    setDemoRole(null);
    await logout();
    toast.success('Logged out');
    router.push('/');
  };

  return (
    <PageContainer compact className="space-y-12">
      {/* Universal Header */}
      <SectionReveal>
        <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:items-stretch">
          <BentoCard className="bg-[url('/placeholders/stadium-glow.svg')] bg-cover bg-center bg-blend-overlay bg-[#05070A]/90 border-[var(--goal-emerald)]/20 p-8 md:p-10 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-[#05070A] via-[#05070A]/80 to-transparent" />
            <div className="relative z-10">
              <div className="mb-6 flex flex-wrap items-center gap-2">
                {sports.map((sport) => (
                  <SportBadge key={sport.slug} sport={sport.name} />
                ))}
              </div>
              <h1 className="font-display text-4xl font-black text-white md:text-6xl tracking-tight">
                Welcome back,<br />
                <span className="text-[var(--goal-mint)]">{userProfile?.name?.split(' ')[0] ?? currentUser?.email?.split('@')[0] ?? 'member'}</span>
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300">
                {config.dashboardSubtitle}
              </p>
              <div className="mt-8">
                <RoleQuickActions />
              </div>
            </div>
          </BentoCard>

          <GlowCard color="var(--goal-gold)">
            <div className="flex flex-col h-full justify-between p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--goal-gold)]">Account Profile</p>
                  <h2 className="mt-2 font-display text-2xl font-black text-white">{userProfile?.name ?? 'GoalPlace256 User'}</h2>
                  <p className="mt-1 text-sm font-medium text-slate-400">{config.label}</p>
                </div>
              </div>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {config.role === 'fan' || config.role === 'athlete' ? (
                  <Button variant="gold" onClick={() => router.push('/wallet')}>
                    <Wallet01Icon className="size-4" />
                    Wallet
                  </Button>
                ) : null}
                <Button variant="outline" onClick={() => router.push('/profile')}>
                  <UserIcon className="size-4" />
                  Profile
                </Button>
                <Button variant="outline" onClick={() => router.push('/settings')}>
                  <Notification01Icon className="size-4" />
                  Settings
                </Button>
                <Button variant="destructive" onClick={handleLogout} className={config.role !== 'fan' && config.role !== 'athlete' ? "sm:col-span-2" : ""}>
                  <Logout01Icon className="size-4" />
                  Logout
                </Button>
              </div>
            </div>
          </GlowCard>
        </section>
      </SectionReveal>

      {/* Role-Specific Content */}
      {configRole === 'fan' && (
        <div className="space-y-12">
          <SectionReveal>
            <section className="grid gap-4 md:grid-cols-4">
              <AnimatedStatCard title="Wallet Balance" value={userProfile?.walletBalance ?? 0} prefix="UGX" icon={Wallet01Icon} />
              <AnimatedStatCard title="GoalPlace Points" value={userProfile?.points ?? 0} icon={Medal} className="border-[var(--goal-gold)]/20" />
              <AnimatedStatCard title="Awards Progress" value="Eligible" icon={Trophy} className="border-blue-500/20" />
              <AnimatedStatCard title="Active Challenges" value={activeChallenges.length} icon={ZapIcon} className="border-orange-500/20" />
            </section>
          </SectionReveal>

          <SectionReveal delay={0.1}>
            <section>
              <SectionHeader eyebrow="Today" title="Live Action" description="Live fixtures and verified challenges." />
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <div className="grid gap-4 md:grid-cols-2">
                  {todayMatches.slice(0, 2).map((match) => (
                    <MatchCard key={`today-${match.id}`} match={match} onView={() => router.push(`/matches/${match.id}`)} />
                  ))}
                </div>
                <div className="space-y-4">
                  {activeChallenges.slice(0, 2).map((challenge) => {
                    const athlete = athletes.find((item) => item.id === challenge.athleteId) ?? featuredAthletes[0];
                    return (
                      <SportSignalCard key={`today-${challenge.id}`} sport={challenge.sport} className="p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="max-w-[200px]">
                            <SportBadge sport={challenge.sport} />
                            <h3 className="mt-3 font-display text-lg font-black text-white">{challenge.targetDescription ?? challenge.description}</h3>
                            <p className="mt-1 text-sm text-slate-400">{athlete?.name ?? 'Verified athlete'} • {formatUGX(challenge.totalPledged)}</p>
                          </div>
                          <Button size="sm" variant="gold" onClick={() => setPledgeAthlete(athlete)}>Pledge</Button>
                        </div>
                      </SportSignalCard>
                    );
                  })}
                </div>
              </div>
            </section>
          </SectionReveal>

          <SectionReveal delay={0.2}>
            <section className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
              <div>
                <SectionHeader eyebrow="Your athletes" title="Followed & Recommended" />
                <div className="grid gap-4 md:grid-cols-2">
                  {(followedAthletes.length ? followedAthletes : featuredAthletes.slice(0, 2)).map((athlete) => (
                    <BentoCard key={athlete.id} className="gap-6 p-5">
                      <div>
                        <SportBadge sport={athlete.sport} />
                        <h3 className="mt-3 font-display text-2xl font-black text-white">{athlete.name}</h3>
                        <p className="mt-1 text-sm text-slate-400">{athlete.position} • {athlete.city}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div className="rounded-xl bg-white/5 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Supporters</p>
                          <p className="mt-1 font-bold text-white text-lg">{athlete.supportersCount}</p>
                        </div>
                        <div className="rounded-xl bg-white/5 p-3">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Support</p>
                          <p className="mt-1 font-bold text-[var(--goal-mint)] text-lg">{formatUGX(athlete.totalEarnings ?? athlete.totalSupport)}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-auto">
                        <Button className="flex-1" size="sm" onClick={() => setSupportAthlete(athlete)}>Support</Button>
                        <Button className="flex-1" size="sm" variant="outline" onClick={() => router.push(`/athletes/${athlete.id}`)}>Profile</Button>
                      </div>
                    </BentoCard>
                  ))}
                  {recommendedAthletes.slice(0, 1).map((athlete) => (
                    <GlowCard key={`recommended-${athlete.id}`} color="var(--goal-gold)">
                      <div className="p-5 flex flex-col h-full gap-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[var(--goal-gold)]">Recommended</p>
                        <h3 className="font-display text-2xl font-black text-white">{athlete.name}</h3>
                        <p className="text-sm text-slate-300 leading-relaxed">{athlete.position} from {athlete.city}, trending in verified challenges.</p>
                        <Button className="mt-auto w-full" size="sm" variant="gold" onClick={() => setPledgeAthlete(athlete)}>Pledge Support</Button>
                      </div>
                    </GlowCard>
                  ))}
                </div>
              </div>
              <div>
                <SectionHeader eyebrow="Account" title="History & Signals" />
                <div className="space-y-4">
                  {[
                    { title: 'Direct support recorded', detail: `${formatUGX(25000)} for ${featuredAthletes[0]?.name ?? 'a verified athlete'}`, tone: 'gold' },
                    { title: 'Challenge followed', detail: activeChallenges[0]?.targetDescription ?? activeChallenges[0]?.description ?? 'Performance challenge update', tone: 'emerald' },
                    { title: 'Awards progress updated', detail: 'You are eligible for community supporter recognition.', tone: 'blue' },
                  ].map((item) => (
                    <div key={item.title} className="glass-panel rounded-xl p-4 flex items-start gap-4">
                      <div className={`size-10 rounded-lg flex items-center justify-center shrink-0 ${item.tone === 'gold' ? 'bg-[var(--goal-gold)]/10 text-[var(--goal-gold)]' : item.tone === 'blue' ? 'bg-blue-500/10 text-blue-400' : 'bg-[var(--goal-emerald)]/10 text-[var(--goal-mint)]'}`}>
                        <Notification01Icon className="size-5" />
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm">{item.title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-slate-400">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </SectionReveal>

          <SectionReveal delay={0.3}>
            <section className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
              <div>
                <SectionHeader eyebrow="Your Feed" title="Network Activity" description="Verified activity from your orbit." />
                <div className="rounded-xl border border-[var(--goal-emerald)]/20 bg-gradient-to-b from-[var(--goal-emerald)]/10 to-transparent p-6 mt-6">
                  <SecurityCheckIcon className="mb-4 size-8 text-[var(--goal-mint)]" />
                  <h3 className="font-display text-xl font-black text-white">Verified by design</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">League standings are based only on match results. Paid plans never affect sporting rankings.</p>
                </div>
              </div>
              <div className="space-y-4">
                {personalizedFeed.map((post) => {
                  const postAthlete = athletes.find((a) => a.id === post.authorId) ?? featuredAthletes[0];
                  return (
                    <FeedCard key={post.id} post={post} onSupport={() => setSupportAthlete(postAthlete)} onComment={() => setCommentsOpen(true)} onViewProfile={() => router.push(`/feed`)} onViewMatch={() => router.push('/matches/match_001')} />
                  );
                })}
              </div>
            </section>
          </SectionReveal>
        </div>
      )}

      {configRole === 'athlete' && (
        <div className="space-y-12">
          <SectionReveal>
            <section className="grid gap-4 md:grid-cols-4">
              <AnimatedStatCard
                title="Total Support"
                value={currentAthlete?.totalEarnings ?? currentAthlete?.totalSupport ?? 0}
                prefix="UGX"
                icon={Wallet01Icon}
              />
              <AnimatedStatCard title="Supporters" value={currentAthlete?.supportersCount ?? 0} icon={UserIcon} className="border-[var(--goal-gold)]/20" />
              <AnimatedStatCard title="Verification" value={currentAthlete?.verified ? 'Verified' : 'Pending'} icon={SecurityCheckIcon} className="border-blue-500/20" />
              <AnimatedStatCard title="Active Challenges" value={activeChallenges.length} icon={ZapIcon} className="border-orange-500/20" />
            </section>
          </SectionReveal>
          
          <SectionReveal>
            <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <SectionHeader eyebrow="Athlete Feed" title="Your Athlete Updates" description="Recent interactions from supporters, challenge updates, and match results." />
                <div className="space-y-4">
                  {personalizedFeed.slice(0, 2).map((post) => (
                    <FeedCard key={post.id} post={post} onSupport={() => {}} onComment={() => setCommentsOpen(true)} onViewProfile={() => {}} onViewMatch={() => router.push('/matches/match_001')} />
                  ))}
                </div>
              </div>
              <div>
                <SectionHeader eyebrow="Matches" title="Upcoming Matches" description="Your team's next fixtures." />
                <div className="grid gap-4">
                  {todayMatches.slice(0, 2).map((match) => (
                    <MatchCard key={match.id} match={match} onView={() => router.push(`/matches/${match.id}`)} />
                  ))}
                </div>
              </div>
            </section>
          </SectionReveal>
        </div>
      )}

      {configRole === 'league_admin' && (
        <div className="space-y-12">
          <SectionReveal>
            <section className="grid gap-4 md:grid-cols-4">
              <AnimatedStatCard title="Pending Verifications" value={pendingVerifications.length} icon={SecurityCheckIcon} className="border-orange-500/20" />
              <AnimatedStatCard title="Upcoming Matches" value={upcomingMatches.length} icon={Medal} className="border-blue-500/20" />
              <AnimatedStatCard title="Open Disputes" value={openDisputes} icon={ZapIcon} className="border-[var(--goal-gold)]/20" />
              <AnimatedStatCard title="Data Source" value={source === 'firebase' ? 'Firebase' : 'Mock'} icon={Notification01Icon} className="border-[var(--goal-emerald)]/20" />
            </section>
          </SectionReveal>

          <SectionReveal>
            <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
              <div>
                <SectionHeader eyebrow="Recent Fixtures" title="Verification Queue" description="Verify recent results or address disputes." />
                <div className="space-y-4">
                  {todayMatches.map((match) => {
                    const homeTeam = teams.find(t => t.id === match.homeTeamId);
                    const awayTeam = teams.find(t => t.id === match.awayTeamId);
                    return (
                      <GlowCard key={match.id} color="rgba(255,255,255,0.1)">
                        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div>
                            <p className="font-display text-xl font-black text-white">
                              {homeTeam?.name ?? match.homeTeamId} <span className="text-slate-500 font-medium text-base">vs</span> {awayTeam?.name ?? match.awayTeamId}
                            </p>
                            <div className="flex gap-2 items-center mt-2 text-sm font-bold text-slate-400">
                              <span className="capitalize text-[var(--goal-mint)]">{match.status}</span>
                              <span className="h-1 w-1 rounded-full bg-slate-600" />
                              <span className="capitalize">{match.verificationStatus}</span>
                            </div>
                          </div>
                          <Button variant="default" size="sm" onClick={() => router.push('/league-admin')}>Review Match</Button>
                        </div>
                      </GlowCard>
                    );
                  })}
                </div>
              </div>
              <div>
                <SectionHeader eyebrow="League Feed" title="League Activity" description="Important updates from your teams." />
                <div className="space-y-4">
                  {personalizedFeed.slice(0, 2).map((post) => {
                    const postAthlete = athletes.find((a) => a.id === post.authorId) ?? featuredAthletes[0];
                    return (
                      <FeedCard key={post.id} post={post} onSupport={() => setSupportAthlete(postAthlete)} onComment={() => setCommentsOpen(true)} onViewProfile={() => router.push(`/feed`)} onViewMatch={() => {}} />
                    );
                  })}
                </div>
              </div>
            </section>
          </SectionReveal>
        </div>
      )}

      {configRole === 'platform_admin' && (
        <div className="space-y-12">
          <SectionReveal>
            <section className="grid gap-4 md:grid-cols-4">
              <AnimatedStatCard title="Pending Approvals" value={pendingMatchApprovals.length + pendingLeagues.length} icon={SecurityCheckIcon} className="border-orange-500/20" />
              <AnimatedStatCard title="Open Reports" value={openReports.length} icon={Notification01Icon} className="border-[var(--goal-gold)]/20" />
              <AnimatedStatCard title="Leagues" value={leagues.length} icon={ZapIcon} className="border-blue-500/20" />
              <AnimatedStatCard title="Verified Athletes" value={verifiedAthletes.length} icon={UserIcon} className="border-[var(--goal-emerald)]/20" />
            </section>
          </SectionReveal>

          <SectionReveal>
            <section className="grid gap-8 lg:grid-cols-2">
              <BentoCard className="gap-6 p-6">
                <SectionHeader eyebrow="Reports" title="Moderation Queue" description="Reported content awaiting review." className="mb-0" />
                <div className="space-y-3">
                  {[
                    { id: 'rep_1', type: 'Harassment', user: 'user_088', action: 'Review Post' },
                    { id: 'rep_2', type: 'Spam', user: 'user_012', action: 'Review Comment' },
                    { id: 'rep_3', type: 'False verification', user: 'league_002', action: 'Review Match' },
                  ].map((rep) => (
                    <div key={rep.id} className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-white">Reported: {rep.type}</p>
                        <p className="mt-1 text-sm text-slate-400">Target: {rep.user}</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => router.push('/admin')}>{rep.action}</Button>
                    </div>
                  ))}
                </div>
              </BentoCard>
              <BentoCard className="gap-6 p-6">
                <SectionHeader eyebrow="Payouts" title="Review Queue" description="Demo payout reviews only." className="mb-0" />
                <div className="space-y-3">
                  {[
                    { id: 'pay_1', amount: '1.2M UGX', reason: 'Challenge Complete', status: 'Pending Approval' },
                    { id: 'pay_2', amount: '450K UGX', reason: 'Monthly Supporter Top-up', status: 'Pending Review' },
                  ].map((pay) => (
                    <div key={pay.id} className="rounded-xl border border-[var(--goal-gold)]/20 bg-[var(--goal-gold)]/5 p-4 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-[var(--goal-gold)]">{pay.amount}</p>
                        <p className="mt-1 text-sm text-slate-300">{pay.reason}</p>
                      </div>
                      <Button variant="gold" size="sm" onClick={() => router.push('/admin?tab=Support%2FPayout%20Review')}>Review</Button>
                    </div>
                  ))}
                </div>
              </BentoCard>
            </section>
          </SectionReveal>
        </div>
      )}

      {/* Modals */}
      <SupportModal athlete={supportAthlete} open={Boolean(supportAthlete)} onOpenChange={(open) => !open && setSupportAthlete(null)} />
      <PledgeModal athlete={pledgeAthlete} open={Boolean(pledgeAthlete)} onOpenChange={(open) => !open && setPledgeAthlete(null)} />
      <CommentsDrawer open={commentsOpen} onOpenChange={setCommentsOpen} />
    </PageContainer>
  );
}

export default function HomePage() {
  return (
    <ProtectedRoute>
      <HomeContent />
    </ProtectedRoute>
  );
}
