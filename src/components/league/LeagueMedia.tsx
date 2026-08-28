'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague } from '@/lib/league/leagueContext';
import { Skeleton } from '@/components/ui/Skeleton';
import { NoAssignment } from '@/components/ui/NoAssignment';

/**
 * League media.
 *
 * Media is visual, so this is a grid rather than a table of filenames. It currently reads the
 * league's published posts; uploading and moderation run through the media moderation
 * commands and are not yet wired to this surface.
 */
export function LeagueMedia() {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['leagues'] });
  const league = useMemo(
    () => resolveMyLeague(userProfile, catalog.leagues, [], isDemoMode, accessContext),
    [userProfile, catalog.leagues, isDemoMode, accessContext],
  );
  const feed = useGoalPlaceData({
    collections: ['feedPosts'],
    scope: { leagueId: league?.id ?? 'goalplace-pending' },
    recordLimit: 60,
  });

  if (catalog.loading || feed.loading) return <Skeleton className="h-64 w-full rounded-[var(--radius-lg)]" />;
  if (!league) return <NoAssignment kind="league" />;

  const posts = feed.feedPosts.filter((post) => post.relatedLeagueId === league.id);

  return (
    <div className="space-y-5">
      <header>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">Media</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text-strong sm:text-3xl">
          League media
        </h1>
        <p className="mt-1 text-sm text-muted">{league.name}</p>
      </header>

      {posts.length ? (
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {posts.map((post) => (
            <li
              key={post.id}
              className="overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface-1"
            >
              <Thumbnail src={post.mediaURL ?? post.mediaUrl} />
              <p className="line-clamp-2 p-2.5 text-xs leading-5 text-muted">{post.caption}</p>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center">
          <p className="text-base font-semibold text-text-strong">No league media yet.</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">
            Match photography and league announcements appear here once they are published.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * A media thumbnail.
 *
 * A plain `img` rather than `next/image`: league media is uploaded to arbitrary remote hosts,
 * and the optimizer would need every one of them allow-listed in advance. A missing image is
 * a placeholder rather than a broken frame.
 */
function Thumbnail({ src }: { src?: string }) {
  if (!src) return <div className="aspect-square bg-surface-2" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" className="aspect-square w-full bg-surface-2 object-cover" />
  );
}
