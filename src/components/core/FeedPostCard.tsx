'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Heart, ChatCircle, ShareFat, SealCheck, WarningCircle, PaperPlaneTilt, Trophy, Users } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { athletePhoto } from '@/lib/media';
import type { FeedPost, League, Team } from '@/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthProvider';
import { useAuthGate } from '@/components/auth/AuthRequiredModal';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import type { Comment } from '@/types';
import type { LeagueStanding } from '@/lib/leagueModel';

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

type FeedPostContext = {
  team?: Team;
  league?: League;
  teamStanding?: { row: LeagueStanding; rank: number } | null;
  officialMatches?: number;
};

/**
 * Feed engagement is optimistic, but every visible count is reconciled through the
 * provider. Failed actions roll back rather than leaving a local-only promise.
 */
export function FeedPostCard({ post, context }: { post: FeedPost; context?: FeedPostContext }) {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const { requireAuth } = useAuthGate();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(post.likesCount ?? post.likes ?? 0);
  const [commentsCount, setCommentsCount] = useState(post.commentsCount ?? post.comments ?? 0);
  const [shares, setShares] = useState(post.sharesCount ?? post.shares ?? 0);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const media = post.mediaUrl || post.mediaURL;
  const role = ROLE_LABEL[post.authorRole] ?? ROLE_LABEL[post.authorType?.toLowerCase() ?? ''] ?? 'Member';
  const avatar = athletePhoto({ id: post.authorId, name: post.authorName, teamId: post.relatedTeamId ?? post.authorId });
  const userId = currentUser?.uid ?? userProfile?.uid;
  const reacted = Boolean(userId) && liked;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    provider.getFeedReaction(post.id, userId)
      .then((reacted) => {
        if (!cancelled) setLiked(reacted);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [post.id, provider, userId]);

  function withAuth(action: () => void, message: string) {
    requireAuth(action, message);
  }

  async function toggleReaction() {
    if (!userId || saving) return;
    const next = !reacted;
    setLiked(next);
    setLikes((value) => Math.max(0, value + (next ? 1 : -1)));
    setSaving(true);
    try {
      const result = await provider.engageFeedPost({ action: 'reaction', postId: post.id, userId });
      const persisted = result.message === 'Reaction saved.';
      if (persisted !== next) {
        setLiked(persisted);
        setLikes((value) => Math.max(0, value + (persisted ? 1 : -1)));
      }
    } catch (cause) {
      setLiked(!next);
      setLikes((value) => Math.max(0, value + (next ? -1 : 1)));
      toast.error(cause instanceof Error ? cause.message : 'Reaction could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function openComments() {
    setCommentsOpen(true);
    setCommentsLoading(true);
    try {
      setComments(await provider.getCommentsByPost(post.id));
    } catch {
      toast.error('Comments could not be loaded.');
    } finally {
      setCommentsLoading(false);
    }
  }

  async function publishComment() {
    if (!userId || !commentText.trim() || saving) return;
    setSaving(true);
    try {
      await provider.engageFeedPost({ action: 'comment', postId: post.id, userId, text: commentText.trim() });
      setCommentText('');
      setCommentsCount((value) => value + 1);
      setComments(await provider.getCommentsByPost(post.id));
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Comment could not be published.');
    } finally {
      setSaving(false);
    }
  }

  async function sharePost() {
    if (!userId || saving) return;
    setSaving(true);
    try {
      if (navigator.share) {
        await navigator.share({ title: post.authorName, text: post.caption, url: `${window.location.origin}/feed?post=${post.id}` });
      } else {
        await navigator.clipboard.writeText(`${window.location.origin}/feed?post=${post.id}`);
        toast.success('Post link copied.');
      }
      const result = await provider.engageFeedPost({ action: 'share', postId: post.id, userId });
      if (result.message !== 'Share already recorded.') setShares((value) => value + 1);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      toast.error(cause instanceof Error ? cause.message : 'Share could not be recorded.');
    } finally {
      setSaving(false);
    }
  }

  async function reportPost() {
    if (!userId || saving) return;
    const reason = window.prompt('What should the trust team review?');
    if (!reason?.trim()) return;
    setSaving(true);
    try {
      await provider.engageFeedPost({ action: 'report', postId: post.id, userId, reason: reason.trim() });
      toast.success('Report sent to the trust team.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Report could not be sent.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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

          <FeedContextStrip context={context} />

          {media && !userProfile?.lowDataMode ? (
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
              type="button"
              onClick={() => withAuth(() => void toggleReaction(), 'Sign in to react to community updates.')}
              className={cn('flex items-center gap-1.5 text-xs transition-colors hover:text-[var(--state-live)]', reacted && 'text-[var(--state-live)]')}
            >
              <Heart className="h-4 w-4" weight={reacted ? 'fill' : 'regular'} />
              <span className="tabular tabular-nums">{likes}</span>
            </button>
            <button type="button" onClick={() => void openComments()} className="flex items-center gap-1.5 text-xs hover:text-text">
              <ChatCircle className="h-4 w-4" />
              <span className="tabular tabular-nums">{commentsCount}</span>
            </button>
            <button type="button" onClick={() => withAuth(() => void sharePost(), 'Sign in to share community updates.')} className="flex items-center gap-1.5 text-xs hover:text-text">
              <ShareFat className="h-4 w-4" />
              <span className="tabular tabular-nums">{shares}</span>
            </button>
            <button type="button" aria-label="Report post" onClick={() => withAuth(() => void reportPost(), 'Sign in to report community content.')} className="ml-auto text-xs hover:text-[var(--state-pending)]">
              <WarningCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </article>
    <Sheet
      open={commentsOpen}
      onClose={() => setCommentsOpen(false)}
      title="Comments"
      description="Community discussion does not change official records."
      footer={
        <div className="flex gap-2">
          <input
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            maxLength={600}
            placeholder="Add a constructive comment"
            className="field min-w-0 flex-1"
          />
          <Button icon={PaperPlaneTilt} aria-label="Publish comment" disabled={saving || !commentText.trim()} onClick={() => withAuth(() => void publishComment(), 'Sign in to comment.')} />
        </div>
      }
    >
      {commentsLoading ? <p className="text-sm text-muted">Loading comments...</p> : null}
      {!commentsLoading && !comments.length ? <p className="text-sm text-muted">No comments yet.</p> : null}
      <div className="space-y-3">
        {comments.map((comment) => (
          <div key={comment.id} className="rounded-[var(--radius-md)] border border-border bg-surface-2 p-3">
            <p className="text-xs font-semibold text-text-strong">{comment.authorName}</p>
            <p className="mt-1 text-sm text-text">{comment.text}</p>
          </div>
        ))}
      </div>
    </Sheet>
    </>
  );
}

function FeedContextStrip({ context }: { context?: FeedPostContext }) {
  const team = context?.team;
  const league = context?.league;
  if (!team && !league) return null;

  const primaryHref = team ? `/teams/${team.id}` : `/leagues/${league?.id}`;
  const primaryName = team?.name ?? league?.name ?? 'Competition';
  const leagueName = league?.name ?? 'League';

  return (
    <Link
      href={primaryHref}
      className="mt-3 flex min-w-0 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2 text-xs transition-colors hover:border-border-strong"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-3 text-brand">
        {team ? <Trophy className="h-4 w-4" weight="bold" /> : <Users className="h-4 w-4" weight="bold" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-text-strong">{primaryName}</span>
        <span className="block truncate text-subtle">{team ? leagueName : 'Official league context'}</span>
      </span>
      {context?.teamStanding ? (
        <span className="shrink-0 text-right tabular-nums">
          <span className="block font-bold text-brand">#{context.teamStanding.rank}</span>
          <span className="text-[10px] uppercase text-subtle">{context.teamStanding.row.points} pts</span>
        </span>
      ) : (
        <span className="shrink-0 text-right tabular-nums">
          <span className="block font-bold text-text-strong">{context?.officialMatches ?? 0}</span>
          <span className="text-[10px] uppercase text-subtle">official</span>
        </span>
      )}
    </Link>
  );
}
