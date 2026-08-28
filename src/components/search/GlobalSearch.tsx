'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { useAuth } from '@/context/AuthProvider';
import {
  boundCommandPaletteItems,
  demoEntityPaletteItems,
  platformStaticPaletteItems,
  rankPlatformPalette,
} from '@/lib/platform/palette';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { cn } from '@/lib/utils';

type SearchResult = {
  id: string;
  title: string;
  meta: string;
  href: string;
  icon: IconComponent;
  terms: string;
  kind?: string;
  commandId?: string;
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
  destination: Buildings,
  tab: CalendarBlank,
  command: Wrench,
  case: Wrench,
  match: SoccerBall,
  application: Buildings,
};

function GlobalSearchDialog({ onClose, role }: { onClose: () => void; role: AppRole | null }) {
  const router = useRouter();
  const { currentUser, isDemoMode } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const platformRole = role === 'platform_admin' || role === 'super_admin';
  /**
   * Demo mode has no server-built `searchIndex`, so the palette reads the seeded
   * collections directly. Requested only for the Platform palette in demo mode; every other
   * caller passes an empty list and loads nothing.
   */
  const demoEntities = useGoalPlaceData({
    collections: platformRole && isDemoMode ? ['leagues', 'teams', 'athletes', 'users'] : [],
    recordLimit: 500,
  });

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
    if (!platformRole && !searchable) return;

    let cancelled = false;
    // Debounced so a typed word is one request rather than one per keystroke.
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        if (platformRole && isDemoMode) {
          const entities = demoEntityPaletteItems({
            leagues: demoEntities.leagues,
            teams: demoEntities.teams,
            athletes: demoEntities.athletes,
            people: demoEntities.users,
          });
          const items = rankPlatformPalette([
            ...platformStaticPaletteItems(),
            ...entities,
            ...boundCommandPaletteItems(rankPlatformPalette(entities, term, 3)),
          ], term);
          if (!cancelled) setResults(items.map((item) => ({
            id: item.id,
            title: item.title,
            meta: item.meta,
            href: item.commandId ? `${item.href}?command=${encodeURIComponent(item.commandId)}` : item.href,
            icon: ICON_BY_TYPE[item.kind] ?? CalendarBlank,
            terms: item.terms.join(' '),
            kind: item.kind,
            commandId: item.commandId,
          })));
          return;
        }
        const token = platformRole ? await currentUser?.getIdToken() : null;
        if (platformRole && !token) throw new Error('Sign in again to search the Platform Console.');
        const response = await fetch(
          platformRole
            ? `/api/platform/palette?q=${encodeURIComponent(term)}`
            : `/api/search?q=${encodeURIComponent(term)}`,
          { headers: token ? { authorization: `Bearer ${token}` } : undefined },
        );
        const body = await response.json().catch(() => ({ results: [] }));
        if (!response.ok) throw new Error(body.error ?? 'Search is unavailable.');
        if (cancelled) return;
        setResults((body.results ?? []).map((item: {
          type: string;
          kind?: string;
          entityId: string;
          id?: string;
          title: string;
          meta: string;
          href: string;
          terms?: string[];
          commandId?: string;
        }) => ({
          id: item.id ?? `${item.type}-${item.entityId}`,
          title: item.title,
          meta: item.meta,
          href: item.commandId ? `${item.href}${item.href.includes('?') ? '&' : '?'}command=${encodeURIComponent(item.commandId)}` : item.href,
          icon: ICON_BY_TYPE[item.kind ?? item.type] ?? CalendarBlank,
          terms: item.terms?.join(' ') ?? '',
          kind: item.kind ?? item.type,
          commandId: item.commandId,
        })));
      } catch (cause) {
        if (!cancelled) {
          setResults([]);
          setError(cause instanceof Error ? cause.message : 'Search is unavailable.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, platformRole ? 120 : 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [currentUser, demoEntities, isDemoMode, platformRole, searchable, term]);

  const lowered = term.toLowerCase();
  // Role actions stay client-side: they are navigation, not catalogue records.
  const actions = useMemo(
    () => actionsForRole(role).filter((action) =>
      !lowered || `${action.title} ${action.terms}`.toLowerCase().includes(lowered)),
    [lowered, role],
  );
  // Below the minimum query length nothing has been searched for yet.
  const visible = platformRole
    ? results.slice(0, 32)
    : searchable ? [...actions, ...results].slice(0, 24) : actions.slice(0, 24);
  const selectedIndex = Math.min(activeIndex, Math.max(0, visible.length - 1));

  function openResult(item: SearchResult) {
    onClose();
    router.push(item.href);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      mobileFullScreen={platformRole}
      title={platformRole ? 'Platform palette' : 'Search GoalPlace256'}
      description={platformRole ? 'Destinations, entities, cases, workspace tabs, and authorized commands' : 'Athletes, teams, leagues, matches, venues, seasons, and actions'}
    >
      <label className="relative block">
        <MagnifyingGlass className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => Math.min(visible.length - 1, index + 1));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex((index) => Math.max(0, index - 1));
            } else if (event.key === 'Enter' && visible[selectedIndex]) {
              event.preventDefault();
              openResult(visible[selectedIndex]);
            }
          }}
          role="combobox"
          aria-controls="global-search-results"
          aria-expanded="true"
          aria-activedescendant={visible[selectedIndex] ? `search-result-${visible[selectedIndex].id}` : undefined}
          placeholder={platformRole ? 'Find a league, case, tab, or command…' : 'Start typing...'}
          className="h-12 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 pl-10 pr-3 text-sm text-text-strong"
        />
      </label>

      {error ? <p role="alert" className="mt-3 text-sm text-[var(--state-error)]">{error}</p> : null}
      <div id="global-search-results" role="listbox" className="mt-4 max-h-[68dvh] space-y-1 overflow-y-auto">
        {loading ? Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-14 w-full" />) : null}
        {!loading && visible.length ? visible.map((item, index) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.id}
              id={`search-result-${item.id}`}
              role="option"
              aria-selected={index === selectedIndex}
              href={item.href}
              onClick={onClose}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-[var(--radius-md)] px-3 py-2 transition',
                index === selectedIndex ? 'bg-surface-2' : 'hover:bg-surface-2',
              )}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-subtle text-brand">
                <Icon className="h-4 w-4" weight="bold" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-text-strong">{item.title}</span>
                <span className="block truncate text-xs text-muted">{item.meta}{item.commandId ? ' · Enter opens command context' : ''}</span>
              </span>
            </Link>
          );
        }) : null}
        {!loading && !error && !visible.length ? (
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
      { id: 'action-approval', title: 'Review approvals', meta: 'Platform action', href: '/admin?tab=applications', icon: Wrench, terms: 'approve review athlete league' },
      { id: 'action-trust', title: 'Open trust cases', meta: 'Platform action', href: '/admin/integrity?tab=trust', icon: Wrench, terms: 'trust safety report case' },
    );
  }
  return actions;
}
