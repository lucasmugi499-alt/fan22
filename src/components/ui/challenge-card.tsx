import React from 'react';
import { Challenge } from '@/lib/types';
import { GlassCard } from './glass-card';
import { Button } from './button';
import { Users, Coins } from 'lucide-react';
import { mockAthletes } from '@/lib/mockData';

interface ChallengeCardProps {
  challenge: Challenge;
  onSupport?: () => void;
}

export function ChallengeCard({ challenge, onSupport }: ChallengeCardProps) {
  const athlete = mockAthletes.find(a => a.id === challenge.athleteId);
  if (!athlete) return null;

  return (
    <GlassCard glow={challenge.status === 'Active'} className="p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <img src={athlete.avatarUrl} alt={athlete.name} className="w-10 h-10 rounded-full object-cover border border-primary/20" />
        <div className="flex-1">
          <h4 className="text-sm font-bold leading-tight mb-1">{challenge.targetDescription}</h4>
          <p className="text-xs text-muted-foreground">{athlete.name} • {athlete.sport}</p>
        </div>
      </div>
      
      <div className="bg-background/50 rounded-lg p-3 flex justify-between items-center mt-2 border border-white/5">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Total Pledged</p>
          <div className="flex items-center gap-1 text-primary font-bold text-sm">
            <Coins className="w-3 h-3" />
            {challenge.totalPledged.toLocaleString()} UGX
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Supporters</p>
          <div className="flex items-center justify-end gap-1 text-sm font-semibold">
            <Users className="w-3 h-3 text-muted-foreground" />
            {challenge.supportersCount}
          </div>
        </div>
      </div>

      {challenge.status === 'Active' ? (
        <Button className="w-full mt-1 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/50" onClick={onSupport}>
          Pledge Support
        </Button>
      ) : (
        <Button disabled variant="secondary" className="w-full mt-1 opacity-50">
          {challenge.status === 'Achieved' ? 'Goal Achieved' : 'Challenge Closed'}
        </Button>
      )}
    </GlassCard>
  );
}
