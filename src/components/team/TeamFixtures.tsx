'use client';

import { useMemo, useState } from 'react';
import { CalendarBlank } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyTeam, matchesForTeam } from '@/lib/team/teamContext';
import { isOfficialMatch, isStillToPlay } from '@/lib/status';
import { useNow } from '@/lib/useNow';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { MatchCard } from '@/components/core/MatchCard';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ClubResultSheet } from '@/components/team/ClubResultSheet';
import type { Match } from '@/types';
import { useTeamConsoleAccess } from '@/lib/team/useTeamConsoleAccess';

const TABS = ['Needs your account', 'Upcoming', 'Results'] as const;
type Tab = (typeof TABS)[number];

/**
 * A club's fixtures, in the three states a club actually thinks in.
 *
 * ## What changed under ADR-005
 *
 * This page was built on the V1 bilateral model: a "Needs action" tab of results waiting for
 * the club to submit or confirm, fed by a confirmation inbox, opening a submission sheet that
 * made agreement official. That model is retired, and the tab lied twice: it asked for an
 * action the authority model no longer granted, on a workflow that no longer existed.
 *
 * Now the first tab is "Needs your account" — played fixtures with no official result yet,
 * and scheduled ones whose kickoff has passed with nothing recorded. A club can say what it
 * saw. That account is evidence a League Admin may weigh, and the finalizer never reads it.
 * The Results tab holds official results, and a club that believes one is wrong opens a case
 * from it rather than editing anything.
 *
 *   Field Manager captures. League governs. Clubs report and dispute. GoalPlace finalizes.
 */
export function TeamFixtures() {
  const now = useNow();
  const { userProfile, isDemoMode, accessContext } = useAuth();
  const catalog = useGoalPlaceData({ collections: ['teams'] });
  const team = useMemo(
    () => resolveMyTeam(userProfile, catalog.teams, [], isDemoMode, accessContext),
    [userProfile, catalog.teams, isDemoMode, accessContext],
  );
  const detail = useGoalPlaceData({
    collections: ['matches'],
    scope: { teamId: team?.id ?? 'goalplace-pending' },
    recordLimit: 250,
  });
  const access = useTeamConsoleAccess(team?.id);
  const teams = catalog.teams;
  const { matches, error, retry } = detail;
  const loading = catalog.loading || (Boolean(team) && detail.loading);
  const [tab, setTab] = useState<Tab>('Needs your account');
  const [activeMatch, setActiveMatch] = useState<Match | null>(null);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const buckets = useMemo(() => {
    if (!team) return { 'Needs your account': [], Upcoming: [], Results: [] } as Record<Tab, Match[]>;
    const mine = matchesForTeam(team.id, matches);
    const byKickoffDesc = (a: Match, b: Match) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt);
    return {
      /*
       * Played and not yet official, or scheduled and never started. Both are matches the
       * league is still settling and the club was at, which is exactly when its account is
       * worth having and exactly when the platform otherwise has no way to hear it.
       */
      'Needs your account': mine
        .filter((m) => (m.status === 'completed' && !isOfficialMatch(m))
          || (m.status === 'scheduled' && !isStillToPlay(m, now)))
        .sort(byKickoffDesc),
      Upcoming: mine
        .filter((m) => isStillToPlay(m, now))
        .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt)),
      Results: mine.filter(isOfficialMatch).sort(byKickoffDesc),
    } as Record<Tab, Match[]>;
  }, [team, matches, now]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-1/2" />
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full rounded-[var(--radius-lg)]" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState onRetry={retry} />;
  if (!team) {
    return (
      <EmptyState
        icon={CalendarBlank}
        title="No club linked yet"
        description="Once your account is attached to a club, its fixtures appear here."
      />
    );
  }

  const list = buckets[tab];

  return (
    <div className="-mx-[var(--gutter)] space-y-4 md:mx-0">
      <div className="space-y-3 px-[var(--gutter)] md:px-0">
        <h1 className="text-xl font-semibold tracking-tight text-text-strong">Fixtures</h1>
        <SegmentedTabs tabs={TABS} active={tab} onChange={setTab} className="md:px-0" />
      </div>

      <div className="px-[var(--gutter)] md:px-0">
        {list.length ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {list.map((m) => {
              // Upcoming fixtures have nothing to report on. Everything else the club was at.
              const actionable = access.canReportResult && tab !== 'Upcoming';
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
            description={emptyBody(tab, access.canReportResult)}
          />
        )}
        {list.length && tab !== 'Upcoming' && access.canReportResult ? (
          <p className="mt-3 text-xs leading-5 text-muted">
            {tab === 'Results'
              ? 'Tap a result to dispute it. Your league rules; nothing is edited.'
              : 'Tap a match to record what your club saw. Your league weighs it when settling the result.'}
          </p>
        ) : null}
      </div>

      <ClubResultSheet
        match={activeMatch}
        team={team}
        opponent={activeMatch
          ? teamById.get(activeMatch.homeTeamId === team.id ? activeMatch.awayTeamId : activeMatch.homeTeamId)
          : undefined}
        onClose={() => setActiveMatch(null)}
        onDone={retry}
      />
    </div>
  );
}

function emptyTitle(tab: Tab): string {
  if (tab === 'Needs your account') return 'Nothing is waiting on your account';
  if (tab === 'Upcoming') return 'No upcoming fixtures';
  return 'No official results yet';
}

function emptyBody(tab: Tab, canReport: boolean): string {
  if (tab === 'Needs your account') {
    return canReport
      ? 'Played matches without an official result appear here, so your club can say what it saw while the league settles them.'
      : 'Played matches without an official result appear here. Your league settles them.';
  }
  if (tab === 'Upcoming') return 'Scheduled matches appear here once the league publishes them.';
  return 'A result appears here once the league finalizes it. Results are captured by the Field Manager or entered by the league; they are never set by a club.';
}
