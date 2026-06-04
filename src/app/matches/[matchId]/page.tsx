'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { mockMatches, mockTeams, mockChallenges, mockAthletes } from '@/lib/mockData';
import { MatchCard } from '@/components/ui/match-card';
import { ChallengeCard } from '@/components/ui/challenge-card';
import { GlassCard } from '@/components/ui/glass-card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Users, Trophy } from 'lucide-react';
import Link from 'next/link';

export default function MatchDetailsPage() {
  const { matchId } = useParams();
  const match = mockMatches.find(m => m.id === matchId);

  if (!match) return <div className="p-8 text-center">Match not found</div>;

  const teamA = mockTeams.find(t => t.id === match.teamAId);
  const teamB = mockTeams.find(t => t.id === match.teamBId);
  const matchChallenges = mockChallenges.filter(c => c.matchId === match.id);

  return (
    <div className="container max-w-4xl mx-auto px-4 py-8 pb-24">
      <Link href="/matches" className="inline-flex items-center text-sm text-primary mb-6 hover:underline">
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Matches
      </Link>

      <div className="mb-8">
        <MatchCard match={match} />
      </div>

      <Tabs defaultValue="challenges" className="w-full">
        <TabsList className="w-full bg-white/5 border border-white/10 p-1 rounded-full mb-6">
          <TabsTrigger value="challenges" className="rounded-full flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Active Challenges</TabsTrigger>
          <TabsTrigger value="pools" className="rounded-full flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Team Pools</TabsTrigger>
          <TabsTrigger value="updates" className="rounded-full flex-1 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Match Updates</TabsTrigger>
        </TabsList>
        
        <TabsContent value="challenges" className="space-y-4">
          <h3 className="text-lg font-bold mb-4">Support Players Directly</h3>
          {matchChallenges.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {matchChallenges.map(c => <ChallengeCard key={c.id} challenge={c} />)}
            </div>
          ) : (
            <p className="text-muted-foreground">No active challenges for this match yet.</p>
          )}
        </TabsContent>
        
        <TabsContent value="pools">
          <h3 className="text-lg font-bold mb-4">Back the Teams</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[teamA, teamB].map(team => team && (
              <GlassCard key={team.id} className="p-6 text-center">
                <img src={team.logoUrl} alt={team.name} className="w-16 h-16 rounded-full mx-auto mb-4 border-2 border-primary/20" />
                <h4 className="font-bold text-lg mb-2">{team.name}</h4>
                <div className="bg-background/50 rounded-lg p-3 inline-block mb-4">
                  <p className="text-[10px] uppercase text-muted-foreground mb-1">Support Pool</p>
                  <p className="text-lg font-bold text-primary flex items-center gap-1 justify-center">
                    <Trophy className="w-4 h-4"/> {team.supportPool.toLocaleString()} UGX
                  </p>
                </div>
                <Button className="w-full bg-primary/20 text-primary hover:bg-primary/30">
                  Back Team
                </Button>
              </GlassCard>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="updates">
          <GlassCard className="p-8 text-center text-muted-foreground">
            {match.status === 'Live' ? 'Live updates will appear here.' : 'Match updates unavailable.'}
          </GlassCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
