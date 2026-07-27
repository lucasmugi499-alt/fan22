'use client';

import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react/dist/ssr';
import { bannerImage } from '@/lib/media';
import type { FeedPost } from '@/types';
import { useAuth } from '@/context/AuthProvider';

const CATEGORY: Record<string, string> = {
  transfer: 'Transfers',
  club_news: 'Club News',
  match_report: 'Match Report',
  highlight: 'Highlights',
};

/**
 * The "From the Clubs" news rail: image-led cards with a category label, the way a broadcast
 * homepage surfaces stories. Real imagery, generous cards, horizontal scroll on mobile.
 */
export function NewsRow({ title, posts, badge, seeAllHref = '/feed' }: { title: string; posts: FeedPost[]; badge?: React.ReactNode; seeAllHref?: string }) {
  if (!posts.length) return null;
  const stories = posts.slice(0, 3);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-text-strong">
          {badge}
          {title}
        </h2>
        <Link href={seeAllHref} className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] bg-surface-2 px-3 py-1.5 text-xs font-medium text-muted hover:text-text-strong">
          See all <CaretRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <div className="sm:hidden">
        <div className="snap-row -mx-[var(--gutter)] px-[var(--gutter)]">
          {stories.map((post) => <NewsCard key={post.id} post={post} mobile />)}
        </div>
      </div>
      <div className="hidden gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((post) => <NewsCard key={post.id} post={post} />)}
      </div>
    </section>
  );
}

function NewsCard({ post, mobile = false }: { post: FeedPost; mobile?: boolean }) {
  const { userProfile } = useAuth();
  const category = CATEGORY[post.type] ?? 'News';
  const media = post.mediaUrl || post.mediaURL || bannerImage(post.id, category);

  return (
    <Link
      href="/feed"
      className={`group overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core ${
        mobile ? 'snap-item w-[82vw] max-w-80' : 'min-w-0'
      }`}
    >
      {!userProfile?.lowDataMode ? (
        <div className="aspect-[16/10] w-full overflow-hidden bg-surface-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={media} alt="" className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-fluid)] group-hover:scale-105" loading="lazy" />
        </div>
      ) : null}
      <div className="p-3.5">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-text-strong">{post.caption}</p>
        <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand">{category}</p>
      </div>
    </Link>
  );
}
