'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { RoleNav } from '@/lib/nav';
import { activeHref } from './navActive';

/**
 * Desktop global nav: a vertical rail replacing the mobile bottom nav. Same destinations,
 * same active logic — one nav model, two form factors.
 */
export function DesktopRail({ nav }: { nav: RoleNav }) {
  const pathname = usePathname();
  const all = [...nav.primary, ...nav.more];
  const active = activeHref(pathname, all);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface-1 md:flex">
      <div className="flex h-14 items-center gap-2 px-5">
        <span className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] bg-brand text-on-brand text-sm font-bold">
          G
        </span>
        <span className="font-display text-[15px] font-semibold text-text-strong">GoalPlace256</span>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-2">
        <RailGroup destinations={nav.primary} active={active} />
        <div className="my-3 h-px bg-border" />
        <RailGroup destinations={nav.more} active={active} muted />
      </nav>
    </aside>
  );
}

function RailGroup({
  destinations,
  active,
  muted = false,
}: {
  destinations: RoleNav['primary'];
  active: string | null;
  muted?: boolean;
}) {
  return (
    <ul className="space-y-1">
      {destinations.map((d) => {
        const isActive = d.href.split('?')[0] === active;
        const Icon = d.icon;
        return (
          <li key={d.href}>
            <Link
              href={d.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium transition-colors duration-[var(--dur-micro)]',
                isActive
                  ? 'bg-brand-subtle text-brand'
                  : muted
                    ? 'text-subtle hover:bg-surface-3 hover:text-text-strong'
                    : 'text-muted hover:bg-surface-3 hover:text-text-strong'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" weight={isActive ? 'fill' : 'regular'} />
              {d.name}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
