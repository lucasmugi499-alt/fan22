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
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ResultSubmissionSheet } from '@/components/team/ResultSubmissionSheet';
import { useTeamConfirmationInbox } from '@/lib/resultSubmissionQueues';
import type { Match } from '@/types';

const TABS = ['Needs action', 'Upcoming', 'Results'] as const;
type Tab = (typeof TABS)[number];

export function TeamFixtures({ fieldMode = false }: { fieldMode?: boolean }) {
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['teams'] });
  const team = useMemo(() => resolveMyTeam(userProfile, catalog.teams, [], isDemoMode, accessContext), [userProfile, catalog.teams, isDemoMode, accessContext]);
  const detail = useGoalPlaceData({
    collections: ['matches'],
    scope: { teamId: team?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const teams = catalog.teams;
  const { matches, error, retry } = detail;
  const loading = catalog.loading || (Boolean(team) && detail.loading);
  const [tab, setTab] = useState<Tab>(fieldMode ? 'Needs action' : 'Needs action');
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const { items: confirmationInbox, error: inboxError, refresh: refreshInbox } =
    useTeamConfirmationInbox(team?.id);

  const buckets = useMemo(() => {
    if (!team) return { 'Needs action': [], Upcoming: [], Results: [] } as Record<Tab, Match[]>;
    const results = matchesForTeam(team.id, matches)
      .filter((m) => m.status === 'completed')
      .sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt));
    const confirmationIds = new Set(confirmationInbox.map((item) => item.matchId));
    const confirmations = confirmationInbox.flatMap((item) => {
      const match = matches.find((candidate) => candidate.id === item.matchId);
      return match ? [match] : [];
    });
    const remainingActions = pendingActions(team.id, matches)
      .map((action) => action.match)
      .filter((match) => !confirmationIds.has(match.id));
    return {
      'Needs action': [...confirmations, ...remainingActions],
      Upcoming: upcomingForTeam(team.id, matches),
      Results: results,
    } as Record<Tab, Match[]>;
  }, [confirmationInbox, team, matches]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" />
        <Skeleton className="h-28 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }
  if (error) return <ErrorState onRetry={retry} />;
  if (inboxError) return <ErrorState onRetry={refreshInbox} />;

  const list = buckets[tab];

  return (
    <div className={fieldMode ? 'mx-auto max-w-2xl space-y-4' : '-mx-[var(--gutter)] md:mx-0'}>
      <div className="mb-4">
        <h1 className="px-[var(--gutter)] pb-1 text-xl font-semibold text-text-strong md:px-0">
          {fieldMode ? 'Matchday field mode' : 'Fixtures'}
        </h1>
        {fieldMode ? (
          <p className="px-[var(--gutter)] text-sm text-muted md:px-0">
            Low-data reporting with large controls. Drafts remain on this device until submission succeeds.
          </p>
        ) : (
          <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} className="md:px-0" />
        )}
      </div>

      <div className="px-[var(--gutter)] md:px-0">
        {(fieldMode ? buckets['Needs action'] : list).length ? (
          <div className={fieldMode ? 'grid grid-cols-1 gap-4' : 'grid grid-cols-1 gap-3 md:grid-cols-2'}>
            {(fieldMode ? buckets['Needs action'] : list).map((m) => {
              const actionable = m.status !== 'scheduled' && !isOfficialMatch(m);
              return (
                <div key={m.id} className={fieldMode ? 'rounded-[var(--radius-lg)] border border-brand/30 bg-surface-1 p-2' : ''}>
                  <MatchCard
                    match={m}
                    home={teamById.get(m.homeTeamId)}
                    away={teamById.get(m.awayTeamId)}
                    onClick={actionable ? () => setActiveMatch(m) : undefined}
                  />
                  {fieldMode && actionable ? (
                    <button
                      type="button"
                      className="mt-2 min-h-14 w-full rounded-[var(--radius-md)] bg-brand px-4 text-base font-semibold text-on-brand"
                      onClick={() => setActiveMatch(m)}
                    >
                      Open match report
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={CalendarBlank}
            title={fieldMode ? 'No active match report' : emptyTitle(tab)}
            description={fieldMode ? 'Live, completed, and confirmation requests appear here when field action is required.' : emptyBody(tab)}
          />
        )}
      </div>

      {team && activeMatch ? (
        <ResultSubmissionSheet
          open
          onClose={() => setActiveMatch(null)}
          onComplete={() => {
            retry();
            void refreshInbox();
          }}
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
