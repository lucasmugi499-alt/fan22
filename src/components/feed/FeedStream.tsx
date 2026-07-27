'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ListBullets, PencilSimpleLine } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { dataProvider } from '@/data/dataProvider';
import { mockProvider } from '@/data/providers/mockProvider';
import { adaptFeedPost } from '@/lib/firebase/useGoalPlaceData';
import { useAuth } from '@/context/AuthProvider';
import { useAuthGate } from '@/components/auth/AuthRequiredModal';
import { FeedPostCard } from '@/components/core/FeedPostCard';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import type { FeedPost } from '@/types';

const PAGE_SIZE = 24;

export function FeedStream() {
  const { currentUser, userProfile, isDemoMode } = useAuth();
  const { requireAuth } = useAuthGate();
  const provider = isDemoMode ? mockProvider : dataProvider;
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<Error>();
  const [composing, setComposing] = useState(false);
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);

  const loadPage = useCallback(async (afterId?: string) => {
    if (afterId) setLoadingMore(true);
    else setLoading(true);
    setError(undefined);
    try {
      const page = (await provider.getFeedPosts({ limit: PAGE_SIZE, afterId })).map(adaptFeedPost);
      setFeedPosts((current) => afterId
        ? [...new Map([...current, ...page].map((post) => [post.id, post])).values()]
        : page);
      setHasMore(page.length === PAGE_SIZE);
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error('The feed could not be loaded.'));
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [provider]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPage(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPage]);

  const posts = useMemo(
    () =>
      [...feedPosts]
        .filter((post) => post.status !== 'hidden')
        .sort((a, b) => +new Date(b.createdAt || b.timestamp || 0) - +new Date(a.createdAt || a.timestamp || 0)),
    [feedPosts],
  );

  function openComposer() {
    requireAuth(() => setComposing(true), 'Sign in to publish to the community feed.');
  }

  async function publish() {
    const userId = currentUser?.uid ?? userProfile?.uid;
    if (!userId || !caption.trim()) {
      toast.error('Add an update before publishing.');
      return;
    }
    setSaving(true);
    try {
      await provider.createFeedPost({
        authorId: userId,
        authorName: userProfile?.displayName ?? userProfile?.name ?? 'GoalPlace fan',
        authorRole: 'fan',
        authorType: 'Fan',
        type: 'fan_comment',
        caption: caption.trim(),
        verified: false,
      });
      setCaption('');
      setComposing(false);
      await loadPage();
      toast.success('Your community update is live.');
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'The update could not be published.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 w-full rounded-[var(--radius-lg)]" />)}</div>;
  }
  if (error && !posts.length) return <ErrorState description={error.message} onRetry={() => void loadPage()} />;

  return (
    <div className="-mx-[var(--gutter)] md:mx-0">
      <div className="sticky top-[var(--topbar-h)] z-10 flex items-center justify-between gap-3 border-b border-border bg-surface-0/90 px-[var(--gutter)] py-3 md:static md:mb-3 md:rounded-[var(--radius-lg)] md:border md:bg-surface-1 md:bezel-core md:px-4">
        <h1 className="text-lg font-semibold text-text-strong">Feed</h1>
        <Button size="sm" icon={PencilSimpleLine} onClick={openComposer}>Post</Button>
      </div>

      {posts.length ? (
        <>
          <div className="md:space-y-3">
            {posts.map((post) => <FeedPostCard key={post.id} post={post} />)}
          </div>
          {hasMore ? (
            <div className="flex justify-center px-[var(--gutter)] py-5 md:px-0">
              <Button variant="secondary" disabled={loadingMore} onClick={() => void loadPage(feedPosts.at(-1)?.id)}>
                {loadingMore ? 'Loading...' : 'Load more stories'}
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="px-[var(--gutter)] pt-4 md:px-0">
          <EmptyState icon={ListBullets} title="Nothing in the feed yet" description="Match previews, results and highlights from teams and athletes will show up here." action={<Button size="sm" onClick={openComposer}>Publish the first update</Button>} />
        </div>
      )}

      <Sheet
        open={composing}
        onClose={() => setComposing(false)}
        title="Community update"
        description="Share useful local sports news. Official results and statistics remain controlled by verification."
        footer={<Button block icon={Check} onClick={publish} disabled={saving}>{saving ? 'Publishing...' : 'Publish update'}</Button>}
      >
        <label className="block text-xs font-semibold uppercase text-subtle">
          Update
          <textarea
            className="field mt-2 min-h-36 py-3 normal-case"
            value={caption}
            onChange={(event) => setCaption(event.target.value)}
            maxLength={800}
            placeholder="Share a fixture, venue tip, community story, or encouragement."
          />
        </label>
        <p className="mt-3 text-xs text-muted">Fan updates are community content and never change official records, rankings, or verification.</p>
      </Sheet>
    </div>
  );
}
