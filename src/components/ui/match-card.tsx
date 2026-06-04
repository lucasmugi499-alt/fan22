'use client';

import React from 'react';
import { Match } from '@/lib/types';
import { GlassCard } from './glass-card';
import { Badge } from './badge';
import { Button } from './button';
import { Calendar, MapPin, ShieldCheck, Users, Zap } from 'lucide-react';
import { mockChallenges, mockTeams } from '@/lib/mockData';
import { formatCompact, getInitials, getSportTheme } from '@/lib/sportThemes';
import { ImageWithFallback } from './image-with-fallback';
import { SportBadge } from './product';

interface MatchCardProps {
  match: Match;
  onView?: () => void;
}

function TeamLogo({ name, logoUrl, sport }: { name: string; logoUrl: string; sport: string }) {
  return (
    <div className="size-12 overflow-hidden rounded-xl border border-white/12 bg-white/8 p-0.5 sm:size-14">
      <ImageWithFallback
        src={logoUrl}
        alt={name}
        fallbackType="team"
        initials={getInitials(name)}
        sport={sport}
        className="h-full w-full rounded-[0.6rem] object-cover"
      />
    </div>
  );
}

export function MatchCard({ match, onView }: MatchCardProps) {
  const teamA = mockTeams.find((team) => team.id === match.teamAId);
  const teamB = mockTeams.find((team) => team.id === match.teamBId);

  if (!teamA || !teamB) return null;

  const theme = getSportTheme(match.sport);
  const date = new Date(match.date);
  const formattedDate = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formattedTime = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const activeChallenges = mockChallenges.filter((challenge) => challenge.matchId === match.id && challenge.status === 'Active');
  const supporterCount = activeChallenges.reduce((sum, challenge) => sum + challenge.supportersCount, 0);
  const statusTone = match.status === 'Live' ? 'destructive' : match.status === 'Completed' ? 'secondary' : 'outline';

  return (
    <GlassCard
      className={`group flex h-full cursor-pointer flex-col rounded-xl p-4 transition-all duration-300 hover:-translate-y-1 hover:border-white/20 ${theme.edgeClass}`}
      onClick={onView}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {match.status === 'Live' && <span className="size-2 rounded-full bg-red-400 shadow-[0_0_14px_rgba(248,113,113,0.9)]" />}
          <Badge variant={statusTone} className="h-6 rounded-lg text-[10px] font-black uppercase tracking-[0.16em]">
            {match.status}
          </Badge>
        </div>
        <SportBadge sport={match.sport} />
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 flex-col items-center gap-2">
          <TeamLogo name={teamA.name} logoUrl={teamA.logoUrl} sport={teamA.sport} />
          <span className="line-clamp-2 text-center text-xs font-black leading-tight text-white sm:text-sm">{teamA.name}</span>
        </div>

        <div className="flex min-w-[76px] flex-col items-center justify-center rounded-xl border border-white/10 bg-black/24 px-3 py-2">
          {match.status !== 'Upcoming' ? (
            <div className="font-heading text-2xl font-black tracking-tight text-white">
              {match.teamAScore} <span style={{ color: theme.color }}>-</span> {match.teamBScore}
            </div>
          ) : (
            <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">VS</div>
          )}
          <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{formattedTime}</span>
        </div>

        <div className="flex min-w-0 flex-col items-center gap-2">
          <TeamLogo name={teamB.name} logoUrl={teamB.logoUrl} sport={teamB.sport} />
          <span className="line-clamp-2 text-center text-xs font-black leading-tight text-white sm:text-sm">{teamB.name}</span>
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <Calendar className="size-3.5 text-slate-500" />
          <span>{formattedDate} at {formattedTime}</span>
        </div>
        <div className="flex items-center gap-2">
          <MapPin className="size-3.5 text-slate-500" />
          <span className="truncate">{match.venue}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/8 bg-white/5 p-2">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Challenges</p>
          <p className="mt-1 flex items-center gap-1 font-heading text-lg font-black text-white">
            <Zap className="size-4" style={{ color: theme.color }} />
            {activeChallenges.length}
          </p>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/5 p-2">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-500">Supporters</p>
          <p className="mt-1 flex items-center gap-1 font-heading text-lg font-black text-white">
            <Users className="size-4 text-[var(--goal-gold)]" />
            {formatCompact(supporterCount || teamA.supportPool / 10000)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
          <ShieldCheck className="size-4 text-[var(--goal-mint)]" />
          {match.verificationStatus}
        </div>
        <Button size="sm" variant={match.status === 'Live' ? 'default' : 'outline'} onClick={(event) => { event.stopPropagation(); onView?.(); }}>
          View Match
        </Button>
      </div>
    </GlassCard>
  );
}
