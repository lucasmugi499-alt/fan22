'use client';

import Link from 'next/link';
import { useState } from 'react';
import { athletePhoto } from '@/lib/media';
import { athleteLegalName, athleteRegisteredPosition } from '@/lib/athleteIdentity';
import type { Athlete } from '@/types';

/**
 * A club's whole squad, laid out so you can see it is whole.
 *
 * This replaces a horizontal scroll rail on the club page. The rail rendered every athlete, so
 * nothing was missing — but on a phone it showed two and a half cards, gave no count, and had
 * no affordance saying there was more to the right. A club with eighteen registered athletes
 * read as a club with three, which is the same failure as a truncated list: the interface knew
 * something the reader could not.
 *
 * A grid says how many there are before you scroll, and it says it in the heading. Where a
 * squad is long the tail is collapsed behind a control that names the number it is hiding,
 * because "and 14 more" is information and a fade at the edge of a rail is not.
 */

/** Enough to fill three rows on a phone before the fold becomes a real cost. */
const COLLAPSED = 12;

export function SquadGrid({
  athletes,
  title = 'Squad',
  emptyMessage = 'No athletes are registered to this club yet.',
}: {
  athletes: Athlete[];
  title?: string;
  emptyMessage?: string;
}) {
  const [expanded, setExpanded] = useState(false);

  /*
   * Shirt number first, then name. A squad list is read by number wherever numbers exist, and
   * an athlete registered without one belongs at the end rather than at the front under a
   * default of zero.
   */
  const ordered = [...athletes].sort((left, right) => {
    const leftNumber = (left as { squadNumber?: number }).squadNumber ?? Number.POSITIVE_INFINITY;
    const rightNumber = (right as { squadNumber?: number }).squadNumber ?? Number.POSITIVE_INFINITY;
    if (leftNumber !== rightNumber) return leftNumber - rightNumber;
    return athleteLegalName(left).localeCompare(athleteLegalName(right));
  });

  const visible = expanded ? ordered : ordered.slice(0, COLLAPSED);
  const hidden = ordered.length - visible.length;

  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-[15px] font-semibold text-text-strong">{title}</h2>
        {ordered.length ? (
          <p className="text-xs text-muted">
            <span data-numeric className="tabular-nums">{ordered.length}</span>
            {ordered.length === 1 ? ' athlete registered' : ' athletes registered'}
          </p>
        ) : null}
      </div>

      {ordered.length ? (
        <>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((athlete) => {
              const number = (athlete as { squadNumber?: number }).squadNumber;
              const position = athleteRegisteredPosition(athlete);
              return (
                <li key={athlete.id} className="min-w-0">
                  <Link
                    href={`/athletes/${encodeURIComponent(athlete.id)}`}
                    className="block overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface-1 bezel-core transition hover:border-border-strong"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-surface-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={athletePhoto(athlete)}
                        alt=""
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      {number ? (
                        <span
                          data-numeric
                          className="absolute left-2 top-2 grid h-6 min-w-6 place-items-center rounded-md bg-black/55 px-1 text-xs font-bold tabular-nums text-white"
                        >
                          {number}
                        </span>
                      ) : null}
                    </div>
                    <div className="p-2.5">
                      <p className="truncate text-sm font-semibold text-text-strong">
                        {athleteLegalName(athlete)}
                      </p>
                      <p className="truncate text-xs text-muted">{position || 'Squad member'}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {hidden > 0 || expanded ? (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="min-h-11 w-full rounded-[var(--radius-md)] border border-border text-sm font-semibold text-text-strong transition hover:border-border-strong"
            >
              {expanded ? 'Show fewer' : `Show all ${ordered.length} athletes`}
            </button>
          ) : null}
        </>
      ) : (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border p-6 text-center">
          <p className="text-sm leading-6 text-muted">{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}
