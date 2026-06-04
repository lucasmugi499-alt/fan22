'use client';

import React from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { MatchCard } from '@/components/ui/match-card';
import { AthleteCard } from '@/components/ui/athlete-card';
import { ChallengeCard } from '@/components/ui/challenge-card';
import { FeedCard } from '@/components/ui/feed-card';
import { mockMatches, mockAthletes, mockChallenges, mockFeed } from '@/lib/mockData';
import { PlayCircle, ShieldCheck, Trophy, Target, ArrowRight, Shield, Globe, Award, Medal, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';

export default function Home() {
  const router = useRouter();
  
  const liveMatches = mockMatches.filter(m => m.status === 'Live');
  const featuredAthletes = mockAthletes.slice(0, 4);
  const activeChallenges = mockChallenges.filter(c => c.status === 'Active').slice(0, 3);
  const feedPreview = mockFeed.slice(0, 2);

  return (
    <div className="flex flex-col w-full">
      {/* 1. Cinematic Hero Section */}
      <section className="relative w-full min-h-[90vh] flex flex-col items-center justify-center overflow-hidden pt-20 pb-32">
        <div className="absolute inset-0 z-0 bg-black">
          {/* Dark stadium background with emerald/gold radial glow */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/40 via-background to-black" />
          <div className="absolute top-0 right-0 w-3/4 h-3/4 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent opacity-50 blur-[100px]" />
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1518605368461-1e1e11415053?auto=format&fit=crop&q=80')] opacity-10 mix-blend-overlay bg-cover bg-center" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
        </div>
        
        <div className="relative z-10 container mx-auto px-6 flex flex-col lg:flex-row items-center gap-16">
          <div className="flex-1 flex flex-col items-start text-left max-w-3xl">
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="flex gap-3 mb-6"
            >
              {['Football', 'Basketball', 'Rugby'].map((sport) => (
                <span key={sport} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-semibold text-emerald-400 backdrop-blur-md">
                  {sport}
                </span>
              ))}
            </motion.div>
            
            <motion.h1 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
              className="text-5xl md:text-7xl lg:text-8xl font-black tracking-tight mb-6 leading-[1.1] text-white drop-shadow-2xl"
            >
              Back the <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-200">athletes.</span><br />
              Build the <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-500">game.</span>
            </motion.h1>
            
            <motion.p 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }}
              className="text-lg md:text-xl text-muted-foreground max-w-xl mb-10 leading-relaxed font-medium"
            >
              GoalPlace256 is Uganda's home for grassroots sports. Support verified athletes, celebrate their achievements, and build the future of our local leagues.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto"
            >
              <Button size="lg" className="h-14 px-8 text-lg bg-gradient-to-r from-emerald-500 to-emerald-700 text-white hover:from-emerald-400 hover:to-emerald-600 shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_40px_rgba(16,185,129,0.5)] transition-all font-bold" onClick={() => router.push('/register')}>
                Join as Fan
              </Button>
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg border-white/10 bg-white/5 backdrop-blur-md hover:bg-white/10 font-bold" onClick={() => router.push('/register-athlete')}>
                Register Athlete
              </Button>
              <Button size="lg" variant="ghost" className="h-14 px-8 text-lg hover:bg-white/5 font-semibold text-muted-foreground hover:text-white" onClick={() => router.push('/register-league')}>
                Register League
              </Button>
            </motion.div>
          </div>
          
          {/* Floating Cards */}
          <div className="flex-1 w-full h-[500px] relative hidden lg:block">
            <motion.div 
              animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 5, ease: "easeInOut" }}
              className="absolute top-0 right-10 w-72 rotate-6 z-10"
            >
              <div className="bg-black/40 backdrop-blur-xl border border-emerald-500/30 p-4 rounded-2xl shadow-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                  <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Live Match</span>
                </div>
                <div className="flex justify-between items-center text-xl font-black">
                  <span>KSY</span>
                  <span className="text-emerald-400 bg-emerald-950/50 px-3 py-1 rounded-lg">2 - 1</span>
                  <span>MKD</span>
                </div>
              </div>
            </motion.div>
            
            <motion.div 
              animate={{ y: [0, 15, 0] }} transition={{ repeat: Infinity, duration: 6, ease: "easeInOut", delay: 1 }}
              className="absolute top-32 left-0 w-64 -rotate-3 z-20"
            >
               <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-4 rounded-2xl shadow-2xl">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-900 overflow-hidden"><img src={mockAthletes[0].avatarUrl} className="w-full h-full object-cover" alt="Athlete"/></div>
                  <div>
                    <h4 className="font-bold text-sm">Brian Okello</h4>
                    <p className="text-xs text-muted-foreground">Forward • Kampala</p>
                  </div>
                </div>
                <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-lg p-2 flex justify-between items-center">
                  <span className="text-xs text-emerald-500">Verified Support</span>
                  <span className="font-bold text-sm">1.5M UGX</span>
                </div>
              </div>
            </motion.div>
            
            <motion.div 
              animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 2 }}
              className="absolute bottom-10 right-20 w-56 rotate-3 z-30"
            >
               <div className="bg-gradient-to-br from-amber-500/20 to-amber-900/40 backdrop-blur-xl border border-amber-500/30 p-5 rounded-2xl shadow-[0_0_30px_rgba(245,158,11,0.2)]">
                <p className="text-xs font-bold uppercase tracking-wider text-amber-200/70 mb-1">GoalPlace Points</p>
                <h3 className="text-3xl font-black text-amber-400">8,450</h3>
                <p className="text-xs text-amber-200/50 mt-1">Ready for Awards</p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <div className="container mx-auto px-6 py-12 space-y-32">
        {/* 2. Live Matches */}
        <section>
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-3xl font-bold flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-destructive animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.6)]" /> Live & Upcoming
            </h2>
            <Button variant="ghost" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30" onClick={() => router.push('/matches')}>
              View Schedule <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveMatches.concat(mockMatches.filter(m => m.status === 'Upcoming')).slice(0,3).map(match => (
              <MatchCard key={match.id} match={match} onView={() => router.push(`/matches/${match.id}`)} />
            ))}
          </div>
        </section>

        {/* 3. Explore Sports */}
        <section>
          <h2 className="text-3xl font-bold mb-10 text-center">Explore Sports</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {['Football', 'Basketball', 'Rugby'].map((sport) => (
              <div key={sport} className="relative h-48 rounded-2xl overflow-hidden group cursor-pointer border border-white/5 hover:border-emerald-500/30 transition-all">
                <div className="absolute inset-0 bg-black">
                  <div className={`absolute inset-0 bg-gradient-to-t ${sport === 'Football' ? 'from-emerald-900/80' : sport === 'Basketball' ? 'from-amber-900/80' : 'from-blue-900/80'} to-transparent opacity-80 group-hover:opacity-100 transition-opacity z-10`} />
                  <img src={sport === 'Football' ? 'https://images.unsplash.com/photo-1518605368461-1e1e11415053?auto=format&fit=crop&q=80' : sport === 'Basketball' ? 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&q=80' : 'https://images.unsplash.com/photo-1555592837-1959b3986a77?auto=format&fit=crop&q=80'} alt={sport} className="w-full h-full object-cover opacity-50 group-hover:scale-110 transition-transform duration-700" />
                </div>
                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center">
                  <h3 className="text-2xl font-black mb-2">{sport}</h3>
                  <span className="text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity transform translate-y-2 group-hover:translate-y-0 duration-300">Explore Athletes <ArrowRight className="w-4 h-4 inline" /></span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. Top Supported Athletes */}
        <section>
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-3xl font-bold flex items-center gap-3">
              <Trophy className="text-amber-400 w-8 h-8 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]" /> Top Supported Athletes
            </h2>
            <Button variant="ghost" className="text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30" onClick={() => router.push('/athletes')}>
              See Leaderboard <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredAthletes.map(athlete => (
              <AthleteCard key={athlete.id} athlete={athlete} onView={() => router.push(`/athletes/${athlete.id}`)} />
            ))}
          </div>
        </section>

        {/* 5. Verified Performance Challenges */}
        <section className="bg-emerald-950/20 border border-emerald-900/30 rounded-3xl p-8 lg:p-12 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] -z-10" />
          <div className="flex flex-col lg:flex-row items-center justify-between mb-10 gap-6">
             <div>
               <h2 className="text-3xl font-bold mb-3 flex items-center gap-3">
                 <ShieldCheck className="text-emerald-400 w-8 h-8" /> Verified Performance Challenges
               </h2>
               <p className="text-muted-foreground text-lg max-w-2xl">Support your favorite athletes by backing specific on-field targets. Funds are only paid out when league officials verify the result.</p>
             </div>
             <Button className="shrink-0 bg-white text-black hover:bg-gray-200 font-bold">View All Challenges</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {activeChallenges.map(challenge => (
              <ChallengeCard key={challenge.id} challenge={challenge} />
            ))}
          </div>
        </section>

        {/* 6. How Support Works */}
        <section>
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-4xl font-black mb-6">Support That Builds the Game</h2>
            <p className="text-xl text-muted-foreground">GoalPlace256 is built on trust and direct impact. We ensure every shilling pledged goes directly to the athlete only after they prove their performance on the field.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto relative">
            <div className="hidden md:block absolute top-1/2 left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-emerald-900 via-emerald-500/50 to-emerald-900 -z-10 -translate-y-1/2" />
            
            <div className="flex flex-col items-center text-center gap-6 relative group">
              <div className="w-20 h-20 rounded-2xl bg-black border border-white/10 text-emerald-400 flex items-center justify-center shadow-xl group-hover:border-emerald-500/50 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all">
                <Target className="w-10 h-10" />
              </div>
              <div>
                <h3 className="font-bold text-xl mb-2">1. Pledge Support</h3>
                <p className="text-muted-foreground leading-relaxed">Fans pledge support for specific verifiable athletic challenges.</p>
              </div>
            </div>
            <div className="flex flex-col items-center text-center gap-6 relative group">
              <div className="w-20 h-20 rounded-2xl bg-black border border-white/10 text-emerald-400 flex items-center justify-center shadow-xl group-hover:border-emerald-500/50 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all">
                <PlayCircle className="w-10 h-10" />
              </div>
              <div>
                <h3 className="font-bold text-xl mb-2">2. Athlete Performs</h3>
                <p className="text-muted-foreground leading-relaxed">The athlete plays the match and attempts to complete the challenge.</p>
              </div>
            </div>
            <div className="flex flex-col items-center text-center gap-6 relative group">
              <div className="w-20 h-20 rounded-2xl bg-black border border-white/10 text-emerald-400 flex items-center justify-center shadow-xl group-hover:border-emerald-500/50 group-hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all">
                <ShieldCheck className="w-10 h-10" />
              </div>
              <div>
                <h3 className="font-bold text-xl mb-2">3. Verified Payout</h3>
                <p className="text-muted-foreground leading-relaxed">League admins verify the result. If successful, funds are transferred securely.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 7. Community Feed Preview */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
          <div className="lg:col-span-5 sticky top-24">
            <h2 className="text-4xl font-black mb-6">The Social Heartbeat</h2>
            <p className="text-muted-foreground mb-8 text-lg leading-relaxed">
              Follow the moments, milestones, and athletes shaping the future of African sport. Real stories from real pitches, verified achievements, and community support in action.
            </p>
            <Button size="lg" className="w-full sm:w-auto bg-white text-black hover:bg-gray-200 font-bold" onClick={() => router.push('/feed')}>
              Join the Conversation
            </Button>
          </div>
          <div className="lg:col-span-7 space-y-6">
            {feedPreview.map(post => (
              <FeedCard key={post.id} post={post} />
            ))}
          </div>
        </section>

        {/* 8. GoalPlace Points & 9. Annual Awards */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/10 border border-amber-500/20 rounded-3xl p-10 flex flex-col items-start justify-between min-h-[400px]">
             <div>
               <div className="w-14 h-14 bg-amber-500/20 rounded-2xl flex items-center justify-center mb-6 border border-amber-500/30">
                 <Trophy className="w-7 h-7 text-amber-400" />
               </div>
               <h2 className="text-3xl font-black mb-4">GoalPlace Points</h2>
               <p className="text-muted-foreground text-lg mb-8 leading-relaxed max-w-md">
                 Earn loyalty points for every action on the platform. Support athletes, engage with content, and rise up the fan leaderboards to earn exclusive recognition.
               </p>
             </div>
             <Button variant="outline" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 hover:text-amber-300">
               Learn About Points
             </Button>
          </div>
          
          <div className="bg-gradient-to-bl from-purple-500/10 to-indigo-600/10 border border-purple-500/20 rounded-3xl p-10 flex flex-col items-start justify-between min-h-[400px]">
             <div>
               <div className="w-14 h-14 bg-purple-500/20 rounded-2xl flex items-center justify-center mb-6 border border-purple-500/30">
                 <Medal className="w-7 h-7 text-purple-400" />
               </div>
               <h2 className="text-3xl font-black mb-4">GoalPlace Annual Awards</h2>
               <p className="text-muted-foreground text-lg mb-8 leading-relaxed max-w-md">
                 The most prestigious grassroots sports awards in Uganda. Fans use their GoalPlace Points to cast votes for the best athletes, teams, and moments of the year.
               </p>
             </div>
             <Button variant="outline" className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:text-purple-300">
               View Awards Preview
             </Button>
          </div>
        </section>

        {/* 12. Trust and Compliance Section */}
        <section className="bg-secondary/30 rounded-3xl p-10 border border-white/5">
           <div className="max-w-3xl mx-auto text-center mb-10">
             <Shield className="w-12 h-12 text-emerald-500 mx-auto mb-6" />
             <h2 className="text-3xl font-black mb-4">Built on Trust & Integrity</h2>
             <p className="text-muted-foreground text-lg">GoalPlace256 is dedicated to empowering athletes through direct, verifiable fan support. We operate with strict compliance and transparency.</p>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
             <div className="flex gap-4 items-start">
               <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-1" />
               <div>
                 <h4 className="font-bold text-lg mb-2">Direct Athlete Impact</h4>
                 <p className="text-sm text-muted-foreground leading-relaxed">Fans support athletes directly. There are no fan cash winnings. This platform is exclusively for funding and celebrating athletic performance.</p>
               </div>
             </div>
             <div className="flex gap-4 items-start">
               <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-1" />
               <div>
                 <h4 className="font-bold text-lg mb-2">Verified Performance</h4>
                 <p className="text-sm text-muted-foreground leading-relaxed">Rewards are paid to athletes only after verified performance. Achievements are strictly verified by designated league admins or officials.</p>
               </div>
             </div>
             <div className="flex gap-4 items-start">
               <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-1" />
               <div>
                 <h4 className="font-bold text-lg mb-2">Loyalty & Recognition</h4>
                 <p className="text-sm text-muted-foreground leading-relaxed">GoalPlace Points are loyalty and recognition points used for platform features and voting. They are not cash and cannot be withdrawn.</p>
               </div>
             </div>
             <div className="flex gap-4 items-start">
               <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0 mt-1" />
               <div>
                 <h4 className="font-bold text-lg mb-2">Not for Speculation</h4>
                 <p className="text-sm text-muted-foreground leading-relaxed">GoalPlace256 is a sports-tech community built for athlete support, empowerment, and league visibility, never for speculation.</p>
               </div>
             </div>
           </div>
        </section>

        {/* 13. Final CTA */}
        <section className="relative rounded-3xl overflow-hidden py-24 text-center">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-900 to-teal-900" />
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1518605368461-1e1e11415053?auto=format&fit=crop&q=80')] opacity-20 mix-blend-overlay bg-cover bg-center" />
          <div className="relative z-10 max-w-2xl mx-auto px-6">
            <h2 className="text-4xl md:text-5xl font-black mb-6 text-white">Ready to Shape the Game?</h2>
            <p className="text-xl text-emerald-100/80 mb-10">Join thousands of fans and athletes building the future of Ugandan grassroots sports.</p>
            <Button size="lg" className="h-14 px-10 text-lg bg-white text-emerald-950 hover:bg-emerald-50 font-black shadow-2xl" onClick={() => router.push('/register')}>
              Get Started Now
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
