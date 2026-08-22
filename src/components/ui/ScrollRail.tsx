'use client';

import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A horizontal rail that admits it scrolls.
 *
 * The scrollbars on these rails are hidden deliberately — a visible one under a row of chips
 * looks like a rendering fault. The cost is that a rail whose last item is cut off by the
 * viewport reads as a rail that simply ends, and on a phone that is most of them: the sport
 * filters, the workspace tabs, the fixture rows.
 *
 * This restores the missing signal without restoring the scrollbar. The content is masked to
 * fade at whichever edge still has something behind it, and at neither edge when everything
 * fits — so the affordance can never become decoration that implies more content than there
 * is. The mask is used rather than a gradient overlay because it needs no knowledge of the
 * surface colour behind the rail, and these rails sit on several.
 */

/** How much of each overflowing edge is faded. Wide enough to read as cut off, not as blur. */
const FADE = '28px';

function maskImage(atStart: boolean, atEnd: boolean) {
  if (!atStart && !atEnd) return undefined;
  const leading = atStart ? `transparent 0, #000 ${FADE}` : '#000 0';
  const trailing = atEnd ? `#000 calc(100% - ${FADE}), transparent 100%` : '#000 100%';
  return `linear-gradient(to right, ${leading}, ${trailing})`;
}

type ScrollRailProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  /** Classes for the wrapper. Put borders and outer spacing here, not on the rail. */
  wrapperClassName?: string;
};

export function ScrollRail({ children, className, wrapperClassName, ...rest }: ScrollRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    const maxScroll = rail.scrollWidth - rail.clientWidth;
    // A pixel of tolerance. Sub-pixel layout leaves scrollLeft fractionally short of the
    // end, which would otherwise leave a fade sitting over nothing.
    setEdges((current) => {
      const next = { start: rail.scrollLeft > 1, end: maxScroll > 1 && rail.scrollLeft < maxScroll - 1 };
      return current.start === next.start && current.end === next.end ? current : next;
    });
  }, []);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    measure();
    rail.addEventListener('scroll', measure, { passive: true });
    // Both the rail and its contents can change width — a filter that removes chips changes
    // whether the rail overflows at all, without any scroll event to notice it by.
    const observer = new ResizeObserver(measure);
    observer.observe(rail);
    for (const child of Array.from(rail.children)) observer.observe(child);
    return () => {
      rail.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, children]);

  const mask = maskImage(edges.start, edges.end);

  return (
    <div className={cn('relative min-w-0', wrapperClassName)}>
      <div
        {...rest}
        ref={railRef}
        className={cn(
          'overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden',
          className,
        )}
        style={{ ...rest.style, maskImage: mask, WebkitMaskImage: mask }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * The snap rail used by every card carousel.
 *
 * `.snap-row` supplies the flex/snap/hidden-scrollbar behaviour; this adds the overflow
 * affordance to all of it at once, which is the reason the shared component exists rather
 * than the bare class it wraps.
 */
export function SnapRow({ children, className, ...rest }: ScrollRailProps) {
  return (
    <ScrollRail {...rest} className={cn('snap-row', className)}>
      {children}
    </ScrollRail>
  );
}
