'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Buildings,
  CalendarBlank,
  MagnifyingGlass,
  PersonSimpleRun,
  SoccerBall,
  Wrench,
} from '@phosphor-icons/react';
import { Sheet } from '@/components/ui/Sheet';
import { Skeleton } from '@/components/ui/Skeleton';
import type { AppRole } from '@/types';
import type { IconComponent } from '@/lib/icons';

type SearchResult = {
  id: string;
  title: string;
  meta: string;
  href: string;
  icon: IconComponent;
  terms: string;
};

export function GlobalSearch({
  open,
  onClose,
  role,
}: {
  open: boolean;
  onClose: () => void;
  role: AppRole | null;
}) {
  if (!open) return null;
  return <GlobalSearchDialog onClose={onClose} role={role} />;
}

const ICON_BY_TYPE: Record<string, SearchResult['icon']> = {
  athlete: PersonSimpleRun,
  team: SoccerBall,
  league: Buildings,
  season: CalendarBlank,
};

function GlobalSearchDialog({ onClose, role }: { onClose: () => void; role: AppRole | null }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /**
   * Queries the server-built search index.
   *
   * This previously loaded the first 60 records from each of five collections into the
   * browser and filtered them here. Those 60 were neither the most relevant nor the most
   * recent, so most athletes were unfindable — which reads to a fan as the platform not
   * having their player. The index covers every entity.
   */
  const term = query.trim();
  const searchable = term.length >= 2;

  useEffect(() => {
    if (!searchable) return;

    let cancelled = false;
    // Debounced so a typed word is one request rather than one per keystroke.
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
        const body = await response.json().catch(() => ({ results: [] }));
        if (cancelled) return;
        setResults((body.results ?? []).map((item: {
          type: string;
          entityId: string;
          title: string;
          meta: string;
          href: string;
        }) => ({
          id: `${item.type}-${item.entityId}`,
          title: item.title,
          meta: item.meta,
          href: item.href,
          icon: ICON_BY_TYPE[item.type] ?? CalendarBlank,
          terms: '',
        })));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchable, term]);

  const lowered = term.toLowerCase();
  // Role actions stay client-side: they are navigation, not catalogue records.
  const actions = useMemo(
    () => actionsForRole(role).filter((action) =>
      !lowered || `${action.title} ${action.terms}`.toLowerCase().includes(lowered)),
    [lowered, role],
  );
  // Below the minimum query length nothing has been searched for yet.
  const visible = searchable ? [...actions, ...results].slice(0, 24) : actions.slice(0, 24);

  return (
    <Sheet open onClose={onClose} title="Search GoalPlace256" description="Athletes, teams, leagues, matches, venues, seasons, and actions">
      <label className="relative block">
        <MagnifyingGlass className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Start typing..."
          className="h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 pl-10 pr-3 text-sm text-text-strong"
        />
      </label>

      <div className="mt-4 max-h-[58dvh] space-y-1 overflow-y-auto">
        {loading ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />) : null}
        {!loading && visible.length ? visible.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              onClick={onClose}
              className="flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 hover:bg-surface-2"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand">
                <Icon className="h-4 w-4" weight="bold" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text-strong">{item.title}</span>
                <span className="block truncate text-xs text-muted">{item.meta}</span>
              </span>
            </Link>
          );
        }) : null}
        {!loading && !visible.length ? (
          <p className="py-8 text-center text-sm text-muted">No matching records.</p>
        ) : null}
      </div>
    </Sheet>
  );
}

function actionsForRole(role: AppRole | null): SearchResult[] {
  const actions: SearchResult[] = [
    { id: 'action-discover', title: 'Discover athletes and leagues', meta: 'Action', href: '/discover', icon: Wrench, terms: 'discover search browse' },
  ];
  if (role === 'team_admin') {
    actions.push(
      { id: 'action-result', title: 'Submit a match result', meta: 'Team Admin action', href: '/team-admin/fixtures', icon: Wrench, terms: 'submit result match field mode' },
      { id: 'action-roster', title: 'Manage team roster', meta: 'Team Admin action', href: '/team-admin/roster', icon: Wrench, terms: 'roster athlete manage' },
    );
  }
  if (role === 'league_admin') {
    actions.push(
      { id: 'action-fixture', title: 'Create fixtures', meta: 'League Admin action', href: '/league-admin/fixtures', icon: Wrench, terms: 'fixture create generate schedule' },
      { id: 'action-dispute', title: 'Review result disputes', meta: 'League Admin action', href: '/league-admin/verification', icon: Wrench, terms: 'dispute verify exception review' },
    );
  }
  if (role === 'platform_admin' || role === 'super_admin') {
    actions.push(
      { id: 'action-approval', title: 'Review approvals', meta: 'Platform action', href: '/admin/approvals', icon: Wrench, terms: 'approve review athlete league' },
      { id: 'action-trust', title: 'Open trust cases', meta: 'Platform action', href: '/admin/trust', icon: Wrench, terms: 'trust safety report case' },
    );
  }
  return actions;
}
