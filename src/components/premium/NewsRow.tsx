import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react/dist/ssr';
import type { FeedPost } from '@/types';

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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {posts.slice(0, 3).map((p) => {
          const media = p.mediaUrl || p.mediaURL || `https://picsum.photos/seed/gp-news-${p.id}/480/300`;
          const cat = CATEGORY[p.type] ?? 'News';
          return (
            <Link key={p.id} href="/feed" className="group overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core">
              <div className="aspect-[16/10] w-full overflow-hidden bg-surface-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={media} alt="" className="h-full w-full object-cover transition-transform duration-500 ease-[var(--ease-fluid)] group-hover:scale-105" loading="lazy" />
              </div>
              <div className="p-3.5">
                <p className="line-clamp-2 text-sm font-semibold leading-snug text-text-strong">{p.caption}</p>
                <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-wide text-brand">{cat}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
