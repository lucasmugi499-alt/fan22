'use client';

import React from 'react';
import { Athlete } from '@/types';
import { GlassCard } from './glass-card';
import { VerificationBadge } from './verification-badge';
import { Button } from './button';
import { ArrowUpRight01Icon, Location01Icon } from 'hugeicons-react';
import { Users } from '@phosphor-icons/react';
import { ImageWithFallback } from './image-with-fallback';
import { formatUGX, getInitials, getSportTheme } from '@/lib/sportThemes';
import { SportBadge } from './product';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';

interface AthleteCardProps {
  athlete: Athlete;
  onSupport?: () => void;
  onView?: () => void;
}

function getKeyStats(athlete: Athlete) {
  const entries = Object.entries(athlete.stats ?? {});
  if (athlete.sport === 'Football') {
    return [
      { label: 'Goals', value: athlete.stats.Goals ?? entries[0]?.[1] ?? '-' },
      { label: 'Assists', value: athlete.stats.Assists ?? entries[1]?.[1] ?? '-' },
    ];
  }
  if (athlete.sport === 'Basketball') {
    return [
      { label: 'Points', value: athlete.stats.Points ?? entries[0]?.[1] ?? '-' },
      { label: 'Rebounds', value: athlete.stats.Rebounds ?? entries[1]?.[1] ?? '-' },
    ];
  }
  return [
    { label: 'Tries', value: athlete.stats.Tries ?? entries[0]?.[1] ?? '-' },
    { label: 'Tackles', value: athlete.stats.Tackles ?? entries[1]?.[1] ?? '-' },
  ];
}

export function AthleteCard({ athlete, onSupport, onView }: AthleteCardProps) {
  const { teams } = useGoalPlaceData();
  const team = teams.find((item) => item.id === athlete.teamId);
  const theme = getSportTheme(athlete.sport);
  const keyStats = getKeyStats(athlete);

  return (
    <GlassCard
      className={`group flex h-full cursor-pointer flex-col rounded-xl p-0 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 ${theme.edgeClass}`}
      onClick={onView}
    >
      <div className="relative h-24 overflow-hidden sm:h-28">
        <ImageWithFallback
          src={athlete.coverUrl}
          alt={`${athlete.name} cover`}
          fallbackType="stadium"
          sport={athlete.sport}
          className="h-full w-full object-cover opacity-75 transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#05070A] via-[#05070A]/40 to-transparent" />
        <div className="absolute left-3 top-3">
          <SportBadge sport={athlete.sport} />
        </div>
      </div>

      <div className="relative flex flex-1 flex-col px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="-mt-8 mb-3 flex items-end justify-between gap-3">
          <div className="size-16 overflow-hidden rounded-xl border-2 border-[#05070A] bg-slate-900 shadow-xl">
            <ImageWithFallback
              src={athlete.avatarUrl}
              alt={athlete.name}
              fallbackType="athlete"
              initials={getInitials(athlete.name)}
              sport={athlete.sport}
              className="h-full w-full object-cover"
            />
          </div>
          {athlete.verified && <VerificationBadge className="mb-1 shrink-0 bg-white/8" />}
        </div>

        <div className="min-w-0">
          <h3 className="truncate font-display text-lg font-black leading-tight text-white transition-colors group-hover:text-[var(--goal-mint)]">
            {athlete.name}
          </h3>
          <p className="mt-1 flex items-center gap-1 truncate text-xs font-semibold text-slate-300">
            <Location01Icon className="size-3 text-slate-500" />
            {athlete.position} - {athlete.city}
          </p>
          <p className="mt-1 truncate text-xs text-slate-400">{team?.name}</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {keyStats.map((stat) => (
            <div key={stat.label} className="rounded-lg border border-white/8 bg-white/5 px-2.5 py-2">
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{stat.label}</p>
              <p className="mt-0.5 font-display text-lg font-black text-white">{stat.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-3 rounded-lg border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/8 px-3 py-2">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--goal-mint)]">Total Verified Support</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="font-display text-base font-black text-white">{formatUGX(athlete.totalEarnings ?? athlete.totalSupport ?? 0)}</p>
            <span className="flex items-center gap-1 text-xs font-bold text-slate-300">
              <Users className="size-3" />
              {athlete.supportersCount}
            </span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <Button
            size="sm"
            onClick={(event) => {
              event.stopPropagation();
              onSupport?.();
            }}
          >
            Support
          </Button>
          <Button
            variant="outline"
            size="icon-sm"
            aria-label={`View ${athlete.name}`}
            onClick={(event) => {
              event.stopPropagation();
              onView?.();
            }}
          >
            <ArrowUpRight01Icon className="size-4" />
          </Button>
        </div>
      </div>
    </GlassCard>
  );
}
