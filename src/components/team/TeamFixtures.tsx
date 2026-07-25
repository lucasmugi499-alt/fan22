'use client';

import { useMemo, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import {
  resolveMyTeam,
  matchesForTeam,
  upcomingForTeam,
  pendingActions,
} from '@/lib/team/teamContext';
import { isOfficialMatch } from '@/lib/status';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { MatchCard } from '@/components/core/MatchCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ResultSubmissionSheet } from '@/components/team/ResultSubmissionSheet';
import type { Match } from '@/types';

const TABS = ['Needs action', 'Upcoming', 'Results'] as const;
type Tab = (typeof TABS)[number];

export function TeamFixtures() {
  const { userProfile, isDemoMode } = useAuth();
  const { teams, matches, loading } = useGoalPlaceData();
  const [tab, setTab] = useState<Tab>('Needs action');
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);

  const team = useMemo(() => resolveMyTeam(userProfile, teams, matches, isDemoMode), [userProfile, teams, matches, isDemoMode]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const buckets = useMemo(() => {
    if (!team) return { 'Needs action': [], Upcoming: [], Results: [] } as Record<Tab, Match[]>;
    const results = matchesForTeam(team.id, matches)
      .filter((m) => m.status === 'completed')
      .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
    return {
      'Needs action': pendingActions(team.id, matches).map((a) => a.match),
      Upcoming: upcomingForTeam(team.id, matches),
      Results: results,
    } as Record<Tab, Match[]>;
  }, [team, matches]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" />
        <Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }

  const list = buckets[tab];

  return (
    <div className="-mx-[var(--gutter)] md:mx-0">
      <div className="mb-4">
        <h1 className="px-[var(--gutter)] pb-3 text-xl font-semibold text-text-strong md:px-0">Fixtures</h1>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} className="md:px-0" />
      </div>

      <div className="px-[var(--gutter)] md:px-0">
        {list.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.map((m) => {
              const actionable = m.status !== 'scheduled' && !isOfficialMatch(m);
              return (
                <MatchCard
                  key={m.id}
                  match={m}
                  home={teamById.get(m.homeTeamId)}
                  away={teamById.get(m.awayTeamId)}
                  onClick={actionable ? () => setActiveMatch(m) : undefined}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={CalendarBlank}
            title={emptyTitle(tab)}
            description={emptyBody(tab)}
          />
        )}
      </div>

      {team && activeMatch ? (
        <ResultSubmissionSheet
          open
          onClose={() => setActiveMatch(null)}
          match={activeMatch}
          home={teamById.get(activeMatch.homeTeamId)}
          away={teamById.get(activeMatch.awayTeamId)}
          myTeamId={team.id}
        />
      ) : null}
    </div>
  );
}

function emptyTitle(tab: Tab): string {
  if (tab === 'Needs action') return 'Nothing needs you';
  if (tab === 'Upcoming') return 'No upcoming fixtures';
  return 'No results yet';
}
function emptyBody(tab: Tab): string {
  if (tab === 'Needs action') return 'Results waiting on you to submit, confirm or dispute will show here.';
  if (tab === 'Upcoming') return 'Scheduled matches appear here once the league publishes them.';
  return 'Played matches appear here. Each stays pending until the opponent confirms it, then it turns official.';
}
