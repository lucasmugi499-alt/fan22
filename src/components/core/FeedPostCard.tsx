'use client';

import { useState } from 'react';
import { Heart, ChatCircle, ShareFat, SealCheck } from '@phosphor-icons/react';
import { athletePhoto } from '@/lib/media';
import type { FeedPost } from '@/types';
import { cn } from '@/lib/utils';

function timeAgo(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(1, Math.floor((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const ROLE_LABEL: Record<string, string> = {
  athlete: 'Athlete',
  team: 'Team',
  team_admin: 'Team',
  league: 'League',
  league_admin: 'League',
  fan: 'Fan',
  platform_admin: 'GoalPlace',
  sponsor: 'Sponsor',
};

/**
 * A feed post, styled like a modern social timeline entry. Likes toggle locally (optimistic)
 * so the stream feels alive without a backend round-trip in demo mode.
 */
export function FeedPostCard({ post }: { post: FeedPost }) {
  const [liked, setLiked] = useState(false);
  const likes = (post.likesCount ?? post.likes ?? 0) + (liked ? 1 : 0);
  const comments = post.commentsCount ?? post.comments ?? 0;
  const shares = post.sharesCount ?? post.shares ?? 0;
  const media = post.mediaUrl || post.mediaURL;
  const role = ROLE_LABEL[post.authorRole] ?? ROLE_LABEL[post.authorType?.toLowerCase() ?? ''] ?? 'Member';
  const avatar = athletePhoto({ id: post.authorId, name: post.authorName, teamId: post.relatedTeamId ?? post.authorId });

  return (
    <article className="border-b border-border px-[var(--gutter)] py-4 transition-colors hover:bg-surface-1/40 md:rounded-[var(--radius-lg)] md:border md:bg-surface-1 md:bezel-core">
      <div className="flex gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatar} alt="" className="h-10 w-10 shrink-0 rounded-full bg-surface-3 object-cover" loading="lazy" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-sm">
            <span className="truncate font-semibold text-text-strong">{post.authorName}</span>
            {post.verified ? <SealCheck className="h-3.5 w-3.5 shrink-0 text-[var(--state-verified)]" weight="fill" /> : null}
            <span className="shrink-0 rounded-[var(--radius-pill)] bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-muted">{role}</span>
            <span className="shrink-0 text-subtle">· {timeAgo(post.createdAt || post.timestamp)}</span>
          </div>

          <p className="mt-1 whitespace-pre-wrap text-[15px] leading-snug text-text">{post.caption}</p>

          {post.statsRow && post.statsRow.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {post.statsRow.map((s, i) => (
                <span key={i} className="rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted">
                  {s}
                </span>
              ))}
            </div>
          ) : null}

          {media ? (
            <div className="mt-3 overflow-hidden rounded-[var(--radius-md)] border border-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={media} alt="" className="max-h-80 w-full object-cover" loading="lazy" />
            </div>
          ) : null}

          {post.supportAmount ? (
            <div className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border-glow)] bg-brand-subtle px-3 py-1.5 text-sm font-semibold text-brand">
              <span className="tabular tabular-nums">UGX {post.supportAmount.toLocaleString()}</span> supported
            </div>
          ) : null}

          <div className="mt-3 flex items-center gap-6 text-subtle">
            <button
              onClick={() => setLiked((v) => !v)}
              className={cn('flex items-center gap-1.5 text-xs transition-colors hover:text-[var(--state-live)]', liked && 'text-[var(--state-live)]')}
            >
              <Heart className="h-4 w-4" weight={liked ? 'fill' : 'regular'} />
              <span className="tabular tabular-nums">{likes}</span>
            </button>
            <span className="flex items-center gap-1.5 text-xs">
              <ChatCircle className="h-4 w-4" />
              <span className="tabular tabular-nums">{comments}</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs">
              <ShareFat className="h-4 w-4" />
              <span className="tabular tabular-nums">{shares}</span>
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
