'use client';

import React, { useState } from 'react';
import { FeedPost } from '@/lib/types';
import { GlassCard } from './glass-card';
import { VerificationBadge } from './verification-badge';
import { Award, Bookmark, HeartHandshake, MessageSquare, Share2, ShieldCheck } from 'lucide-react';
import { mockAthletes, mockLeagues, mockTeams } from '@/lib/mockData';
import { getInitials, getSportTheme, timeAgo } from '@/lib/sportThemes';
import { ImageWithFallback } from './image-with-fallback';
import { Button } from './button';
import { SportBadge } from './product';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FeedCardProps {
  post: FeedPost;
  onSupport?: () => void;
  onComment?: () => void;
  onViewProfile?: () => void;
  onViewMatch?: () => void;
}

function getAuthor(post: FeedPost) {
  if (post.authorType === 'Athlete') {
    const athlete = mockAthletes.find((item) => item.id === post.authorId);
    if (athlete) return { name: athlete.name, avatar: athlete.avatarUrl, role: athlete.position, hrefType: 'profile' };
  }
  if (post.authorType === 'Team') {
    const team = mockTeams.find((item) => item.id === post.authorId);
    if (team) return { name: team.name, avatar: team.logoUrl, role: 'Team', hrefType: 'team' };
  }
  if (post.authorType === 'League') {
    const league = mockLeagues.find((item) => item.id === post.authorId);
    if (league) return { name: league.name, avatar: league.logoUrl, role: 'League', hrefType: 'league' };
  }
  if (post.authorType === 'Sponsor') {
    return { name: 'GoalPlace Sponsor Desk', avatar: '', role: 'Sponsor', hrefType: 'sponsor' };
  }
  if (post.authorType === 'Admin') {
    return { name: 'GoalPlace256 Awards', avatar: '', role: 'Annual Awards', hrefType: 'awards' };
  }
  return { name: 'GoalPlace Fan', avatar: '', role: post.authorType, hrefType: 'profile' };
}

function prettyType(type: FeedPost['type']) {
  return type.replace(/([A-Z])/g, ' $1').trim();
}

export function FeedCard({ post, onSupport, onComment, onViewProfile, onViewMatch }: FeedCardProps) {
  const [saved, setSaved] = useState(false);
  const author = getAuthor(post);
  const theme = getSportTheme(post.sport);
  const showMatchAction = post.type === 'MatchResult';

  return (
    <GlassCard className={`rounded-xl p-0 transition-all duration-300 hover:border-white/20 ${theme.edgeClass}`}>
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="size-12 shrink-0 overflow-hidden rounded-xl border border-white/12 bg-white/8">
              <ImageWithFallback
                src={author.avatar}
                alt={author.name}
                fallbackType={post.authorType === 'Athlete' ? 'athlete' : 'team'}
                initials={getInitials(author.name)}
                sport={post.sport}
                className="h-full w-full object-cover"
              />
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h4 className="truncate font-heading text-base font-black text-white">{author.name}</h4>
                {post.verified && <VerificationBadge className="hidden sm:inline-flex" />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <span className="rounded-md border border-white/8 bg-white/5 px-2 py-0.5 font-bold text-slate-300">{author.role}</span>
                <SportBadge sport={post.sport} />
                <span>{timeAgo(post.timestamp)}</span>
              </div>
            </div>
          </div>
          {post.verified && (
            <div className="shrink-0 rounded-lg border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/10 p-2 text-[var(--goal-mint)]">
              <ShieldCheck className="size-5" />
            </div>
          )}
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/6 px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-white">
            <Award className="size-3" />
            {prettyType(post.type)}
          </span>
          {post.statsRow?.map((stat) => (
            <span key={stat} className="rounded-lg border border-[var(--goal-emerald)]/20 bg-[var(--goal-emerald)]/8 px-2 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--goal-mint)]">
              {stat}
            </span>
          ))}
        </div>

        <p className="text-sm leading-6 text-slate-100 sm:text-[15px]">{post.caption}</p>
      </div>

      <div className="relative aspect-[16/10] w-full overflow-hidden border-y border-white/8 bg-black/24 sm:aspect-video">
        <ImageWithFallback
          src={post.mediaUrl}
          alt={`${prettyType(post.type)} media`}
          fallbackType="stadium"
          sport={post.sport}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
      </div>

      <div className="grid grid-cols-4 border-b border-white/8 bg-white/[0.025] text-xs text-slate-300">
        <button className="flex min-w-0 items-center justify-center gap-1.5 px-2 py-3 font-bold transition-colors hover:bg-white/6 hover:text-[var(--goal-mint)]" onClick={onSupport}>
          <HeartHandshake className="size-4" />
          <span className="hidden sm:inline">Support</span>
        </button>
        <button className="flex min-w-0 items-center justify-center gap-1.5 px-2 py-3 font-bold transition-colors hover:bg-white/6 hover:text-white" onClick={onComment}>
          <MessageSquare className="size-4" />
          <span>{post.comments}</span>
        </button>
        <button
          className="flex min-w-0 items-center justify-center gap-1.5 px-2 py-3 font-bold transition-colors hover:bg-white/6 hover:text-white"
          onClick={() => toast.success('Share link copied')}
        >
          <Share2 className="size-4" />
          <span>{post.shares}</span>
        </button>
        <button
          className={cn('flex min-w-0 items-center justify-center gap-1.5 px-2 py-3 font-bold transition-colors hover:bg-white/6', saved ? 'text-[var(--goal-gold)]' : 'text-slate-300 hover:text-white')}
          onClick={() => {
            setSaved((value) => !value);
            toast.success(saved ? 'Post removed from saved' : 'Post saved');
          }}
        >
          <Bookmark className={cn('size-4', saved && 'fill-current')} />
          <span>Save</span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
          <HeartHandshake className="size-4" style={{ color: theme.color }} />
          {post.likes.toLocaleString()} community reactions
        </div>
        <Button variant="outline" size="sm" onClick={showMatchAction ? onViewMatch : onViewProfile}>
          {showMatchAction ? 'View Match' : 'View Profile'}
        </Button>
      </div>
    </GlassCard>
  );
}
