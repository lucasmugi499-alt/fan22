'use client';

import React from 'react';
import { Challenge } from '@/lib/types';
import { GlassCard } from './glass-card';
import { Button } from './button';
import { CheckCircle2, Coins, ShieldCheck, Users } from 'lucide-react';
import { formatUGX, getInitials, getSportTheme } from '@/lib/sportThemes';
import { ImageWithFallback } from './image-with-fallback';
import { SportBadge } from './product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';

interface ChallengeCardProps {
  challenge: Challenge;
  onSupport?: () => void;
}

export function ChallengeCard({ challenge, onSupport }: ChallengeCardProps) {
  const { athletes } = useGoalPlaceData();
  const athlete = athletes.find((item) => item.id === challenge.athleteId);
  if (!athlete) return null;

  const theme = getSportTheme(athlete.sport);
  const achieved = challenge.status === 'Achieved';

  return (
    <GlassCard glow={challenge.status === 'Active'} className={`rounded-xl p-4 ${theme.edgeClass}`}>
      <div className="flex items-start gap-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/8">
          <ImageWithFallback
            src={athlete.avatarUrl}
            alt={athlete.name}
            fallbackType="athlete"
            initials={getInitials(athlete.name)}
            sport={athlete.sport}
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <SportBadge sport={athlete.sport} />
            {challenge.verificationStatus === 'Verified' && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-[var(--goal-emerald)]/25 bg-[var(--goal-emerald)]/10 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--goal-mint)]">
                <ShieldCheck className="size-3" />
                Verified
              </span>
            )}
          </div>
          <h4 className="text-sm font-black leading-snug text-white">{challenge.targetDescription}</h4>
          <p className="mt-1 text-xs text-slate-400">{athlete.name}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/8 bg-black/20 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Pledged</p>
          <div className="mt-1 flex items-center gap-1 text-sm font-black text-white">
            <Coins className="size-3.5" style={{ color: theme.color }} />
            {formatUGX(challenge.totalPledged)}
          </div>
        </div>
        <div className="rounded-lg border border-white/8 bg-black/20 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Supporters</p>
          <div className="mt-1 flex items-center gap-1 text-sm font-black text-white">
            <Users className="size-3.5 text-[var(--goal-gold)]" />
            {challenge.supportersCount}
          </div>
        </div>
      </div>

      {challenge.status === 'Active' ? (
        <Button className="mt-4 w-full" onClick={onSupport}>
          Pledge Support
        </Button>
      ) : (
        <Button disabled variant="outline" className="mt-4 w-full">
          <CheckCircle2 className="size-4" />
          {achieved ? 'Challenge Achieved' : 'Challenge Closed'}
        </Button>
      )}
    </GlassCard>
  );
}
