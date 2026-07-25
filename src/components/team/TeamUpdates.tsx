'use client';

import { useMemo } from 'react';
import { Megaphone, PlusCircle } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyTeam } from '@/lib/team/teamContext';
import { FeedPostCard } from '@/components/core/FeedPostCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';

export function TeamUpdates() {
  const { userProfile, isDemoMode } = useAuth();
  const { teams, matches, feedPosts, loading } = useGoalPlaceData();

  const team = useMemo(() => resolveMyTeam(userProfile, teams, matches, isDemoMode), [userProfile, teams, matches, isDemoMode]);
  const posts = useMemo(() => {
    if (!team) return [];
    return feedPosts
      .filter((p) => p.relatedTeamId === team.id || p.authorId === team.id)
      .sort((a, b) => +new Date(b.createdAt || b.timestamp || 0) - +new Date(a.createdAt || a.timestamp || 0));
  }, [team, feedPosts]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
        <Skeleton className="h-24 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-strong">Updates</h1>
          <p className="text-sm text-muted">News, highlights and announcements from your team.</p>
        </div>
        <Button size="sm" icon={PlusCircle} onClick={() => toast('Publishing updates arrives in the next build step.')}>
          Publish
        </Button>
      </div>

      {posts.length ? (
        <div className="-mx-[var(--gutter)] md:mx-0 md:space-y-3">
          {posts.map((p) => (
            <FeedPostCard key={p.id} post={p} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Megaphone}
          title="No updates yet"
          description="Share match previews, results and athlete highlights here. Your supporters see them in their feed."
          action={<Button size="sm" icon={PlusCircle} onClick={() => toast('Publishing updates arrives in the next build step.')}>Publish your first update</Button>}
        />
      )}
    </div>
  );
}
