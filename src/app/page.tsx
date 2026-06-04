'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MatchCard } from '@/components/ui/match-card';
import { AthleteCard } from '@/components/ui/athlete-card';
import { ChallengeCard } from '@/components/ui/challenge-card';
import { FeedCard } from '@/components/ui/feed-card';
import { mockMatches, mockAthletes, mockChallenges, mockFeed } from '@/lib/mockData';
import { PlayCircle, ShieldCheck, Trophy, Target } from 'lucide-react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  
  const liveMatches = mockMatches.filter(m => m.status === 'Live');
  const featuredAthletes = mockAthletes.slice(0, 4);
  const activeChallenges = mockChallenges.filter(c => c.status === 'Active').slice(0, 3);
  const feedPreview = mockFeed.slice(0, 2);

  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <section className="relative w-full min-h-[85vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1518605368461-1e1e11415053?auto=format&fit=crop&q=80&w=2000&h=1000" 
            alt="Hero Background" 
            className="w-full h-full object-cover opacity-30"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background" />
        </div>
        
        <div className="relative z-10 container mx-auto px-6 flex flex-col items-center text-center mt-20">
          <Badge className="mb-6 bg-primary/20 text-primary hover:bg-primary/30 border-primary/50 text-sm px-4 py-1.5">
            The Future of African Sport
          </Badge>
          <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-6 max-w-4xl glow-text leading-tight">
            Back the athletes. <br className="hidden md:block"/>Build the game.
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
            FanPlay Africa helps grassroots athletes earn from fan support, verified performance rewards, sponsorships, and league visibility across football, basketball, and rugby.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <Button size="lg" className="h-14 px-8 text-lg bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => router.push('/athletes')}>
              Join as Fan
            </Button>
            <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-white/20 bg-white/5 backdrop-blur-sm" onClick={() => router.push('/register')}>
              Register Athlete
            </Button>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-6 py-12 space-y-24">
        {/* Live Matches */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" /> Live & Upcoming
            </h2>
            <Link href="/matches" className="text-primary text-sm font-semibold hover:underline">View All</Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveMatches.concat(mockMatches.filter(m => m.status === 'Upcoming')).slice(0,3).map(match => (
              <MatchCard key={match.id} match={match} onView={() => router.push(`/matches/${match.id}`)} />
            ))}
          </div>
        </section>

        {/* Featured Athletes */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="text-primary w-6 h-6" /> Top Supported Athletes
            </h2>
            <Link href="/athletes" className="text-primary text-sm font-semibold hover:underline">Explore</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredAthletes.map(athlete => (
              <AthleteCard key={athlete.id} athlete={athlete} onView={() => router.push(`/athletes/${athlete.id}`)} />
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="bg-white/5 rounded-3xl p-8 md:p-12 border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10" />
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold mb-4">How Fan Support Works</h2>
            <p className="text-muted-foreground">We ensure every shilling pledged goes directly to the athlete only after they prove their performance on the field.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                <Target className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg">1. Pledge Support</h3>
              <p className="text-sm text-muted-foreground">Fans pledge UGX on specific challenges (e.g. "Score a goal").</p>
            </div>
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                <PlayCircle className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg">2. Athlete Performs</h3>
              <p className="text-sm text-muted-foreground">The athlete plays the match and attempts to complete the challenge.</p>
            </div>
            <div className="flex flex-col items-center text-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <h3 className="font-bold text-lg">3. Verified Payout</h3>
              <p className="text-sm text-muted-foreground">League admins verify the result. If successful, funds are released to the athlete's wallet.</p>
            </div>
          </div>
        </section>

        {/* Active Challenges */}
        <section>
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold">Verified Performance Challenges</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {activeChallenges.map(challenge => (
              <ChallengeCard key={challenge.id} challenge={challenge} />
            ))}
          </div>
        </section>

        {/* Community Feed Preview */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <h2 className="text-3xl font-bold mb-6">The Pulse of Grassroots</h2>
            <p className="text-muted-foreground mb-8 text-lg">
              Follow the moments, milestones, and athletes shaping the future of African sport. Real stories from real pitches.
            </p>
            <Button size="lg" variant="outline" onClick={() => router.push('/feed')}>
              View Community Feed
            </Button>
          </div>
          <div className="space-y-4">
            {feedPreview.map(post => (
              <FeedCard key={post.id} post={post} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

import { Badge } from '@/components/ui/badge';
