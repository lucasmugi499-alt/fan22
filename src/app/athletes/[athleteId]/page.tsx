'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { mockAthletes, mockTeams, mockLeagues, mockChallenges, mockFeed } from '@/lib/mockData';
import { VerificationBadge } from '@/components/ui/verification-badge';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { ChallengeCard } from '@/components/ui/challenge-card';
import { FeedCard } from '@/components/ui/feed-card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, MapPin, Trophy, Users, Star, Car, Coffee, HeartPulse } from 'lucide-react';
import Link from 'next/link';

export default function AthleteProfilePage() {
  const { athleteId } = useParams();
  const athlete = mockAthletes.find(a => a.id === athleteId);

  if (!athlete) return <div className="p-8 text-center">Athlete not found</div>;

  const team = mockTeams.find(t => t.id === athlete.teamId);
  const league = mockLeagues.find(l => l.id === athlete.leagueId);
  const athleteChallenges = mockChallenges.filter(c => c.athleteId === athlete.id);
  const athleteFeed = mockFeed.filter(f => f.authorId === athlete.id || f.caption.includes(athlete.name.split(' ')[0]));

  return (
    <div className="pb-24">
      {/* Hero */}
      <div className="relative h-64 md:h-80 w-full overflow-hidden">
        <img src={athlete.coverUrl} alt="Cover" className="w-full h-full object-cover opacity-50" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
        <Link href="/athletes" className="absolute top-6 left-6 inline-flex items-center text-sm font-semibold bg-black/50 px-3 py-1.5 rounded-full hover:bg-black/80 transition-colors backdrop-blur-md">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back
        </Link>
      </div>

      <div className="container max-w-4xl mx-auto px-4 -mt-24 relative z-10">
        <div className="flex flex-col md:flex-row gap-6 md:items-end mb-8">
          <img src={athlete.avatarUrl} alt={athlete.name} className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-background object-cover bg-muted" />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl md:text-4xl font-black">{athlete.name}</h1>
              {athlete.verified && <VerificationBadge />}
            </div>
            <p className="text-lg text-muted-foreground mb-2">{athlete.position} • {team?.name}</p>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4"/> {athlete.city}, {athlete.country}</span>
              <span className="flex items-center gap-1 text-primary glow-text"><Trophy className="w-4 h-4"/> {league?.name}</span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <Button size="lg" className="bg-primary text-primary-foreground shadow-[0_0_15px_rgba(16,185,129,0.3)]">
              Support Athlete
            </Button>
            <Button size="lg" variant="outline" className="bg-white/5">
              Join Fan Club
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <GlassCard className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Supporters</p>
            <p className="text-xl font-bold flex items-center justify-center gap-1"><Users className="w-4 h-4 text-primary"/> {athlete.supportersCount}</p>
          </GlassCard>
          <GlassCard className="p-4 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Earnings</p>
            <p className="text-xl font-bold text-primary">{athlete.totalEarnings.toLocaleString()} <span className="text-xs">UGX</span></p>
          </GlassCard>
          {Object.entries(athlete.stats).slice(0, 2).map(([key, val]) => (
            <GlassCard key={key} className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{key}</p>
              <p className="text-xl font-bold">{val}</p>
            </GlassCard>
          ))}
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full bg-white/5 border border-white/10 p-1 rounded-full mb-8 flex overflow-x-auto hide-scrollbar">
            {['overview', 'stats', 'challenges', 'feed'].map(t => (
              <TabsTrigger key={t} value={t} className="rounded-full flex-1 min-w-[100px] capitalize data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                {t}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="space-y-8">
            <section>
              <h3 className="text-xl font-bold mb-4">About</h3>
              <p className="text-muted-foreground leading-relaxed">{athlete.bio}</p>
            </section>
            
            <section>
              <h3 className="text-xl font-bold mb-4">Earnings Impact</h3>
              <p className="text-muted-foreground mb-6">See how fan support is helping {athlete.name.split(' ')[0]} succeed off the pitch.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                  <div className="bg-primary/20 p-2 rounded-lg text-primary"><Car className="w-5 h-5"/></div>
                  <div><h4 className="font-bold text-sm">Transport</h4><p className="text-xs text-muted-foreground">To training & matches</p></div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                  <div className="bg-secondary/20 p-2 rounded-lg text-secondary"><Coffee className="w-5 h-5"/></div>
                  <div><h4 className="font-bold text-sm">Meals</h4><p className="text-xs text-muted-foreground">Pre-match nutrition</p></div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                  <div className="bg-blue-500/20 p-2 rounded-lg text-blue-400"><HeartPulse className="w-5 h-5"/></div>
                  <div><h4 className="font-bold text-sm">Medical</h4><p className="text-xs text-muted-foreground">Physio & recovery</p></div>
                </div>
              </div>
            </section>
          </TabsContent>

          <TabsContent value="challenges" className="space-y-4">
            <h3 className="text-xl font-bold mb-4">Performance Challenges</h3>
            {athleteChallenges.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {athleteChallenges.map(c => <ChallengeCard key={c.id} challenge={c} />)}
              </div>
            ) : (
              <GlassCard className="p-8 text-center text-muted-foreground">No active challenges right now.</GlassCard>
            )}
          </TabsContent>

          <TabsContent value="feed" className="space-y-4">
            {athleteFeed.length > 0 ? (
              athleteFeed.map(f => <FeedCard key={f.id} post={f} />)
            ) : (
              <GlassCard className="p-8 text-center text-muted-foreground">No feed posts yet.</GlassCard>
            )}
          </TabsContent>
          
          <TabsContent value="stats">
             <GlassCard className="p-6">
                <h3 className="text-xl font-bold mb-4">Full Season Stats</h3>
                <div className="space-y-3">
                  {Object.entries(athlete.stats).map(([key, val]) => (
                    <div key={key} className="flex justify-between items-center py-2 border-b border-white/5 last:border-0">
                      <span className="text-muted-foreground">{key}</span>
                      <span className="font-bold text-lg">{val}</span>
                    </div>
                  ))}
                </div>
             </GlassCard>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}
