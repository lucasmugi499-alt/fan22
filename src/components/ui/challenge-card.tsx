'use client';

import React from 'react';
import { Challenge } from '@/types';
import { GlassCard } from './glass-card';
import { Button } from './button';
import { CheckmarkCircle01Icon, Coins01Icon } from 'hugeicons-react';
import { Users } from '@phosphor-icons/react';
import { formatUGX, getInitials, getSportTheme } from '@/lib/sportThemes';
import { ImageWithFallback } from './image-with-fallback';
import { SportBadge, StatusExplainerChip } from './product';
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
  const achieved = challenge.status === 'achieved';

  return (
    <GlassCard glow={challenge.status === 'open'} className={`rounded-xl p-4 ${theme.edgeClass}`}>
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
            <StatusExplainerChip domain="challenge" status={challenge.status} />
            <StatusExplainerChip domain="challenge" status={challenge.verificationStatus} />
          </div>
          <h4 className="text-sm font-black leading-snug text-white">{challenge.targetDescription}</h4>
          <p className="mt-1 text-xs text-slate-400">{athlete.name}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/8 bg-black/20 p-3">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Pledged</p>
          <div className="mt-1 flex items-center gap-1 text-sm font-black text-white">
            <Coins01Icon className="size-3.5" style={{ color: theme.color }} />
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

      {challenge.status === 'open' ? (
        <Button className="mt-4 w-full" onClick={onSupport}>
          Pledge Support
        </Button>
      ) : (
        <Button disabled variant="outline" className="mt-4 w-full">
          <CheckmarkCircle01Icon className="size-4" />
          {achieved ? 'Challenge Achieved' : 'Challenge Closed'}
        </Button>
      )}
      <p className="mt-3 text-xs leading-5 text-slate-400">
        Performance support is held until verification, then released or refunded.
      </p>
    </GlassCard>
  );
}
