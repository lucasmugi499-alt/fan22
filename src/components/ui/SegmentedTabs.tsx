'use client';

import { cn } from '@/lib/utils';
import { ScrollRail } from '@/components/ui/ScrollRail';

/**
 * Workspace tabs — the *which section* layer, distinct from global nav (*where*) and
 * actions (*what*). A horizontal scroll-snap rail on mobile so any number of sections fit
 * without wrapping or overflowing the viewport; a plain row on desktop.
 */
export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: readonly T[];
  active: T;
  onChange: (tab: T) => void;
  className?: string;
}) {
  return (
    <ScrollRail
      role="group"
      aria-label="Workspace sections"
      // The border belongs to the wrapper: on the rail it would fade with the tabs at an
      // overflowing edge and read as the section rule breaking off. Everything callers pass
      // stays on the rail, where their gutter overrides apply.
      wrapperClassName="border-b border-border"
      className={cn('flex gap-1 px-[var(--gutter)]', className)}
    >
      {tabs.map((tab) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            aria-pressed={isActive}
            onClick={() => onChange(tab)}
            className={cn(
              'relative shrink-0 whitespace-nowrap px-3 py-3 text-sm font-medium transition-colors duration-[var(--dur-micro)]',
              isActive ? 'text-brand' : 'text-muted hover:text-text-strong'
            )}
          >
            {tab}
            <span
              className={cn(
                'absolute inset-x-2 -bottom-px h-0.5 rounded-full transition-opacity duration-[var(--dur-micro)]',
                isActive ? 'bg-brand opacity-100' : 'opacity-0'
              )}
            />
          </button>
        );
      })}
    </ScrollRail>
  );
}
