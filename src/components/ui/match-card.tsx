import React from 'react';
import { Match, Team } from '@/lib/types';
import { GlassCard } from './glass-card';
import { Badge } from './badge';
import { Button } from './button';
import { Calendar, MapPin } from 'lucide-react';
import { mockTeams } from '@/lib/mockData';

interface MatchCardProps {
  match: Match;
  onView?: () => void;
}

export function MatchCard({ match, onView }: MatchCardProps) {
  const teamA = mockTeams.find(t => t.id === match.teamAId);
  const teamB = mockTeams.find(t => t.id === match.teamBId);

  if (!teamA || !teamB) return null;

  const date = new Date(match.date);
  const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <GlassCard className="p-5 flex flex-col gap-4 cursor-pointer hover:bg-white/10 transition-colors" onClick={onView}>
      <div className="flex justify-between items-center">
        <Badge variant={match.status === 'Live' ? 'destructive' : 'secondary'} className="uppercase text-[10px] tracking-wider font-bold">
          {match.status}
        </Badge>
        <span className="text-xs text-muted-foreground">{match.sport}</span>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex flex-col items-center gap-2 flex-1">
          <img src={teamA.logoUrl} alt={teamA.name} className="w-12 h-12 rounded-full object-cover bg-white/10 p-1" />
          <span className="text-sm font-semibold text-center leading-tight">{teamA.name}</span>
        </div>

        <div className="flex flex-col items-center justify-center px-4">
          {match.status !== 'Upcoming' ? (
            <div className="text-2xl font-black font-mono tracking-widest text-primary glow-text">
              {match.teamAScore} - {match.teamBScore}
            </div>
          ) : (
            <div className="text-sm font-bold text-muted-foreground">VS</div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 flex-1">
          <img src={teamB.logoUrl} alt={teamB.name} className="w-12 h-12 rounded-full object-cover bg-white/10 p-1" />
          <span className="text-sm font-semibold text-center leading-tight">{teamB.name}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground mt-2 border-t border-white/5 pt-4">
        <div className="flex items-center gap-1"><Calendar className="w-3 h-3"/> {formattedDate}</div>
        <div className="flex items-center gap-1"><MapPin className="w-3 h-3"/> {match.venue}</div>
      </div>
      
      {match.verificationStatus === 'Verified' && (
        <div className="text-center text-xs text-primary font-semibold mt-2">Results Verified</div>
      )}
    </GlassCard>
  );
}
