import Link from 'next/link';
import { ScrollRail } from '@/components/ui/ScrollRail';
import { cn } from '@/lib/utils';

export type WorkspaceTab = { id: string; label: string; href: string };

export function WorkspaceTabs({ label, tabs, active }: { label: string; tabs: WorkspaceTab[]; active: string }) {
  return (
    <nav aria-label={label} className="sticky top-[var(--topbar-h)] z-20 -mx-[var(--gutter)] border-b border-border bg-surface-0/95 px-[var(--gutter)] py-2 backdrop-blur md:static md:mx-0 md:rounded-[var(--radius-lg)] md:border md:bg-surface-1 md:px-2">
      <ScrollRail>
        <ul className="flex min-w-max gap-1">
          {tabs.map((tab) => {
            const selected = tab.id === active;
            return (
              <li key={tab.id}>
                <Link
                  href={tab.href}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'inline-flex min-h-11 items-center rounded-[var(--radius-md)] px-3.5 text-sm font-medium transition md:min-h-9',
                    selected ? 'bg-brand-subtle text-brand' : 'text-muted hover:bg-surface-2 hover:text-text-strong',
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </ScrollRail>
    </nav>
  );
}
