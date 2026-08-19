'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import type { NavGroup, RoleNav } from '@/lib/nav';
import { NAV_GROUP_ORDER } from '@/lib/nav';
import { activeHref } from './navActive';
import { GoalPlaceLockup } from '@/components/brand/GoalPlaceBrand';

/**
 * Desktop global nav: a vertical rail replacing the mobile bottom nav. Same destinations,
 * same active logic — one nav model, two form factors.
 */
export function DesktopRail({ nav }: { nav: RoleNav }) {
  const pathname = usePathname();
  const all = [...nav.primary, ...nav.more];
  const active = activeHref(pathname, all);
  const grouped = all.some((destination) => destination.group);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface-1 md:flex">
      <div className="flex h-14 items-center px-5">
        <GoalPlaceLockup size="sm" />
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-2">
        {grouped ? (
          <GroupedRail destinations={all} active={active} />
        ) : (
          <>
            <RailGroup destinations={nav.primary} active={active} />
            <div className="my-3 h-px bg-border" />
            <RailGroup destinations={nav.more} active={active} muted />
          </>
        )}
      </nav>
    </aside>
  );
}

function GroupedRail({
  destinations,
  active,
}: {
  destinations: RoleNav['primary'];
  active: string | null;
}) {
  // From nav.ts, so a new workspace cannot appear in the config and vanish from the rail.
  const groups: readonly NavGroup[] = NAV_GROUP_ORDER;
  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const items = destinations.filter((destination) => destination.group === group);
        if (!items.length) return null;
        return (
          <div key={group}>
            <p className="px-3 pb-1.5 text-[10px] font-semibold tracking-[0.18em] text-subtle">{group}</p>
            <RailGroup destinations={items} active={active} muted={group !== 'COMMAND'} />
          </div>
        );
      })}
      <div>
        <p className="px-3 pb-1.5 text-[10px] font-semibold tracking-[0.18em] text-subtle">ACCOUNT</p>
        <RailGroup destinations={destinations.filter((destination) => !destination.group)} active={active} muted />
      </div>
    </div>
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
