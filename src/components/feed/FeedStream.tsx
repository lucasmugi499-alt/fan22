'use client';

import { useMemo } from 'react';
import { ListBullets, PencilSimpleLine } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { FeedPostCard } from '@/components/core/FeedPostCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export function FeedStream() {
  const { feedPosts, loading } = useGoalPlaceData({
    collections: ['feedPosts'],
    feedLimit: 50,
  });
  const posts = useMemo(
    () =>
      [...feedPosts]
        .filter((p) => p.status !== 'hidden')
        .sort((a, b) => +new Date(b.createdAt || b.timestamp || 0) - +new Date(a.createdAt || a.timestamp || 0)),
    [feedPosts]
  );

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-[var(--radius-lg)]" />)}</div>;
  }

  return (
    <div className="-mx-[var(--gutter)] md:mx-0">
      {/* Composer */}
      <div className="sticky top-[var(--topbar-h)] z-10 flex items-center justify-between gap-3 border-b border-border bg-surface-0/90 px-[var(--gutter)] py-3 md:static md:mb-3 md:rounded-[var(--radius-lg)] md:border md:bg-surface-1 md:bezel-core md:px-4">
        <h1 className="text-lg font-semibold text-text-strong">Feed</h1>
        <button
          onClick={() => toast('Posting to the feed arrives in the next build step.')}
          className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-brand px-4 py-2 text-sm font-semibold text-on-brand shadow-[var(--glow-brand)]"
        >
          <PencilSimpleLine className="h-4 w-4" weight="bold" /> Post
        </button>
      </div>

      {posts.length ? (
        <div className="md:space-y-3">
          {posts.map((p) => <FeedPostCard key={p.id} post={p} />)}
        </div>
      ) : (
        <div className="px-[var(--gutter)] pt-4 md:px-0">
          <EmptyState icon={ListBullets} title="Nothing in the feed yet" description="Match previews, results and highlights from teams and athletes will show up here." />
        </div>
      )}
    </div>
  );
}
