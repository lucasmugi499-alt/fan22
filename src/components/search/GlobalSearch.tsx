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
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
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

function GlobalSearchDialog({ onClose, role }: { onClose: () => void; role: AppRole | null }) {
  const { athletes, teams, leagues, matches, seasons, loading } = useGoalPlaceData({
    collections: ['athletes', 'teams', 'leagues', 'matches', 'seasons'],
    recordLimit: 1_200,
  });
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const teamById = useMemo(() => new Map(teams.map((item) => [item.id, item])), [teams]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const records = useMemo<SearchResult[]>(() => [
    ...athletes.map((item) => ({
      id: `athlete-${item.id}`,
      title: item.name,
      meta: `Athlete / ${item.position} / ${item.city}`,
      href: `/athletes/${item.id}`,
      icon: PersonSimpleRun,
      terms: `${item.name} ${item.position} ${item.city} ${item.sport}`,
    })),
    ...teams.map((item) => ({
      id: `team-${item.id}`,
      title: item.name,
      meta: `Team / ${item.city} / ${item.sport}`,
      href: `/teams/${item.id}`,
      icon: SoccerBall,
      terms: `${item.name} ${item.city} ${item.sport}`,
    })),
    ...leagues.map((item) => ({
      id: `league-${item.id}`,
      title: item.name,
      meta: `League / ${item.city} / ${item.sport}`,
      href: `/leagues/${item.id}`,
      icon: Buildings,
      terms: `${item.name} ${item.city} ${item.sport} ${item.season}`,
    })),
    ...matches.map((item) => ({
      id: `match-${item.id}`,
      title: `${teamById.get(item.homeTeamId)?.name ?? 'Home'} vs ${teamById.get(item.awayTeamId)?.name ?? 'Away'}`,
      meta: `Match / ${item.venue} / ${new Date(item.scheduledAt).toLocaleDateString('en-GB')}`,
      href: `/matches/${item.id}`,
      icon: CalendarBlank,
      terms: `${teamById.get(item.homeTeamId)?.name ?? ''} ${teamById.get(item.awayTeamId)?.name ?? ''} ${item.venue} ${item.city}`,
    })),
    ...seasons.map((item) => ({
      id: `season-${item.id}`,
      title: item.name,
      meta: `Season / ${item.sport} / ${item.status}`,
      href: `/leagues/${item.leagueId}`,
      icon: CalendarBlank,
      terms: `${item.name} ${item.sport} ${item.status}`,
    })),
    ...actionsForRole(role),
  ], [athletes, leagues, matches, role, seasons, teamById, teams]);

  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const results = records
    .filter((item) => tokens.every((token) => `${item.title} ${item.terms}`.toLowerCase().includes(token)))
    .slice(0, 24);

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
        {!loading && results.length ? results.map((item) => {
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
        {!loading && !results.length ? (
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
