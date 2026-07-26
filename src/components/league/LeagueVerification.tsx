'use client';

import { useMemo, useState } from 'react';
import { ShieldCheck } from '@phosphor-icons/react';
import { useAuth } from '@/context/AuthProvider';
import { useGoalPlaceData } from '@/lib/firebase/useGoalPlaceData';
import { resolveMyLeague, exceptionQueue } from '@/lib/league/leagueContext';
import { STATE } from '@/lib/statusSystem';
import { QueueItem } from '@/components/core/QueueItem';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { LeagueResolveSheet } from '@/components/league/LeagueResolveSheet';
import { useLeagueResultExceptions } from '@/lib/resultSubmissionQueues';
import type { LeagueException } from '@/lib/league/leagueContext';
import type { Match } from '@/types';

const KIND_STATE = {
  disputed: STATE.disputed,
  awaiting: STATE.awaiting_confirmation,
  live: STATE.live,
} as const;

const KIND_META: Record<LeagueException['kind'], string> = {
  disputed: 'The two teams disagree. Needs a league decision.',
  awaiting: 'Played, waiting on the opponent to confirm.',
  live: 'In progress right now.',
};

export function LeagueVerification({ compact = false }: { compact?: boolean }) {
  const { userProfile, isDemoMode } = useAuth();
  const { leagues, teams, matches, loading, retry } = useGoalPlaceData({
    collections: ['leagues', 'teams', 'matches'],
  });
  const [active, setActive] = useState<Match | null>(null);

  const league = useMemo(() => resolveMyLeague(userProfile, leagues, matches, isDemoMode), [userProfile, leagues, matches, isDemoMode]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const { items: submissionExceptions, error: queueError, refresh: refreshExceptions } =
    useLeagueResultExceptions(league?.id);
  const queue = useMemo(() => {
    if (!league) return [];
    const byMatchId = new Map(matches.map((match) => [match.id, match]));
    const resultQueue: LeagueException[] = submissionExceptions.flatMap((submission) => {
      const match = byMatchId.get(submission.matchId);
      if (!match) return [];
      return [{
        match,
        kind: submission.status === 'disputed' ? 'disputed' : 'awaiting',
      }];
    });
    const resultIds = new Set(resultQueue.map((item) => item.match.id));
    const liveQueue = exceptionQueue(league.id, matches).filter(
      (item) => item.kind === 'live' && !resultIds.has(item.match.id)
    );
    return [...resultQueue, ...liveQueue];
  }, [league, matches, submissionExceptions]);

  if (loading) {
    return (
      <div className="space-y-3">
        {!compact ? <Skeleton className="h-8 w-48" /> : null}
        <Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" />
        <Skeleton className="h-16 w-full rounded-[var(--radius-lg)]" />
      </div>
    );
  }
  if (queueError) return <ErrorState onRetry={refreshExceptions} />;

  const list = compact ? queue.slice(0, 3) : queue;

  return (
    <div className="space-y-4">
      {!compact ? (
        <div>
          <h1 className="text-xl font-semibold text-text-strong">Verification</h1>
          <p className="text-sm text-muted">
            Exceptions that need the league. Normal mutually-confirmed results settle on their own.
          </p>
        </div>
      ) : null}

      {list.length ? (
        <div className="space-y-2.5">
          {list.map(({ match, kind }) => {
            const home = teamById.get(match.homeTeamId);
            const away = teamById.get(match.awayTeamId);
            return (
              <QueueItem
                key={match.id}
                state={KIND_STATE[kind]}
                title={`${home?.name ?? 'Home'} vs ${away?.name ?? 'Away'}`}
                subtitle={KIND_META[kind]}
                meta={match.venue || match.city}
                onClick={() => setActive(match)}
              />
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={ShieldCheck}
          title="Queue is clear"
          description="No disputes or pending confirmations right now. Confirmed results are finalized automatically."
        />
      )}

      {active ? (
        <LeagueResolveSheet
          open
          onClose={() => setActive(null)}
          onComplete={() => {
            retry();
            void refreshExceptions();
          }}
          match={active}
          home={teamById.get(active.homeTeamId)}
          away={teamById.get(active.awayTeamId)}
        />
      ) : null}
    </div>
  );
}
