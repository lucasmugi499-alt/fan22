'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { DotsThreeOutline, X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import type { RoleNav } from '@/lib/nav';
import { activeHref } from './navActive';

/**
 * Mobile global nav: up to five primary destinations, with More only when lower-frequency
 * destinations exist. Platform uses five direct destinations; other roles keep four + More.
 */
export function BottomNav({ nav }: { nav: RoleNav }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const active = activeHref(pathname, [...nav.primary, ...nav.more]);
  const moreActive = nav.more.some((d) => d.href.split('?')[0] === active);

  return (
    <>
      <nav
        aria-label="Primary"
        className="glass fixed inset-x-0 bottom-0 z-40 border-t border-border pb-safe md:hidden"
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around">
          {nav.primary.map((d) => {
            const isActive = d.href.split('?')[0] === active;
            const Icon = d.icon;
            return (
              <li key={d.href} className="flex-1">
                <Link
                  href={d.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'group relative flex h-[var(--nav-h)] flex-col items-center justify-center gap-1 text-[11px] font-medium tap transition-colors duration-[var(--dur-micro)]',
                    isActive ? 'text-brand' : 'text-muted'
                  )}
                >
                  {isActive ? (
                    <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand shadow-[0_0_12px_var(--brand)]" aria-hidden />
                  ) : null}
                  <Icon
                    className="h-6 w-6 transition-transform duration-[var(--dur-micro)] ease-[var(--ease-fluid)] group-active:scale-90"
                    weight={isActive ? 'fill' : 'regular'}
                  />
                  {d.name}
                </Link>
              </li>
            );
          })}
          {nav.more.length ? <li className="flex-1">
            <button
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              className={cn(
                'relative flex h-[var(--nav-h)] w-full flex-col items-center justify-center gap-1 text-[11px] font-medium tap',
                moreActive ? 'text-brand' : 'text-muted'
              )}
            >
              {moreActive ? (
                <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brand shadow-[0_0_12px_var(--brand)]" aria-hidden />
              ) : null}
              <DotsThreeOutline className="h-6 w-6" weight={moreActive ? 'fill' : 'regular'} />
              More
            </button>
          </li> : null}
        </ul>
      </nav>

      {moreOpen && nav.more.length ? (
        <MoreSheet nav={nav} active={active} onClose={() => setMoreOpen(false)} />
      ) : null}
    </>
  );
}

function MoreSheet({
  nav,
  active,
  onClose,
}: {
  nav: RoleNav;
  active: string | null;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="More">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 motion-safe:animate-[fadeIn_var(--dur-micro)_ease-out]"
      />
      <div
        className="absolute inset-x-0 bottom-0 rounded-t-[var(--radius-xl)] border-t border-border bg-surface-1 pb-safe shadow-e3 motion-safe:animate-[sheetUp_var(--dur-drawer)_var(--ease-fluid)]"
      >
        <div className="flex items-center justify-between px-[var(--gutter)] pt-4">
          <p className="text-sm font-semibold text-text-strong">More</p>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface-3">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-2 p-[var(--gutter)]">
          {nav.more.map((d) => {
            const isActive = d.href.split('?')[0] === active;
            const Icon = d.icon;
            return (
              <li key={d.href}>
                <Link
                  href={d.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 py-3 text-sm font-medium tap',
                    isActive ? 'text-brand border-brand/40 bg-brand-subtle' : 'text-text-strong hover:bg-surface-3'
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted" />
                  {d.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
