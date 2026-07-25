import Link from 'next/link';
import { athletePhoto } from '@/lib/media';
import type { Athlete } from '@/types';

/**
 * A horizontal, scroll-snap rail of people (a squad or a set of teammates) with real
 * photography, shirt number and position, the way a club or player page shows a roster.
 */
export function PeopleCarousel({ title, athletes, seeAllHref }: { title: string; athletes: Athlete[]; seeAllHref?: string }) {
  if (!athletes.length) return null;
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-text-strong">{title}</h2>
        {seeAllHref ? <Link href={seeAllHref} className="text-sm font-medium text-brand hover:underline">See all</Link> : null}
      </div>
      <div className="snap-row -mx-[var(--gutter)] px-[var(--gutter)] md:mx-0 md:px-0">
        {athletes.map((a, i) => {
          const photo = athletePhoto(a);
          return (
            <Link key={a.id} href={`/athletes/${a.id}`} className="snap-item w-[130px]">
              <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core">
                <div className="relative aspect-square w-full overflow-hidden bg-surface-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo} alt={a.name} className="h-full w-full object-cover" loading="lazy" />
                  <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-md bg-black/50 text-xs font-bold text-white">{i + 1}</span>
                </div>
                <div className="p-2.5">
                  <p className="truncate text-sm font-semibold text-text-strong">{a.name}</p>
                  <p className="truncate text-xs text-muted">{a.position}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
